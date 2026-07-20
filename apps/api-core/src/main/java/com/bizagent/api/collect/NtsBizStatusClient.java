package com.bizagent.api.collect;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * 온보딩 화면2 · 국세청 사업자등록정보 상태조회 API(odcloud.kr nts-businessman) 실 연동.
 * data.go.kr는 API마다 별도 활용신청·승인이 필요해 소진공 키(SBIZ_API_KEY)와는 별개로
 * NTS_API_KEY(collector.nts-key)를 쓴다 — 승인 전에는 미설정으로 취급되어 폴백된다.
 *
 * 응답은 SbizStoreSearchClient의 data.go.kr(B553077) XML계열과 달리 odcloud 평면 JSON이다:
 * {"status_code":"OK","match_cnt":1,"request_cnt":1,"data":[{"b_no":"...","b_stt":"계속사업자",
 *  "b_stt_cd":"01","tax_type":"...","end_dt":"", ...}]}
 *
 * 키 미설정·호출 실패(4xx/5xx/타임아웃/파싱 실패)는 예외로 온보딩을 막지 않고 null을 반환한다
 * (호출부가 폴백 목업으로 처리) — SbizStoreSearchClient.search()의 안전 폴백 규약과 동일.
 */
@Slf4j
@Component
public class NtsBizStatusClient {

    private static final String STATUS_URL =
        "https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey={key}";

    @Value("${collector.nts-key:}")
    private String serviceKey;

    // WebClient/Reactor Netty는 응답 타임아웃을 기본으로 걸어주지 않는다 — 국세청이 응답을 안 주면
    // 요청 스레드가 무한정 멈춘다(SbizStoreSearchClient·AiEngineClient도 같은 이유로 명시적 타임아웃).
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final WebClient client = WebClient.builder().build();

    /**
     * 사업자등록번호 상태조회. 조회 성공 시 data[0] 항목(b_stt_cd 등)을 그대로 반환,
     * 키 미설정·호출 실패·결과 없음은 모두 null(폴백)을 반환한다.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> status(String bizRegNo) {
        if (serviceKey == null || serviceKey.isBlank()) {
            log.info("NTS_API_KEY 미설정 — 국세청 상태조회 생략 bizRegNo={}", bizRegNo);
            return null;
        }
        try {
            Map<String, Object> body = client.post()
                .uri(STATUS_URL, serviceKey)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("b_no", List.of(bizRegNo)))
                .retrieve().bodyToMono(Map.class).timeout(TIMEOUT).block();

            Object dataObj = body == null ? null : body.get("data");
            if (dataObj instanceof List<?> list && !list.isEmpty()
                    && list.get(0) instanceof Map<?, ?> first) {
                return (Map<String, Object>) first;
            }
            log.warn("[nts] 상태조회 결과 없음 bizRegNo={} body={}", bizRegNo, body);
            return null;
        } catch (Exception e) {
            log.warn("[nts] 상태조회 실패 bizRegNo={}: {}", bizRegNo, e.toString());
            return null;
        }
    }
}
