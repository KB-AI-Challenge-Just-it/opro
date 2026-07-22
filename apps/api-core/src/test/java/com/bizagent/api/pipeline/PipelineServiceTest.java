package com.bizagent.api.pipeline;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #79 — L3 match_rationales 병합. rationale이 있으면 evidence를 교체하고,
 * 없거나 빈 값이면 규칙 기반 evidence로 폴백되는지 검증한다.
 */
class PipelineServiceTest {

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> merge(
            List<Map<String, Object>> matches, Map<String, Object> analysis) {
        return (List<Map<String, Object>>) ReflectionTestUtils.invokeMethod(
                PipelineService.class, "mergeRationales", matches, analysis);
    }

    private static Map<String, Object> match(String pblancId, String evidence) {
        Map<String, Object> m = new HashMap<>();
        m.put("pblanc_id", pblancId);
        m.put("evidence", evidence);
        return m;
    }

    @Test
    void replacesEvidence_whenRationalePresent() {
        List<Map<String, Object>> matches = List.of(match("P1", "규칙 기반 근거"));
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P1", "LLM 생성 근거"));

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence")).isEqualTo("LLM 생성 근거");
    }

    @Test
    void keepsRuleEvidence_whenRationaleKeyMissing() {
        List<Map<String, Object>> matches = List.of(match("P1", "규칙 기반 근거"));
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P2", "다른 공고 근거"));

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence")).isEqualTo("규칙 기반 근거");
    }

    @Test
    void keepsRuleEvidence_whenRationaleBlank() {
        List<Map<String, Object>> matches = List.of(match("P1", "규칙 기반 근거"));
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P1", "   "));

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence")).isEqualTo("규칙 기반 근거");
    }

    @Test
    void keepsRuleEvidence_whenRationalesEmpty() {
        List<Map<String, Object>> matches = List.of(match("P1", "규칙 기반 근거"));
        Map<String, Object> analysis = Map.of("match_rationales", Map.of());

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence")).isEqualTo("규칙 기반 근거");
    }

    @Test
    void doesNotMutateOriginal_whenReplacing() {
        Map<String, Object> original = match("P1", "규칙 기반 근거");
        List<Map<String, Object>> matches = List.of(original);
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P1", "LLM 생성 근거"));

        merge(matches, analysis);

        assertThat(original.get("evidence")).isEqualTo("규칙 기반 근거");
    }
}
