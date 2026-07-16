package com.bizagent.api.collect;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

/**
 * L1 · 상권 (소진공 상가업소 API) — 반경 500m 동일업종 경쟁강도를 market_snapshot에 적재.
 * metric JSONB 키는 threshold_rule.metric_key와 일치해야 하는 계약이다 (여기서는 new_competitors_500m).
 * 유동인구·매출추이는 이 API 패밀리에 대응 엔드포인트가 없어 이번 범위에서 제외 — 값을 지어내지 않는다
 * (PRD §5-1/§9에서도 소비 트렌드 축은 확보 난이도가 높다고 명시).
 * 현재 값은 "반경 내 동일업종 현재 개소 수"(경쟁 밀도)다. day-over-day 델타(진짜 "신규 개업")로
 * 바꾸면 최초 수집 시 항상 0이 되어 AC의 "수집 후 트리거 1건 이상 발동"을 충족하지 못하므로 채택하지 않았다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SbizCollector {

    private static final String API = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius";
    private static final int RADIUS_M = 500;

    /**
     * lat/lon/regionCode/industryCode = 데모 시나리오 정적 설정(db/init/04_seed_demo.sql: region_code=A1001,
     * industry_code=카페/디저트 와 일치시켜야 TriggerEngine 조회가 맞물린다).
     * industryKeywords = 업종 대/중/소분류명 매칭 키워드 — indsLclsCd 등 정확한 코드값은 미검증이라
     * 쿼리 파라미터로 넘기지 않고(잘못된 코드로 API 호출 자체가 실패하는 것을 피함) 응답을 받아 텍스트로 필터링한다.
     * 프로덕션 확장 시 business_profile의 distinct(market_region_code, market_industry_code) 조합을
     * 좌표·키워드에 매핑하는 참조 테이블로 대체 필요 (지금은 데모 1건 — 업종·지역 하드코딩 임시 완화).
     */
    private record Target(double lat, double lon, String regionCode, String industryCode, List<String> industryKeywords) {}

    private static final List<Target> TARGETS = List.of(
            new Target(37.4979, 127.0276, "A1001", "카페/디저트", List.of("카페", "커피"))
    );

    private final JdbcTemplate jdbc;

    @Value("${collector.sbiz-key:}")
    private String apiKey;

    public int collect() {
        if (apiKey == null || apiKey.isBlank()) {
            log.info("SBIZ_API_KEY 미설정 — 수집 생략");
            return 0;
        }

        int saved = 0;
        for (Target t : TARGETS) {
            try {
                saved += collectTarget(t);
            } catch (Exception e) {
                // 한 지역 수집 실패가 다른 지역·배치 전체를 죽이지 않는다
                log.warn("Sbiz 수집 실패 region={}: {}", t.regionCode(), e.toString());
            }
        }
        return saved;
    }

    @SuppressWarnings("unchecked")
    private int collectTarget(Target t) {
        Map<String, Object> body = WebClient.create().get()
                .uri(API + "?serviceKey={key}&cx={cx}&cy={cy}&radius={radius}&type=json&numOfRows=1000",
                        apiKey, t.lon(), t.lat(), RADIUS_M)
                .retrieve().bodyToMono(Map.class).block();
        if (body == null) return 0;

        Map<String, Object> response = body.get("response") instanceof Map
                ? (Map<String, Object>) body.get("response") : body;
        Map<String, Object> respBody = (Map<String, Object>) response.get("body");
        if (respBody == null) {
            log.warn("Sbiz 응답에 body 없음 region={}: {}", t.regionCode(), response);
            return 0;
        }

        List<Map<String, Object>> items = extractItems(respBody.get("items"));
        long competitorCount = items.stream()
                .filter(item -> matchesIndustry(item, t.industryKeywords()))
                .count();

        return jdbc.update("""
            INSERT INTO market_snapshot (region_code, industry_code, metric, snapshot_date)
            VALUES (?, ?, jsonb_build_object('new_competitors_500m', ?), CURRENT_DATE)
            ON CONFLICT (region_code, industry_code, snapshot_date)
            DO UPDATE SET metric = market_snapshot.metric || EXCLUDED.metric
            """,
            t.regionCode(), t.industryCode(), (int) competitorCount);
    }

    /** data.go.kr는 결과가 1건이면 items.item을 배열이 아닌 단일 객체로 내려주는 경우가 있어 방어적으로 처리. */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractItems(Object itemsObj) {
        if (itemsObj instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        if (itemsObj instanceof Map<?, ?> map) {
            Object item = map.get("item");
            if (item instanceof List<?> list) return (List<Map<String, Object>>) list;
            if (item instanceof Map<?, ?> single) return List.of((Map<String, Object>) single);
        }
        return List.of();
    }

    private static boolean matchesIndustry(Map<String, Object> item, List<String> keywords) {
        for (String field : List.of("indsLclsNm", "indsMclsNm", "indsSclsNm")) {
            if (!(item.get(field) instanceof String name)) continue;
            for (String kw : keywords) {
                if (name.contains(kw)) return true;
            }
        }
        return false;
    }
}
