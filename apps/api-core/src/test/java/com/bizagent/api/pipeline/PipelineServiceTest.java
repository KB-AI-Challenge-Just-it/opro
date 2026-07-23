package com.bizagent.api.pipeline;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #79/#102 — L3 match_rationales 병합. rationale이 이제 {"reason","caveats"} 객체로 오며,
 * reason이 유효하면 evidence를 JSON 문자열로 직렬화해 교체하고, 없거나 빈 값이면(또는 객체가
 * 아니면) 규칙 기반 evidence(ai-engine이 이미 JSON으로 채운 폴백)로 폴백되는지 검증한다.
 */
class PipelineServiceTest {

    // objectMapper 필드는 인라인 초기화되어 @RequiredArgsConstructor 대상이 아니므로
    // 주입 대상 5개 final은 null로 넘겨도 mergeRationales/mergeRelevance/profileSummary에 무해하다.
    private static final PipelineService SERVICE =
            new PipelineService(null, null, null, null, null);

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> merge(
            List<Map<String, Object>> matches, Map<String, Object> analysis) {
        return (List<Map<String, Object>>) ReflectionTestUtils.invokeMethod(
                SERVICE, "mergeRationales", matches, analysis);
    }

    private static Map<String, Object> match(String pblancId, String evidence) {
        Map<String, Object> m = new HashMap<>();
        m.put("pblanc_id", pblancId);
        m.put("evidence", evidence);
        return m;
    }

    /** 새 계약(이슈 #102): rationale은 reason/caveats 키를 가진 객체(Map)다. */
    private static Map<String, Object> rationale(Object reason, Object caveats) {
        Map<String, Object> r = new HashMap<>();
        r.put("reason", reason);
        r.put("caveats", caveats);
        return r;
    }

    @Test
    void replacesEvidence_whenRationalePresent() {
        List<Map<String, Object>> matches = List.of(match("P1", "{\"reason\":\"규칙\",\"caveats\":\"\"}"));
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P1", rationale("LLM 생성 근거", "유의사항")));

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence"))
                .isEqualTo("{\"reason\":\"LLM 생성 근거\",\"caveats\":\"유의사항\"}");
    }

    @Test
    void usesEmptyCaveats_whenCaveatsMissingOrNull() {
        List<Map<String, Object>> matches = List.of(
                match("P1", "규칙"), match("P2", "규칙"));
        Map<String, Object> analysis = Map.of("match_rationales", Map.of(
                "P1", Map.of("reason", "이유만 있음"),   // caveats 키 자체 누락
                "P2", rationale("이유 있음", null)));      // caveats null

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence"))
                .isEqualTo("{\"reason\":\"이유만 있음\",\"caveats\":\"\"}");
        assertThat(merged.get(1).get("evidence"))
                .isEqualTo("{\"reason\":\"이유 있음\",\"caveats\":\"\"}");
    }

    @Test
    void keepsRuleEvidence_whenRationaleKeyMissing() {
        List<Map<String, Object>> matches = List.of(match("P1", "규칙 기반 근거"));
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P2", rationale("다른 공고 근거", "")));

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence")).isEqualTo("규칙 기반 근거");
    }

    @Test
    void keepsRuleEvidence_whenReasonBlankOrMissing() {
        List<Map<String, Object>> matches = List.of(
                match("P1", "규칙 기반 근거"), match("P2", "규칙 기반 근거"));
        Map<String, Object> analysis = Map.of("match_rationales", Map.of(
                "P1", rationale("   ", "유의사항"),   // reason 공백
                "P2", Map.of("caveats", "유의사항"))); // reason 키 누락

        List<Map<String, Object>> merged = merge(matches, analysis);

        assertThat(merged.get(0).get("evidence")).isEqualTo("규칙 기반 근거");
        assertThat(merged.get(1).get("evidence")).isEqualTo("규칙 기반 근거");
    }

    @Test
    void keepsRuleEvidence_whenRationaleNotAnObject() {
        // 레거시/비정상: 값이 String 등 객체가 아니면 폴백(교체하지 않음).
        List<Map<String, Object>> matches = List.of(match("P1", "규칙 기반 근거"));
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P1", "그냥 문자열"));

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
                "match_rationales", Map.of("P1", rationale("LLM 생성 근거", "유의사항")));

        merge(matches, analysis);

