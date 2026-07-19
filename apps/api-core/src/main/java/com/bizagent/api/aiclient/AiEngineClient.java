package com.bizagent.api.aiclient;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.sql.Array;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ai-engine(FastAPI, Python) 클라이언트 — AI 호출 전용 경계.
 * 비즈니스 데이터 조회·저장은 전부 Spring이 하고, ai-engine엔 컨텍스트를 담아 보낸다.
 */
@Component
public class AiEngineClient {

    private final WebClient client;

    public AiEngineClient(@Value("${ai-engine.base-url}") String baseUrl) {
        this.client = WebClient.create(baseUrl);
    }

    /** L3 · 원인 분석 + 매칭 필요 판단 (Sonnet) */
    public Map<String, Object> analyze(Map<String, Object> profile, Map<String, Object> triggerContext) {
        return post("/analysis", Map.of("profile", sanitize(profile), "trigger_context", triggerContext));
    }

    /** L4 · 하이브리드 RAG 매칭 (Haiku 쿼리변환 → BM25 ∥ 벡터 → RRF) */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> match(String causeText) {
        Map<String, Object> res = post("/matching", Map.of("cause_text", causeText));
        return (List<Map<String, Object>>) res.getOrDefault("matches", List.of());
    }

    /** L5 · 리포트 본문 생성 (Sonnet) */
    public String generateReport(String causeText, List<Map<String, Object>> matches) {
        Map<String, Object> res = post("/report/generate",
                Map.of("cause_text", causeText, "matches", matches));
        return (String) res.get("body_md");
    }

    /** 확장(5-3) · 신청서 초안 섹션 생성 */
    public Map<String, Object> generateDraft(Map<String, Object> announcement,
                                             Map<String, Object> profile, String causeText) {
        return post("/draft", Map.of(
                "announcement", announcement, "profile", sanitize(profile), "cause_text", causeText));
    }

    /** 수집 후 BM25·임베딩 인덱스 재구성 */
    public Map<String, Object> rebuildIndexes() {
        return post("/index/rebuild", Map.of());
    }

    private Map<String, Object> post(String uri, Map<String, Object> body) {
        return client.post().uri(uri).bodyValue(body)
                .retrieve().bodyToMono(Map.class).block();
    }

    /** JdbcTemplate.queryForMap()이 TEXT[] 컬럼을 raw java.sql.Array(PgArray)로 돌려주는데,
     * 이걸 그대로 Jackson에 넘기면 내부 커넥션 참조까지 직렬화를 시도하다 터진다. */
    private static Map<String, Object> sanitize(Map<String, Object> row) {
        Map<String, Object> out = new HashMap<>(row);
        out.replaceAll((key, value) -> {
            if (value instanceof Array sqlArray) {
                try {
                    return Arrays.asList((Object[]) sqlArray.getArray());
                } catch (SQLException e) {
                    throw new RuntimeException(e);
                }
            }
            return value;
        });
        return out;
    }
}
