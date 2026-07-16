package com.bizagent.api.collect;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * L1 · 경기지표 (한국은행 ECOS OpenAPI) — 기준금리·소비자물가지수·BSI 수집.
 * indicator_code는 TriggerEngine.latestEconMetric()의 "<code>_change_bp|_change_pct" 명명 규칙과
 * 일치해야 하는 계약이다 (예: base_rate_change_bp → base_rate).
 * window_days(threshold_rule) 내 변화량 계산에 관측점 2개 이상이 필요하므로, 최신값 1건이 아니라
 * 최근 구간 전체를 매번 upsert한다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EcosCollector {

    private static final String API_BASE = "https://ecos.bok.or.kr/api/StatisticSearch";
    private static final DateTimeFormatter YYYYMM = DateTimeFormatter.ofPattern("yyyyMM");
    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("yyyyMMdd");

    /**
     * statCode/cycle/itemCodes = ECOS 통계표코드/주기("D" 또는 "M")/항목코드,
     * lookbackDays = 조회 시작일까지 거슬러 올라갈 일수, recordLimit = 요청 종료건수(페이징 상한),
     * indicatorCode = econ_indicator.indicator_code (TriggerEngine 명명 규칙 계약).
     */
    private record Series(String statCode, String cycle, int lookbackDays, int recordLimit,
                           List<String> itemCodes, String indicatorCode) {}

    private static final List<Series> SERIES = List.of(
            // 한국은행 기준금리 — 실제로 검증된 형태는 D(일) 주기뿐이라 M으로 바꾸지 않는다(미검증 위험 회피).
            // threshold_rule.window_days=90(02_seed_thresholds.sql)을 여유있게 덮는 120일 조회.
            new Series("722Y001", "D", 120, 200, List.of("0101000"), "base_rate"),
            // 소비자물가지수 총지수 — 월 주기. 현재 seed엔 cpi 룰이 없어 향후 확장 대비로 넉넉히 확보.
            new Series("901Y009", "M", 395, 100, List.of("0"), "cpi"),
            // 기업경기실사지수(전산업 업황실적, item_code 미검증) — ECOS 통계코드검색으로 재확인 필요
            new Series("512Y014", "M", 395, 100, List.of("99988"), "bsi")
    );

    private final JdbcTemplate jdbc;

    @Value("${collector.ecos-key:}")
    private String apiKey;

    public int collect() {
        if (apiKey == null || apiKey.isBlank()) {
            log.info("ECOS_API_KEY 미설정 — 수집 생략");
            return 0;
        }

        int saved = 0;
        for (Series s : SERIES) {
            try {
                saved += collectSeries(s);
            } catch (Exception e) {
                // 한 지표 수집 실패가 다른 축·배치 전체를 죽이지 않는다
                log.warn("ECOS 수집 실패 indicator={}: {}", s.indicatorCode(), e.toString());
            }
        }
        return saved;
    }

    @SuppressWarnings("unchecked")
    private int collectSeries(Series s) {
        DateTimeFormatter fmt = "D".equals(s.cycle()) ? YYYYMMDD : YYYYMM;
        String start = LocalDate.now().minusDays(s.lookbackDays()).format(fmt);
        String end = LocalDate.now().format(fmt);

        String path = String.join("/", API_BASE, apiKey, "json", "kr", "1", String.valueOf(s.recordLimit()),
                s.statCode(), s.cycle(), start, end);
        if (!s.itemCodes().isEmpty()) {
            path = path + "/" + String.join("/", s.itemCodes());
        }

        Map<String, Object> body = WebClient.create().get()
                .uri(path).retrieve().bodyToMono(Map.class).block();
        if (body == null) return 0;

        Map<String, Object> result = (Map<String, Object>) body.get("StatisticSearch");
        if (result == null) {
            // 결과 없음(RESULT.CODE=INFO-200 등) 또는 인증 오류 — 해당 지표만 스킵
            log.warn("ECOS 응답에 데이터 없음 indicator={}: {}", s.indicatorCode(), body.get("RESULT"));
            return 0;
        }

        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.getOrDefault("row", List.of());
        int saved = 0;
        for (Map<String, Object> row : rows) {
            Double value = toDouble((String) row.get("DATA_VALUE"));
            LocalDate observedAt = toDate((String) row.get("TIME"));
            if (value == null || observedAt == null) continue;
            saved += jdbc.update("""
                INSERT INTO econ_indicator (indicator_code, value, observed_at)
                VALUES (?, ?, ?)
                ON CONFLICT (indicator_code, observed_at)
                DO UPDATE SET value = EXCLUDED.value, collected_at = now()
                """,
                s.indicatorCode(), value, observedAt);
        }
        return saved;
    }

    /** ECOS DATA_VALUE는 문자열이며 결측월엔 빈 값일 수 있다. 파싱 실패는 null(해당 행 스킵). */
    private static Double toDouble(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            return Double.valueOf(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** ECOS TIME — D 주기는 "YYYYMMDD" 그대로, M 주기는 "YYYYMM"을 해당 월 1일로 정규화. */
    private static LocalDate toDate(String time) {
        if (time == null) return null;
        try {
            if (time.length() == 8) return LocalDate.parse(time, YYYYMMDD);
            if (time.length() == 6) return LocalDate.parse(time + "01", YYYYMMDD);
            return null;
        } catch (Exception e) {
            return null;
        }
    }
}
