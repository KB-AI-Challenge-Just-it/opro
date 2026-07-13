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

    /**
     * metric_key 관측값 조회. 우선순위: 상권 스냅샷 → 경기지표 폴백.
     * metric_key·업종·지역을 하드코딩하지 않는다 — 지표 목록은 데이터(threshold_rule·프로필 컬럼·JSONB 키)가 결정한다.
     * 관측값이 없으면(정상 스킵 포함) null → evaluate()가 "미달: 다음 주기 대기"로 처리한다.
     */
    private Double latestMetric(long profileId, String metricKey) {
        Double market = latestMarketMetric(profileId, metricKey);
        if (market != null) return market;
        return latestEconMetric(profileId, metricKey);   // 상권에 없는 키(예: 경기지표)는 폴백
    }

    /** 프로필의 상권/업종 코드로 market_snapshot 최신 행에서 metric ->> metricKey 조회. */
    private Double latestMarketMetric(long profileId, String metricKey) {
        List<Map<String, Object>> profile = jdbc.queryForList(
            "SELECT market_region_code, market_industry_code FROM business_profile WHERE id = ?", profileId);
        if (profile.isEmpty()) return null;
        String regionCode = (String) profile.get(0).get("market_region_code");
        String industryCode = (String) profile.get(0).get("market_industry_code");
        if (regionCode == null || industryCode == null) return null;   // 상권 코드 미매핑 → 정상 스킵

        // idx_market_snapshot_lookup (region_code, industry_code, collected_at DESC) 사용
        List<String> values = jdbc.queryForList("""
            SELECT metric ->> ?
            FROM market_snapshot
            WHERE region_code = ? AND industry_code = ?
            ORDER BY collected_at DESC
            LIMIT 1
            """, String.class, metricKey, regionCode, industryCode);
        if (values.isEmpty()) return null;             // 스냅샷 없음
        return toDouble(values.get(0));                // 키 부재 시 ->> 결과 null → toDouble이 null 반환
    }

    private static final String BP_SUFFIX = "_change_bp";    // basis point 변화량 (지표 %p × 100)
    private static final String PCT_SUFFIX = "_change_pct";  // %p 변화량 (지표가 이미 %)

    /**
     * 경기지표 폴백 — metric_key 명명 규칙으로 econ_indicator 를 조회한다 (하드코딩 회피).
     *   "&lt;indicator_code&gt;_change_bp|_change_pct" → 접미사를 떼면 indicator_code, 접미사가 단위.
     *   window(threshold_rule.window_days) 내 (최신값 − 최고령값) 변화량을 반환. bp 는 ×100.
     * 데이터가 없거나(수집기 스텁 상태) 관측점이 2개 미만이면 null — 억지로 값을 만들지 않는다.
     * NOTE(계약): indicator_code = metric_key 접미사 제거값, bp = %p×100 은 이 구현이 정한 규칙이다.
     *   향후 EcosCollector 가 econ_indicator.indicator_code 를 이 규칙에 맞춰 적재해야 한다.
     */
    private Double latestEconMetric(long profileId, String metricKey) {
        String indicatorCode;
        boolean basisPoints;
        if (metricKey.endsWith(BP_SUFFIX)) {
            indicatorCode = metricKey.substring(0, metricKey.length() - BP_SUFFIX.length());
            basisPoints = true;
        } else if (metricKey.endsWith(PCT_SUFFIX)) {
            indicatorCode = metricKey.substring(0, metricKey.length() - PCT_SUFFIX.length());
            basisPoints = false;
        } else {
            return null;                               // 경기지표 계열 아님
        }

        Integer windowDays = ruleWindowDays(profileId, metricKey);
        if (windowDays == null) return null;

        List<Double> series = jdbc.queryForList("""
            SELECT value
            FROM econ_indicator
            WHERE indicator_code = ?
              AND observed_at >= CURRENT_DATE - make_interval(days => ?)
            ORDER BY observed_at DESC
            """, Double.class, indicatorCode, windowDays);
        if (series.size() < 2) return null;            // 변화량 계산 불가 → 미달 처리

        double delta = series.get(0) - series.get(series.size() - 1);
        return basisPoints ? delta * 100.0 : delta;
    }

    /** metricKey 규칙(threshold_rule)의 window_days — 2-arg latestMetric 시그니처를 유지하려 내부 조회. */
    private Integer ruleWindowDays(long profileId, String metricKey) {
        List<Integer> window = jdbc.queryForList("""
            SELECT r.window_days
            FROM threshold_rule r
            JOIN business_profile p ON p.industry = r.industry
            WHERE p.id = ? AND r.metric_key = ? AND r.enabled
            ORDER BY r.id
            LIMIT 1
            """, Integer.class, profileId, metricKey);
        return window.isEmpty() ? null : window.get(0);
    }

    /** JSONB ->> 결과 등 텍스트를 Double 로. null·비숫자는 null (한 지표 파싱 실패가 배치를 죽이지 않게). */
    private static Double toDouble(String text) {
        if (text == null) return null;
        try {
            return Double.valueOf(text);
        } catch (NumberFormatException e) {
            return null;
        }
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
