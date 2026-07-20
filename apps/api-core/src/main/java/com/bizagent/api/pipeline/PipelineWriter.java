package com.bizagent.api.pipeline;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * PipelineService.run()의 DB 쓰기만 모아 하나의 트랜잭션으로 커밋한다.
 * AI 호출(analyze/generateReport, 최대 240초)은 이 클래스에 들어오지 않는다 —
 * 커넥션을 오래 붙잡지 않기 위해서다. 대신 두 AI 호출이 모두 끝난 뒤 한 번에
 * 저장해서, 중간 실패로 analysis_result/funding_match 가 orphan으로 남거나
 * 재시도 시 같은 매칭이 dedup 게이트 없이 중복 저장되는 걸 막는다.
 */
@Component
@RequiredArgsConstructor
class PipelineWriter {

    private final JdbcTemplate jdbc;

    record Result(long analysisId, long reportId, long notificationId) {}

    @Transactional
    Result persist(long profileId, String fitText, List<Map<String, Object>> newMatches, String bodyMd) {
        // cause_text 컬럼 재사용 (rename 불필요) — fit_text 저장. trigger_event_id 는 NULL(nullable).
        Long analysisId = jdbc.queryForObject("""
            INSERT INTO analysis_result (trigger_event_id, cause_text, needs_funding_match, model)
            VALUES (NULL, ?, true, 'sonnet') RETURNING id
            """, Long.class, fitText);

        for (Map<String, Object> m : newMatches) {
            jdbc.update("""
                INSERT INTO funding_match (analysis_id, pblanc_id, bm25_rank, vector_rank, rrf_score, evidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """, analysisId, m.get("pblanc_id"), m.get("bm25_rank"),
                m.get("vector_rank"), m.get("rrf_score"), m.get("evidence"));
        }

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

        // dedup 게이트 기록 — 다음 재매칭부터 이 공고들은 "이미 알림"으로 걸러진다.
        // report/notification insert와 같은 트랜잭션이라, 여기까지 커밋돼야만
        // 다음 재시도에서 같은 매칭이 "신규"로 다시 잡히지 않는다.
        for (Map<String, Object> m : newMatches) {
            jdbc.update("""
                INSERT INTO profile_funding_alert (profile_id, pblanc_id)
                VALUES (?, ?) ON CONFLICT (profile_id, pblanc_id) DO NOTHING
                """, profileId, m.get("pblanc_id"));
        }

        return new Result(analysisId, reportId, notificationId);
    }
}
