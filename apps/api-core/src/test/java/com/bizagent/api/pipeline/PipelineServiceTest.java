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

    // 이슈 #83 — 리포트 헤더 개인화용 최소 프로필 요약(industry/region_sido/region_sigungu만).

    @SuppressWarnings("unchecked")
    private static Map<String, Object> summary(Map<String, Object> profile) {
        return (Map<String, Object>) ReflectionTestUtils.invokeMethod(
                PipelineService.class, "profileSummary", profile);
    }

    @Test
    void profileSummary_extractsOnlyThreeHeaderFields() {
        Map<String, Object> profile = new HashMap<>();
        profile.put("industry", "카페");
        profile.put("region_sido", "대전");
        profile.put("region_sigungu", "동구");
        profile.put("monthly_revenue_band", "3000_5000");
        profile.put("tax_delinquency", true);

        Map<String, Object> summary = summary(profile);

        assertThat(summary).containsOnlyKeys("industry", "region_sido", "region_sigungu");
        assertThat(summary).containsEntry("industry", "카페")
                .containsEntry("region_sido", "대전")
                .containsEntry("region_sigungu", "동구");
    }

    @Test
    void profileSummary_includesNullFieldsAsNull() {
        Map<String, Object> profile = new HashMap<>();
        profile.put("industry", "카페");
        // region_sido / region_sigungu 누락(웹 온보딩 미매핑 등)

        Map<String, Object> summary = summary(profile);

        assertThat(summary).containsOnlyKeys("industry", "region_sido", "region_sigungu");
        assertThat(summary.get("region_sido")).isNull();
        assertThat(summary.get("region_sigungu")).isNull();
    }
}
