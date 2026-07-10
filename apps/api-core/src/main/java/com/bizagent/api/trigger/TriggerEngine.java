package com.bizagent.api.trigger;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * L2 · 모니터링·트리거 엔진 (규칙 기반 게이트) — LLM 없이 결정론으로 동작.
 * 게이트 순서(다이어그램):
 *   임계값 초과? ─미달→ 다음 주기 대기
 *     └초과→ 최근 동일 트리거로 이미 알림 발송? ─중복→ 알림 생략
 *              └신규→ L3 진행
 */
@Service
@RequiredArgsConstructor
public class TriggerEngine {

    private static final int DEDUP_WINDOW_DAYS = 14;

    private final JdbcTemplate jdbc;

    public record TriggerEvent(long id, long profileId, String metricKey,
                               Double observedValue, String dedupKey) {}

    public List<TriggerEvent> evaluate(long profileId) {
        List<Map<String, Object>> rules = jdbc.queryForList("""
            SELECT r.id, r.metric_key, r.operator, r.threshold
            FROM threshold_rule r
            JOIN business_profile p ON p.industry = r.industry
            WHERE p.id = ? AND r.enabled
            """, profileId);

        List<TriggerEvent> events = new ArrayList<>();
        for (Map<String, Object> rule : rules) {
            String metricKey = (String) rule.get("metric_key");
            Double observed = latestMetric(profileId, metricKey);
            if (observed == null) continue;
            double threshold = ((Number) rule.get("threshold")).doubleValue();
            if (!exceeds(observed, (String) rule.get("operator"), threshold)) continue; // 미달: 다음 주기 대기

            String dedupKey = metricKey + ":" + rule.get("operator") + ":" + threshold;
            Long id = jdbc.queryForObject("""
                INSERT INTO trigger_event (profile_id, rule_id, metric_key, observed_value, dedup_key)
                VALUES (?, ?, ?, ?, ?) RETURNING id
                """, Long.class, profileId, rule.get("id"), metricKey, observed, dedupKey);
            events.add(new TriggerEvent(id, profileId, metricKey, observed, dedupKey));
        }
        return events;
    }

    /** 중복이면 상태 갱신 후 true (알림 생략) */
    public boolean isDuplicateAlert(TriggerEvent ev) {
        Integer count = jdbc.queryForObject("""
            SELECT count(*) FROM trigger_event
            WHERE profile_id = ? AND dedup_key = ? AND status = 'PROCESSED'
              AND created_at >= now() - make_interval(days => ?) AND id <> ?
            """, Integer.class, ev.profileId(), ev.dedupKey(), DEDUP_WINDOW_DAYS, ev.id());
        boolean dup = count != null && count > 0;
        if (dup) {
            jdbc.update("UPDATE trigger_event SET status = 'DUPLICATE_SKIPPED' WHERE id = ?", ev.id());
        }
        return dup;
    }

    private Double latestMetric(long profileId, String metricKey) {
        // TODO(2주차): metric_key → market_snapshot / econ_indicator 매핑 구현
        return null;
    }

    private boolean exceeds(double value, String operator, double threshold) {
        return switch (operator) {
            case "GT" -> value > threshold;
            case "GTE" -> value >= threshold;
            case "LT" -> value < threshold;
            case "LTE" -> value <= threshold;
            case "ABS_GTE" -> Math.abs(value) >= threshold;
            default -> false;
        };
    }
}
