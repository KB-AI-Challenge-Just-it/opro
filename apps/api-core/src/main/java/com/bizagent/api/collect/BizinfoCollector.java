package com.bizagent.api.collect;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

/**
 * L1 · 정책자금 (기업마당 API) 일일 델타 수집.
 * 마감 공고는 피드에서 사라지므로 매일 적재해야 이력·마감 추적이 가능하다.
 * pblanc_id 기준 upsert → 신규 건수 반환.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BizinfoCollector {

    private static final String API = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

    // 전체 공고 목록 응답이 WebClient 기본 인메모리 버퍼(256KB)를 넘겨 DataBufferLimitException으로
    // 실패한다 — SbizStoreSearchClient와 같은 이유로 4MB로 상향. 타임아웃도 명시(Reactor Netty는
    // 기본값이 없어 응답이 안 오면 무한정 멈춘다 — AiEngineClient 등과 동일 패턴).
    private static final ExchangeStrategies STRATEGIES = ExchangeStrategies.builder()
        .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024))
        .build();
    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private final WebClient client = WebClient.builder().exchangeStrategies(STRATEGIES).build();

    private final JdbcTemplate jdbc;

    @Value("${collector.bizinfo-key:}")
    private String crtfcKey;

    @SuppressWarnings("unchecked")
    public int collect() {
        Map<String, Object> body = client.get()
                .uri(API + "?crtfcKey={key}&dataType=json", crtfcKey)
                .retrieve().bodyToMono(Map.class).timeout(TIMEOUT).block();
        if (body == null) return 0;

        List<Map<String, Object>> items = (List<Map<String, Object>>) body.getOrDefault("jsonArray", List.of());
        int newCount = 0;
        for (Map<String, Object> it : items) {
            String pblancId = (String) it.get("pblancId");
            if (pblancId == null) continue;
            String applyStart = parseDate((String) it.get("reqstBeginEndDe"), 0);
            String applyEnd   = parseDate((String) it.get("reqstBeginEndDe"), 1);
            try {
                int inserted = jdbc.update("""
                    INSERT INTO policy_announcement
                        (pblanc_id, title, summary_html, support_field, target, region,
                         apply_start, apply_end, detail_url, raw)
                    VALUES (?, ?, ?, ?, ?, ?, ?::date, ?::date, ?, ?::jsonb)
                    ON CONFLICT (pblanc_id) DO UPDATE SET last_seen_at = now()
                    """,
                    pblancId, it.get("pblancNm"), it.get("bsnsSumryCn"),
                    it.get("pldirSportRealmLclasCodeNm"), it.get("trgetNm"),
                    it.get("jrsdInsttNm"),
                    applyStart, applyEnd, it.get("pblancUrl"), toJson(it));
                // upsert라 insert/update 구분은 xmax 확인이 필요하나 MVP에선 first_seen_at으로 후처리
                newCount += inserted;
            } catch (Exception e) {
                // 공고 하나가 이상해도(예: 예상 못한 필드값) 배치 전체를 죽이면 안 된다 — 그 건만 건너뛴다.
                log.warn("[bizinfo] 공고 적재 실패, 건너뜀 pblancId={}: {}", pblancId, e.toString());
            }
        }
        return newCount;
    }

    /** "YYYY-MM-DD ~ YYYY-MM-DD" 형식에서 idx(0=시작, 1=마감) 날짜를 반환.
     *  실제 API는 "예산 소진시까지"·"상시모집" 같은 자유텍스트도 이 자리에 돌려주므로,
     *  진짜 ISO 날짜로 파싱되는 경우만 통과시키고 그 외엔 null(날짜 없음)로 취급한다 —
     *  그대로 ::date 캐스트에 넘기면 SQL 예외로 적재 전체가 실패한다. */
    private String parseDate(String range, int idx) {
        if (range == null) return null;
        String[] parts = range.split("~");
        if (parts.length <= idx) return null;
        String date = parts[idx].trim();
        if (date.isEmpty()) return null;
        try {
            LocalDate.parse(date);
            return date;
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private String toJson(Map<String, Object> map) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(map);
        } catch (Exception e) {
            return "{}";
        }
    }
}
