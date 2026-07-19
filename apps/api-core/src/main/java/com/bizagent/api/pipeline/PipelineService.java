package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.notification.NotificationSender;
import com.bizagent.api.trigger.TriggerEngine.TriggerEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 파이프라인 오케스트레이션 (전부 Spring이 지휘, AI 호출만 ai-engine에 위임):
 * L3 원인분석 → (Claude 판단에 따라 L4 매칭) → L5 리포트 생성 → 저장·push
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PipelineService {

    private final JdbcTemplate jdbc;
    private final AiEngineClient aiEngine;
    private final NotificationSender notificationSender;

    public long run(TriggerEvent ev) {
        Map<String, Object> profile = jdbc.queryForMap("""
            SELECT industry, entity_type, operating_period, monthly_revenue_band,
                   employee_band, region_sido, region_sigungu, concerns
            FROM business_profile WHERE id = ?
            """, ev.profileId());

        // L3 · 원인 분석 (Sonnet) — 매칭 필요 여부까지 Claude가 판단
        Map<String, Object> analysis = aiEngine.analyze(profile,
                Map.of("metric_key", ev.metricKey(), "observed_value", ev.observedValue()));
        String causeText = (String) analysis.get("cause_text");
        boolean needsMatch = Boolean.TRUE.equals(analysis.get("needs_funding_match"));

        Long analysisId = jdbc.queryForObject("""
            INSERT INTO analysis_result (trigger_event_id, cause_text, needs_funding_match, model)
            VALUES (?, ?, ?, 'sonnet') RETURNING id
            """, Long.class, ev.id(), causeText, needsMatch);

        // L4 · 하이브리드 RAG (불필요: 매칭 생략 — 원인 텍스트는 항상 리포트에 포함)
        List<Map<String, Object>> matches = List.of();
        if (needsMatch) {
            matches = aiEngine.match((String) analysis.getOrDefault("match_hint", causeText));
            for (Map<String, Object> m : matches) {
                jdbc.update("""
                    INSERT INTO funding_match (analysis_id, pblanc_id, bm25_rank, vector_rank, rrf_score, evidence)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, analysisId, m.get("pblanc_id"), m.get("bm25_rank"),
                    m.get("vector_rank"), m.get("rrf_score"), m.get("evidence"));
            }
        }

        // L5 · 리포트 생성 (Sonnet) → 저장 → push
        String bodyMd = aiEngine.generateReport(causeText, matches);
        Long reportId = jdbc.queryForObject("""
            INSERT INTO report (profile_id, analysis_id, body_md) VALUES (?, ?, ?) RETURNING id
            """, Long.class, ev.profileId(), analysisId, bodyMd);

        jdbc.update("UPDATE report SET pushed_at = now() WHERE id = ?", reportId);

        // 알림 생성(원본) — 폴링용 GET /api/notifications 에 노출 (§2-1 계약)
        String notiTitle = "새 리포트가 도착했어요";
        Long notificationId = jdbc.queryForObject("""
            INSERT INTO notification (profile_id, report_id, type, title, body)
            VALUES (?, ?, 'REPORT', ?, ?) RETURNING id
            """, Long.class, ev.profileId(), reportId, notiTitle,
            "원인 분석과 정책자금 매칭 결과를 확인하세요.");

        // 카카오 나에게 보내기(미러, P1.5) — 순서: notification insert 후. 실패해도 파이프라인에 영향 없음.
        // (Sender 내부에서 이미 예외를 삼키지만 호출부에서도 이중 방어)
        try {
            notificationSender.send(ev.profileId(), notificationId, reportId, notiTitle);
        } catch (Exception e) {
            log.warn("알림 미러 발송 호출 실패 (인앱 알림은 정상): {}", e.toString());
        }

        jdbc.update("UPDATE trigger_event SET status = 'PROCESSED' WHERE id = ?", ev.id());
        return reportId;
    }
}
