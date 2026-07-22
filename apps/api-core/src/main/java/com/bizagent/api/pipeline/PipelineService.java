package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.notification.NotificationSender;
import com.bizagent.api.trigger.MatchStatusTracker;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 파이프라인 오케스트레이션 (전부 Spring이 지휘, AI 호출만 ai-engine에 위임):
 * L3 적합성 설명 → L4 매칭 저장 → L5 리포트 생성 → 저장·push → 알림 (이슈 #29).
 * 진입점은 ProfileMatchTrigger — 이미 dedup 게이트를 통과한 "신규 매칭"만 넘어온다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PipelineService {

    private final JdbcTemplate jdbc;
    private final AiEngineClient aiEngine;
    private final NotificationSender notificationSender;
    private final PipelineWriter pipelineWriter;
    private final MatchStatusTracker statusTracker;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * @param profileId  대상 프로필
     * @param newMatches ProfileMatchTrigger 가 이미 알린 공고를 걸러낸 신규 매칭 (top ≤ 5). 비어있지 않음이 전제.
     */
    public long run(long profileId, List<Map<String, Object>> newMatches) {
        long t0 = System.currentTimeMillis();
        log.info("[profile={}] 파이프라인 시작 (신규매칭 {}건)", profileId, newMatches.size());

        Map<String, Object> profile = jdbc.queryForMap("""
            SELECT industry, entity_type, operating_period, monthly_revenue_band,
                   employee_band, region_sido, region_sigungu,
                   funding_purpose, tax_delinquency, overdue_status, funding_experience,
                   funding_amount_band, revenue_basis, nts_verified,
                   market_region_code, market_industry_code
            FROM business_profile WHERE id = ?
            """, profileId);
        Map<String, Object> marketContext = fetchMarketContext(profile);

        // L3 · 적합성 설명 (Sonnet) — 이 공고들이 왜 프로필에 맞는지 (공고 원문 포함 — 이슈 #61 ①)
        statusTracker.set(profileId, MatchStatusTracker.Stage.ANALYZING);
        Map<String, Object> analysis = aiEngine.analyze(profile, newMatches, marketContext);
        String fitText = (String) analysis.get("fit_text");
        // L3가 공고별로 생성한 근거(match_rationales)로 규칙 기반 evidence를 교체 (이슈 #79).
        // rationale이 없는(키 누락·빈 문자열) 매칭은 기존 규칙 기반 evidence를 그대로 유지.
        newMatches = mergeRationales(newMatches, analysis);
        log.info("[profile={}] L3 적합성 설명 완료 ({}ms)", profileId, System.currentTimeMillis() - t0);

        // L5 · 리포트 생성 (Sonnet). AI 호출은 둘 다 DB 트랜잭션 밖에서 끝낸다 —
        // /matching·/analysis·/report 는 최대 240초까지 걸릴 수 있어, 그 시간 동안
        // DB 커넥션을 붙잡아두지 않기 위함.
        // 이슈 #61 비용 관리 — L5엔 공고 원문(summary)을 다시 보내지 않는다. L3가 이미
        // 소화해서 fitText에 녹였으므로, L5는 링크·마감일 등 가벼운 필드만 있으면 충분하다.
        // 헤더 개인화용 최소 프로필 요약(이슈 #83) — 매출·직원수·체납 등은 헤더에 불필요하므로
        // industry/region_sido/region_sigungu 3개만 추린다(/matching이 최소 필드만 넘기는 컨벤션과 동일).
        statusTracker.set(profileId, MatchStatusTracker.Stage.GENERATING);
        String bodyMd = aiEngine.generateReport(fitText, stripSummary(newMatches), profileSummary(profile));
        log.info("[profile={}] L5 리포트 생성 완료 ({}ms)", profileId, System.currentTimeMillis() - t0);

        // L4 매칭 저장 + 리포트 저장·push + 알림 생성 + dedup 게이트 기록을 한 트랜잭션으로 커밋.
        // AI 호출이 이미 끝난 뒤라, 여기서 실패해도(예: DB 제약 위반) analysis_result/funding_match/
        // report가 절반만 남는 orphan 상태가 되지 않는다 — 전부 롤백된다.
        PipelineWriter.Result result = pipelineWriter.persist(profileId, fitText, newMatches, bodyMd);
        long reportId = result.reportId();

        // 카카오 나에게 보내기(미러, P1.5) — 순서: notification insert 후. 실패해도 파이프라인에 영향 없음.
        // (Sender 내부에서 이미 예외를 삼키지만 호출부에서도 이중 방어)
        try {
            notificationSender.send(profileId, result.notificationId(), reportId, "새 리포트가 도착했어요");
        } catch (Exception e) {
            log.warn("알림 미러 발송 호출 실패 (인앱 알림은 정상): {}", e.toString());
        }

        statusTracker.done(profileId, reportId);
        log.info("[profile={}] 파이프라인 종료 ({}ms, reportId={})", profileId, System.currentTimeMillis() - t0, reportId);
        // TODO(4주차): push 채널(웹푸시/알림톡 등) 연동
        return reportId;
    }

    /**
     * market_snapshot 최신 스냅샷을 상권 보조 근거로 조회한다(이슈 #29 결정 — 트리거엔 안 쓰고
     * 매칭 근거로만, 이슈 #61에서 실제 연결). 프로필에 상권 코드가 없으면(웹 온보딩은 아직
     * 코드 매핑 TODO) 조용히 생략 — L3가 market_context 없이도 정상 동작하도록 이미 설계돼 있다.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchMarketContext(Map<String, Object> profile) {
        Object regionCode = profile.get("market_region_code");
        Object industryCode = profile.get("market_industry_code");
        if (regionCode == null || industryCode == null) return null;
        try {
            String metricJson = jdbc.queryForObject("""
                SELECT metric::text FROM market_snapshot
                WHERE region_code = ? AND industry_code = ?
                ORDER BY collected_at DESC LIMIT 1
                """, String.class, regionCode, industryCode);
            return objectMapper.readValue(metricJson, Map.class);
        } catch (EmptyResultDataAccessException e) {
            return null;
        } catch (Exception e) {
            log.warn("market_context 조회 실패 — 생략하고 진행: {}", e.toString());
            return null;
        }
    }

    /**
     * L3 응답의 match_rationales(공고별 LLM 근거)로 각 매칭의 evidence를 교체한다 (이슈 #79).
     * 원본 맵을 mutate하지 않도록 stripSummary와 같이 복사본을 만든다. 해당 pblanc_id의
     * rationale이 없거나(키 누락) 비어있으면(null/공백) 규칙 기반 evidence를 그대로 유지한다.
     */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> mergeRationales(
            List<Map<String, Object>> matches, Map<String, Object> analysis) {
        Object raw = analysis == null ? null : analysis.get("match_rationales");
        Map<String, Object> rationales =
                raw instanceof Map ? (Map<String, Object>) raw : Map.of();
        List<Map<String, Object>> merged = new ArrayList<>();
        for (Map<String, Object> m : matches) {
            Map<String, Object> copy = new HashMap<>(m);
            Object r = rationales.get(String.valueOf(m.get("pblanc_id")));
            if (r instanceof String s && !s.isBlank()) {
                copy.put("evidence", s);
            }
            merged.add(copy);
        }
        return merged;
    }

    /** 이슈 #83 · 리포트 헤더 개인화용 최소 프로필 요약. 지역·업종은 하드코딩하지 않고
     *  프로필 컬럼에서 뽑는다. 값이 null이어도 그대로 포함(ai-engine이 없는 값은 무시). */
    private static Map<String, Object> profileSummary(Map<String, Object> profile) {
        Map<String, Object> summary = new HashMap<>();
        summary.put("industry", profile.get("industry"));
        summary.put("region_sido", profile.get("region_sido"));
        summary.put("region_sigungu", profile.get("region_sigungu"));
        return summary;
    }

    /** 이슈 #61 비용 관리 — L5(리포트 생성)엔 공고 원문(summary)을 다시 보내지 않는다. */
    private static List<Map<String, Object>> stripSummary(List<Map<String, Object>> matches) {
        List<Map<String, Object>> light = new ArrayList<>();
        for (Map<String, Object> m : matches) {
            Map<String, Object> copy = new HashMap<>(m);
            copy.remove("summary");
            light.add(copy);
        }
        return light;
    }
}
