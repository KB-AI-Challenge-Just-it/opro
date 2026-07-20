package com.bizagent.api.trigger;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.pipeline.PipelineService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Array;
import java.sql.SQLException;
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

    /** runForProfile 결과 요약 (컨트롤러 응답 조립용). reportId 는 신규 매칭이 없으면 null. */
    public record RunResult(long profileId, int newMatchCount, Long reportId) {}

    /**
     * 프로필의 업종·지역·고민을 짧은 자연어 요약으로 조립한다.
     * 값을 그대로 문자열 조합만 한다 — 업종·지역 목록을 코드에 하드코딩하지 않는다.
     * 예: "마포구에서 카페/디저트을 운영 중이며 주변 경쟁 심화, 자금 조달 어려움을 겪고 있습니다"
     */
    public String buildQuery(Map<String, Object> profile) {
        String industry = str(profile.get("industry"));
        String sigungu = str(profile.get("region_sigungu"));
        String sido = str(profile.get("region_sido"));
        List<String> concerns = toList(profile.get("concerns"));

        String place = !sigungu.isBlank() ? sigungu : sido;
        StringBuilder sb = new StringBuilder();
        if (!place.isBlank()) sb.append(place).append("에서 ");
        sb.append(industry).append("을 운영 중");
        if (!concerns.isEmpty()) {
            sb.append("이며 ").append(String.join(", ", concerns)).append("을 겪고 있습니다");
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
            SELECT industry, region_sido, region_sigungu, concerns
            FROM business_profile WHERE id = ?
            """, profileId);

        String query = buildQuery(profile);
        List<Map<String, Object>> matches = aiEngine.match(query);

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
            return new RunResult(profileId, 0, null);
        }

        log.info("[profile={}] 신규 매칭 {}건 → 파이프라인 진행", profileId, newMatches.size());
        long reportId = pipelineService.run(profileId, newMatches);
        return new RunResult(profileId, newMatches.size(), reportId);
    }

    private static String str(Object v) {
        return v == null ? "" : v.toString();
    }

    /** concerns(TEXT[]) → List<String>. JdbcTemplate 은 이를 java.sql.Array(PgArray)로 돌려준다. */
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