        assertThat(original.get("evidence")).isEqualTo("규칙 기반 근거");
    }

    // 이슈 #98 — L3 match_relevance 병합. LLM 적합도(0~100)가 유효하면 match_score를 교체하고,
    // 없거나 타입·범위가 안 맞으면 규칙 기반 match_score(이슈 #89)로 폴백되는지 검증한다.

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> mergeRel(
            List<Map<String, Object>> matches, Map<String, Object> analysis) {
        return (List<Map<String, Object>>) ReflectionTestUtils.invokeMethod(
                PipelineService.class, "mergeRelevance", matches, analysis);
    }

    private static Map<String, Object> scored(String pblancId, Object matchScore) {
        Map<String, Object> m = new HashMap<>();
        m.put("pblanc_id", pblancId);
        m.put("match_score", matchScore);
        return m;
    }

    @Test
    void replacesMatchScore_whenRelevancePresent() {
        List<Map<String, Object>> matches = List.of(scored("P1", 40));
        Map<String, Object> analysis = Map.of(
                "match_relevance", Map.of("P1", 85));

        List<Map<String, Object>> merged = mergeRel(matches, analysis);

        assertThat(merged.get(0).get("match_score")).isEqualTo(85);
    }

    @Test
    void replacesMatchScore_whenRelevanceIsDouble() {
        // JSON 역직렬화가 정수를 Double로 넘겨도(예: 90.0) intValue로 유연히 수용.
        List<Map<String, Object>> matches = List.of(scored("P1", 40));
        Map<String, Object> analysis = Map.of(
                "match_relevance", Map.of("P1", 90.0));

        List<Map<String, Object>> merged = mergeRel(matches, analysis);

        assertThat(merged.get(0).get("match_score")).isEqualTo(90);
    }

    @Test
    void keepsRuleScore_whenRelevanceKeyMissing() {
        List<Map<String, Object>> matches = List.of(scored("P1", 40));
        Map<String, Object> analysis = Map.of(
                "match_relevance", Map.of("P2", 85));

        List<Map<String, Object>> merged = mergeRel(matches, analysis);

        assertThat(merged.get(0).get("match_score")).isEqualTo(40);
    }

    @Test
    void keepsRuleScore_whenRelevanceOutOfRange() {
        List<Map<String, Object>> matches = List.of(scored("P1", 40), scored("P2", 55));
        Map<String, Object> analysis = Map.of(
                "match_relevance", Map.of("P1", 150, "P2", -10));

        List<Map<String, Object>> merged = mergeRel(matches, analysis);

        assertThat(merged.get(0).get("match_score")).isEqualTo(40);
        assertThat(merged.get(1).get("match_score")).isEqualTo(55);
    }

    @Test
    void keepsRuleScore_whenRelevanceWrongType() {
        List<Map<String, Object>> matches = List.of(scored("P1", 40));
        Map<String, Object> analysis = Map.of(
                "match_relevance", Map.of("P1", "매우 높음"));

        List<Map<String, Object>> merged = mergeRel(matches, analysis);

        assertThat(merged.get(0).get("match_score")).isEqualTo(40);
    }

    @Test
    void keepsRuleScore_whenRelevanceKeyAbsentFromAnalysis() {
        List<Map<String, Object>> matches = List.of(scored("P1", 40));
        Map<String, Object> analysis = Map.of(
                "match_rationales", Map.of("P1", "근거"));

        List<Map<String, Object>> merged = mergeRel(matches, analysis);

        assertThat(merged.get(0).get("match_score")).isEqualTo(40);
    }

    @Test
    void relevanceAcceptsBoundaryValues() {
        List<Map<String, Object>> matches = List.of(scored("P1", 40), scored("P2", 55));
        Map<String, Object> analysis = Map.of(
                "match_relevance", Map.of("P1", 0, "P2", 100));

        List<Map<String, Object>> merged = mergeRel(matches, analysis);

        assertThat(merged.get(0).get("match_score")).isEqualTo(0);
        assertThat(merged.get(1).get("match_score")).isEqualTo(100);
    }

    @Test
    void doesNotMutateOriginal_whenReplacingScore() {
        Map<String, Object> original = scored("P1", 40);
        List<Map<String, Object>> matches = List.of(original);
        Map<String, Object> analysis = Map.of(
                "match_relevance", Map.of("P1", 85));

        mergeRel(matches, analysis);

        assertThat(original.get("match_score")).isEqualTo(40);
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
