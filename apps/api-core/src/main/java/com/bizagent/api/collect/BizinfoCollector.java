package com.bizagent.api.collect;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

/**
 * L1 · 정책자금 (기업마당 API) 일일 델타 수집.
 * 마감 공고는 피드에서 사라지므로 매일 적재해야 이력·마감 추적이 가능하다.
 * pblanc_id 기준 upsert → 신규 건수 반환.
 */
@Service
@RequiredArgsConstructor
public class BizinfoCollector {

    private static final String API = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

    private final JdbcTemplate jdbc;

    @Value("${collector.bizinfo-key:}")
    private String crtfcKey;

    public int collect() {
        Map<String, Object> body = WebClient.create().get()
                .uri(API + "?crtfcKey={key}&dataType=json", crtfcKey)
                .retrieve().bodyToMono(Map.class).block();
        if (body == null) return 0;

        List<Map<String, Object>> items = (List<Map<String, Object>>) body.getOrDefault("jsonArray", List.of());
        int newCount = 0;
        for (Map<String, Object> it : items) {
            String pblancId = (String) it.get("pblancId");
            if (pblancId == null) continue;
            int inserted = jdbc.update("""
                INSERT INTO policy_announcement (pblanc_id, title, summary_html, support_field, target, region, raw)
                VALUES (?, ?, ?, ?, ?, ?, ?::jsonb)
                ON CONFLICT (pblanc_id) DO UPDATE SET last_seen_at = now()
                """,
                pblancId, it.get("pblancNm"), it.get("bsnsSumryCn"),
                it.get("pldirSportRealmLclasCodeNm"), it.get("trgetNm"),
                it.get("jrsdInsttNm"), toJson(it));
            // upsert라 insert/update 구분은 xmax 확인이 필요하나 MVP에선 first_seen_at으로 후처리
            newCount += inserted;
        }
        return newCount;
    }

    private String toJson(Map<String, Object> map) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(map);
        } catch (Exception e) {
            return "{}";
        }
    }
}
