package com.bizagent.api.trigger;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.pipeline.DataReadinessGate;
import com.bizagent.api.pipeline.PipelineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Array;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * L2 · 프로필 기반 정책자금 능동 매칭 트리거 (이슈 #29 — 임계값 TriggerEngine 대체).
 * 게이트: 프로필로 매칭 → 이미 알린 공고 제외 → 신규가 있을 때만 파이프라인 진행.
 * 업종·지역·고민은 전부 프로필 컬럼에서 온다(하드코딩 없음).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProfileMatchTrigger {

    private final JdbcTemplate jdbc;
    private final AiEngineClient aiEngine;
    private final PipelineService pipelineService;
    private final MatchStatusTracker statusTracker;
    private final DataReadinessGate dataReadinessGate;

    /** runForProfile 결과 요약 (컨트롤러 응답 조립용). reportId 는 신규 매칭이 없으면 null. */
    public record RunResult(long profileId, int newMatchCount, Long reportId) {}

    /** 자금 용도 코드 → 자연어 표현. 코드에 업종·지역을 하드코딩하는 것과는 다르게, 이건 온보딩
     * 질문 선택지 자체가 고정 어휘라 매핑이 정당하다(PRD §2 확장 가능성 대상은 업종·지역). */
    private static final Map<String, String> FUNDING_PURPOSE_LABEL = Map.of(
        "운영", "운영자금", "시설", "시설자금", "창업", "창업자금",
        "대환", "대환자금", "잘모름", "자금"
    );

    /**
     * 프로필의 업종·지역·자금 용도·체납/연체 신호를 짧은 자연어 요약으로 조립한다.
     * 값을 그대로 문자열 조합만 한다 — 업종·지역 목록을 코드에 하드코딩하지 않는다.
     * 예: "마포구에서 카페/디저트를 운영 중이며 운영자금, 시설자금 마련이 필요하고 최근 대출 연체를 겪고 있습니다"
     */
    public String buildQuery(Map<String, Object> profile) {
        String industry = str(profile.get("industry"));
        String sigungu = str(profile.get("region_sigungu"));
        String sido = str(profile.get("region_sido"));
        List<String> fundingPurpose = toList(profile.get("funding_purpose"));
        String taxDelinquency = str(profile.get("tax_delinquency"));
        String overdueStatus = str(profile.get("overdue_status"));

        String place = !sigungu.isBlank() ? sigungu : sido;
        StringBuilder sb = new StringBuilder();
        if (!place.isBlank()) sb.append(place).append("에서 ");
        sb.append(industry).append("를 운영 중");

        List<String> clauses = new ArrayList<>();
        if (!fundingPurpose.isEmpty()) {
            String purposes = fundingPurpose.stream()
                .map(p -> FUNDING_PURPOSE_LABEL.getOrDefault(p, p))
                .distinct()
                .reduce((a, b) -> a + ", " + b)
                .orElse("");
            clauses.add(purposes + " 마련이 필요");
        }
        // 실제 저장값은 영문 enum이 아니라 온보딩 화면5/6 선택지 그대로의 한글 문자열이다
        // (TAX_OPTIONS = ["없음","있음","잘 모름"], OVERDUE_OPTIONS = ["없음","있었지만 해결","현재 연체 중","잘 모름"]).
        // "NONE"/"RESOLVED" 같은 영문 리터럴과 비교하면 항상 거짓만 아니게(=항상 참) 되어 모든 프로필에
        // 체납·연체 문구가 붙는 버그였다 — 실제 선택지 문자열로 비교해야 한다.
        if ("있음".equals(taxDelinquency)) {
            clauses.add("세금 체납 문제가 있");
        }
        if ("현재 연체 중".equals(overdueStatus)) {
            clauses.add("최근 대출 연체를 겪고 있");
        }

        if (!clauses.isEmpty()) {
            sb.append("이며 ");
            for (int i = 0; i < clauses.size(); i++) {
                sb.append(clauses.get(i));
                sb.append(i == clauses.size() - 1 ? "습니다" : ", ");
            }
        } else {
            sb.append("입니다");
        }
        return sb.toString();
    }

    /**
     * 프로필 1건에 대해 능동 매칭을 실행한다 (온보딩 직후 · 데모 check · 일일 배치 공용 진입점).
     * 신규 매칭이 없으면 분석·리포트·알림을 전부 스킵한다 — 이것이 트리거 게이트다.
     */
    public RunResult runForProfile(long profileId) {
        Map<String, Object> profile = jdbc.queryForMap("""
            SELECT industry, region_sido, region_sigungu, funding_purpose, tax_delinquency, overdue_status
            FROM business_profile WHERE id = ?
            """, profileId);

        String query = buildQuery(profile);
        statusTracker.set(profileId, MatchStatusTracker.Stage.SEARCHING);
        // 기동 시 자동 수집이 도는 중이면 인덱스가 채워질 때까지 대기(상한 3분) — 빈 인덱스로 매칭 방지.
        // 실 데이터가 이미 있으면 게이트는 즉시 통과라 지연이 없다(이슈 #70).
        dataReadinessGate.awaitReady(Duration.ofMinutes(3));
        List<Map<String, Object>> matches = aiEngine.match(query, profile);

        Set<String> alreadyNotified = new HashSet<>(jdbc.queryForList(
            "SELECT pblanc_id FROM profile_funding_alert WHERE profile_id = ?", String.class, profileId));

        List<Map<String, Object>> newMatches = new ArrayList<>();
        for (Map<String, Object> m : matches) {
            if (!alreadyNotified.contains(String.valueOf(m.get("pblanc_id")))) {
                newMatches.add(m);
            }
        }

        if (newMatches.isEmpty()) {
            log.info("[profile={}] 신규 매칭 없음 (매칭 {}건 전부 기알림) — 스킵", profileId, matches.size());
            statusTracker.noMatch(profileId);
            return new RunResult(profileId, 0, null);
        }

        log.info("[profile={}] 신규 매칭 {}건 → 파이프라인 진행", profileId, newMatches.size());
        long reportId = pipelineService.run(profileId, newMatches);
        return new RunResult(profileId, newMatches.size(), reportId);
    }

    private static String str(Object v) {
        return v == null ? "" : v.toString();
    }

    /** TEXT[] 컬럼(funding_purpose 등) → List<String>. JdbcTemplate 은 이를 java.sql.Array(PgArray)로 돌려준다. */
    @SuppressWarnings("unchecked")
    private static List<String> toList(Object v) {
        if (v == null) return List.of();
        if (v instanceof List<?> list) return (List<String>) list;
        if (v instanceof Array sqlArray) {
            try {
                List<String> out = new ArrayList<>();
                for (Object o : (Object[]) sqlArray.getArray()) {
                    if (o != null) out.add(o.toString());
                }
                return out;
            } catch (SQLException e) {
                return List.of();
            }
        }
        return List.of();
    }
}
