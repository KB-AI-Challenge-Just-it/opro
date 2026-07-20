package com.bizagent.api.collect;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 온보딩 화면1 · 소진공 상가업소 정보 API(B553077) 실 연동.
 * SbizCollector와 같은 제공기관·같은 서비스키를 쓰지만 용도가 다르다(여긴 매장 검색 자동완성).
 *
 * 이 API엔 "상호명으로 검색" 오퍼레이션이 없다(전부 좌표/행정구역/업종 기반 목록 조회) —
 * OpenAPI 활용가이드(doc/상가정보_OpenApi문서.pdf) 목차 19개 오퍼레이션 중 이름 검색은 없음.
 * juso.go.kr 주소검색 연동 대신, 시/군구 단위로 전체 페이지를 다 받아와서 상호명을 서버에서
 * contains 필터링하는 방식으로 확정(이슈 논의 참고 — doc/decisions/store-search-approach.md).
 * 시/군구는 대구 중구 기준 14,681건까지 확인했고, MAX_PAGES로 과도한 대형 구를 방어한다.
 */
@Slf4j
@Component
public class SbizStoreSearchClient {

    private static final String BASE = "https://apis.data.go.kr/B553077/api/open/sdsc2";

    @Value("${collector.sbiz-key:}")
    private String serviceKey;

