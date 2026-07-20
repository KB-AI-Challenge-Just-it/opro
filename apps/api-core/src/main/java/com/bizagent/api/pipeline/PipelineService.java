package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.notification.NotificationSender;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

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

    /**
     * @param profileId  대상 프로필
     * @param newMatches ProfileMatchTrigger 가 이미 알린 공고를 걸러낸 신규 매칭 (top ≤ 5). 비어있지 않음이 전제.
     */
    public long run(long profileId, List<Map<String, Object>> newMatches) {
        long t0 = System.currentTimeMillis();
        log.info("[profile={}] 파이프라인 시작 (신규매칭 {}건)", profileId, newMatches.size());

        Map<String, Object> profile = jdbc.queryForMap("""
            SELECT industry, entity_type, operating_period, monthly_revenue_band,
                   employee_band, region_sido, region_sigungu, concerns
            FROM business_profile WHERE id = ?
            """, profileId);

        // L3 · 적합성 설명 (Sonnet) — 이 공고들이 왜 프로필에 맞는지
        Map<String, Object> analysis = aiEngine.analyze(profile, newMatches);
        String fitText = (String) analysis.get("fit_text");
        log.info("[profile={}] L3 적합성 설명 완료 ({}ms)", profileId, System.currentTimeMillis() - t0);

        // cause_text 컬럼 재사용 (rename 불필요) — fit_text 저장. trigger_event_id 는 NULL(nullable).
        Long analysisId = jdbc.queryForObject("""
            INSERT INTO analysis_result (trigger_event_id, cause_text, needs_funding_match, model)
            VALUES (NULL, ?, true, 'sonnet') RETURNING id
            """, Long.class, fitText);

        // L4 · 매칭 저장 (매칭은 이미 트리거에서 수행됨 — 여기선 저장만)
        for (Map<String, Object> m : newMatches) {
            jdbc.update("""
                INSERT INTO funding_match (analysis_id, pblanc_id, bm25_rank, vector_rank, rrf_score, evidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """, analysisId, m.get("pblanc_id"), m.get("bm25_rank"),
                m.get("vector_rank"), m.get("rrf_score"), m.get("evidence"));
        }

        // L5 · 리포트 생성 (Sonnet) → 저장 → push
        String bodyMd = aiEngine.generateReport(fitText, newMatches);
        log.info("[profile={}] L5 리포트 생성 완료 ({}ms)", profileId, System.currentTimeMillis() - t0);
        Long reportId = jdbc.queryForObject("""
            INSERT INTO report (profile_id, analysis_id, body_md) VALUES (?, ?, ?) RETURNING id
            """, Long.class, profileId, analysisId, bodyMd);

        jdbc.update("UPDATE report SET pushed_at = now() WHERE id = ?", reportId);

        // 알림 생성(원본) — 폴링용 GET /api/notifications 에 노출 (§2-1 계약)
        String notiTitle = "새 리포트가 도착했어요";
        Long notificationId = jdbc.queryForObject("""
            INSERT INTO notification (profile_id, report_id, type, title, body)
            VALUES (?, ?, 'REPORT', ?, ?) RETURNING id
            """, Long.class, profileId, reportId, notiTitle,
            "맞춤 정책자금 매칭 결과를 확인하세요.");

        // 카카오 나에게 보내기(미러, P1.5) — 순서: notification insert 후. 실패해도 파이프라인에 영향 없음.
        // (Sender 내부에서 이미 예외를 삼키지만 호출부에서도 이중 방어)
        try {
            notificationSender.send(profileId, notificationId, reportId, notiTitle);
        } catch (Exception e) {
            log.warn("알림 미러 발송 호출 실패 (인앱 알림은 정상): {}", e.toString());
        }

        // dedup 게이트 기록 — 다음 재매칭부터 이 공고들은 "이미 알림"으로 걸러진다.
        for (Map<String, Object> m : newMatches) {
            jdbc.update("""
                INSERT INTO profile_funding_alert (profile_id, pblanc_id)
                VALUES (?, ?) ON CONFLICT (profile_id, pblanc_id) DO NOTHING
                """, profileId, m.get("pblanc_id"));
        }

        log.info("[profile={}] 파이프라인 종료 ({}ms, reportId={})", profileId, System.currentTimeMillis() - t0, reportId);
        // TODO(4주차): push 채널(웹푸시/알림톡 등) 연동
        return reportId;
    }
}