    // numOfRows=1000 상당의 시/도 전체 상가업소 목록은 WebClient 기본 인메모리 버퍼(256KB)를
    // 넘기는 경우가 많아 DataBufferLimitException으로 조용히 실패했다 — 4MB로 상향.
    private static final ExchangeStrategies STRATEGIES = ExchangeStrategies.builder()
        .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024))
        .build();
    private final WebClient client = WebClient.builder().exchangeStrategies(STRATEGIES).build();

    // WebClient/Reactor Netty는 응답 타임아웃을 기본으로 걸어주지 않는다 — data.go.kr이 응답을
    // 안 주면 요청 스레드가 무한정 멈춘다(AiEngineClient도 같은 이유로 명시적 타임아웃을 둔다).
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    /** 시도명(축약형, 예: "서울") → ctprvnCd. baroApi 결과는 안정적이라 최초 1회만 조회해 캐시한다. */
    private final Map<String, String> sidoCodeCache = new ConcurrentHashMap<>();

    // 큰 구(강남구 등)는 수만 건일 수 있어 무한정 페이지를 돌지 않도록 상한을 둔다.
    // 20페이지 * 1000건 = 2만 건 — 대구 중구(14,681건)는 15페이지로 충분히 커버됨.
    private static final int MAX_PAGES = 20;

    /** 상권업종대분류코드 → 온보딩 8지선다 업종. 소진공 분류가 훨씬 세분화돼 있어 완전 대응은 아니다. */
    private static final Map<String, String> LCLS_TO_INDUSTRY = Map.of(
        "G2", "소매/유통",
        "I1", "숙박업",
        "I2", "음식점/외식업",
        "P1", "교육/학원"
    );
    private static final List<String> CAFE_KEYWORDS = List.of("카페", "커피", "제과", "디저트", "베이커리");

    /** 화면1 · 시/도 선택 시 그 안의 시/군구 목록을 준다(프론트가 두 번째 드롭다운으로 노출). */
    public List<Map<String, Object>> listSigungu(String sidoShort) {
        if (serviceKey == null || serviceKey.isBlank()) return List.of();
        ensureSidoCodesLoaded();
        String ctprvnCd = sidoCodeCache.get(sidoShort);
        if (ctprvnCd == null) {
            log.warn("[sbiz] 시도코드 매핑 실패: {}", sidoShort);
            return List.of();
        }
        try {
            Map<String, Object> body = client.get()
                .uri(BASE + "/baroApi?serviceKey={key}&resId=dong&catId=cty&ctprvnCd={code}&type=json",
                    serviceKey, ctprvnCd)
                .retrieve().bodyToMono(Map.class).timeout(TIMEOUT).block();
            List<Map<String, Object>> out = new ArrayList<>();
            for (Map<String, Object> item : extractItems(body)) {
                Map<String, Object> row = new HashMap<>();
                row.put("code", item.get("signguCd"));
                row.put("name", item.get("signguNm"));
                out.add(row);
            }
            return out;
        } catch (Exception e) {
            log.warn("[sbiz] 시군구 목록 조회 실패 sido={}: {}", sidoShort, e.toString());
            return List.of();
        }
    }

    /**
     * 화면1 · 선택된 시/군구 전체를 페이지네이션으로 다 받아와서 상호명으로 필터링한다.
     * 이름검색 오퍼레이션이 없어서 택한 방식 — juso.go.kr 주소검색 연동은 보류하고
     * "구 전체를 끌어와서 비교"로 확정(대구 중구 14,681건 실측 기준 MAX_PAGES=20이면 충분).
     */
    public List<Map<String, Object>> searchInSigungu(String signguCd, String query) {
        if (serviceKey == null || serviceKey.isBlank()) {
            log.info("SBIZ_API_KEY 미설정 — 매장 검색 생략");
            return List.of();
        }
        List<Map<String, Object>> matches = new ArrayList<>();
        long total = Long.MAX_VALUE;
        int page = 1;
        while ((long) (page - 1) * 1000 < total && page <= MAX_PAGES) {
            Map<String, Object> body;
            try {
                body = client.get()
                    .uri(BASE + "/storeListInDong?serviceKey={key}&divId=signguCd&key={code}&numOfRows=1000&pageNo={page}&type=json",
                        serviceKey, signguCd, page)
                    .retrieve().bodyToMono(Map.class).timeout(TIMEOUT).block();
            } catch (Exception e) {
                log.warn("[sbiz] 매장 검색 실패 signguCd={} query={} page={}: {}", signguCd, query, page, e.toString());
                break;
            }
            if (page == 1) {
                total = extractTotalCount(body);
                log.info("[sbiz] signguCd={} totalCount={}", signguCd, total);
            }
            List<Map<String, Object>> items = extractItems(body);
            if (items.isEmpty()) break;
            for (Map<String, Object> item : items) {
                if (matchesName(item, query)) matches.add(item);
            }
            page++;
        }
        return matches.stream().map(this::toStoreResult).limit(30).toList();
    }

    private synchronized void ensureSidoCodesLoaded() {
        if (!sidoCodeCache.isEmpty() || serviceKey == null || serviceKey.isBlank()) return;
        try {
            Map<String, Object> body = client.get()
                .uri(BASE + "/baroApi?serviceKey={key}&resId=dong&catId=mega&type=json", serviceKey)
                .retrieve().bodyToMono(Map.class).timeout(TIMEOUT).block();
            for (Map<String, Object> item : extractItems(body)) {
                String full = String.valueOf(item.get("ctprvnNm"));
                String cd = String.valueOf(item.get("ctprvnCd"));
                sidoCodeCache.put(shortenSidoName(full), cd);
            }
            log.info("[sbiz] 시도코드 {}건 캐시 완료", sidoCodeCache.size());
        } catch (Exception e) {
            log.warn("[sbiz] 시도코드 조회 실패: {}", e.toString());
        }
    }

    /** "서울특별시"→"서울", "강원특별자치도"→"강원", "충청북도"→"충북" 식 축약. 프론트 SIDO_OPTIONS와 맞춤. */
    private static String shortenSidoName(String full) {
        String s = full
            .replace("특별자치시", "").replace("특별자치도", "")
            .replace("광역시", "").replace("특별시", "")
            .replace("도", "");
        // 충청북도→충청북, 전라남도→전라남 처럼 남은 두 글자를 다시 축약(충청→충북/충남, 전라→전북/전남 구분 필요)
        return switch (full) {
            case "충청북도" -> "충북";
            case "충청남도" -> "충남";
            case "전라북도", "전북특별자치도" -> "전북";
            case "전라남도" -> "전남";
            case "경상북도" -> "경북";
            case "경상남도" -> "경남";
            default -> s;
        };
    }

    private static boolean matchesName(Map<String, Object> item, String query) {
        Object nm = item.get("bizesNm");
        return nm instanceof String s && query != null && !query.isBlank() && s.contains(query);
    }

    private Map<String, Object> toStoreResult(Map<String, Object> item) {
        Map<String, Object> out = new HashMap<>();
        out.put("name", item.get("bizesNm"));
        out.put("industry", mapIndustry(item));
        out.put("regionSido", item.get("ctprvnNm"));
        out.put("regionSigungu", item.get("signguNm"));
        out.put("marketRegionCode", item.get("adongCd"));
        out.put("marketIndustryCode", item.get("indsSclsCd"));
        return out;
    }

    private static String mapIndustry(Map<String, Object> item) {
        String lclsCd = String.valueOf(item.get("indsLclsCd"));
        if ("I2".equals(lclsCd)) {
            String mcls = String.valueOf(item.getOrDefault("indsMclsNm", ""));
            String scls = String.valueOf(item.getOrDefault("indsSclsNm", ""));
            for (String kw : CAFE_KEYWORDS) {
                if (mcls.contains(kw) || scls.contains(kw)) return "카페/디저트";
            }
        }
        return LCLS_TO_INDUSTRY.getOrDefault(lclsCd, "서비스업");
    }

    /** data.go.kr는 결과가 1건이면 items.item을 배열이 아닌 단일 객체로 내려주는 경우가 있어 방어적으로 처리. */
    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractItems(Object bodyObj) {
        if (!(bodyObj instanceof Map<?, ?> body)) return List.of();
        Object responseObj = body.get("response");
        Map<String, Object> response = responseObj instanceof Map ? (Map<String, Object>) responseObj : (Map<String, Object>) body;
        Object respBodyObj = response.get("body");
        if (!(respBodyObj instanceof Map<?, ?> respBody)) return List.of();
        Object itemsObj = ((Map<String, Object>) respBody).get("items");
        if (itemsObj instanceof List<?> list) return (List<Map<String, Object>>) list;
        if (itemsObj instanceof Map<?, ?> map) {
            Object item = map.get("item");
            if (item instanceof List<?> list) return (List<Map<String, Object>>) list;
            if (item instanceof Map<?, ?> single) return List.of((Map<String, Object>) single);
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private static long extractTotalCount(Object bodyObj) {
        if (!(bodyObj instanceof Map<?, ?> body)) return 0;
        Object responseObj = body.get("response");
        Map<String, Object> response = responseObj instanceof Map ? (Map<String, Object>) responseObj : (Map<String, Object>) body;
        Object respBodyObj = response.get("body");
        if (!(respBodyObj instanceof Map<?, ?> respBody)) return 0;
        Object tc = ((Map<String, Object>) respBody).get("totalCount");
        if (tc instanceof Number n) return n.longValue();
        try {
            return tc == null ? 0 : Long.parseLong(String.valueOf(tc));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
