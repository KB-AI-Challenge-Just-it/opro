package com.bizagent.api.consult;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 콜1/콜2 사이를 잇는 순수 조립 로직 검증.
 * DB·AI 호출이 없는 static 헬퍼만 대상으로 한다(PipelineServiceTest와 동일한 방식).
 */
class ConsultationServiceTest {

    private static String formatAnswers(List<Map<String, Object>> answers) {
        return (String) ReflectionTestUtils.invokeMethod(
                ConsultationService.class, "formatAnswers", answers);
    }

    private static String buildEnrichedQuery(String baseQuery, String diagnosisText, String answersText) {
        return (String) ReflectionTestUtils.invokeMethod(
                ConsultationService.class, "buildEnrichedQuery", baseQuery, diagnosisText, answersText);
    }

    private static Map<String, Object> answer(String question, Object value) {
        Map<String, Object> a = new HashMap<>();
        a.put("question", question);
        a.put("value", value);
        return a;
    }

    @Test
    void formatAnswers_rendersQuestionAndValuePairs() {
        String out = formatAnswers(List.of(
                answer("최근 3개월 매출 추이는?", "줄었다"),
                answer("가장 큰 고민은?", "임대료 인상")));

        assertThat(out).contains("최근 3개월 매출 추이는?");
        assertThat(out).contains("줄었다");
        assertThat(out).contains("임대료 인상");
    }

    @Test
    void formatAnswers_returnsEmptyString_whenAnswersNull() {
        assertThat(formatAnswers(null)).isEmpty();
    }

    @Test
    void formatAnswers_returnsEmptyString_whenAnswersEmpty() {
        assertThat(formatAnswers(List.of())).isEmpty();
    }

    @Test
    void formatAnswers_skipsBlankValues() {
        String out = formatAnswers(List.of(
                answer("답한 질문", "실제 답변"),
                answer("건너뛴 질문", "")));

        assertThat(out).contains("실제 답변");
        assertThat(out).doesNotContain("건너뛴 질문");
    }

    @Test
    void buildEnrichedQuery_includesAllThreeParts() {
        String out = buildEnrichedQuery(
                "마포구에서 카페/디저트를 운영 중이며 운영자금 마련이 필요합니다",
                "경쟁강도가 높은 상권입니다",
                "최근 3개월 매출 추이는? → 줄었다");

        assertThat(out).contains("마포구에서 카페/디저트를 운영 중");
        assertThat(out).contains("경쟁강도가 높은 상권입니다");
        assertThat(out).contains("줄었다");
    }

    @Test
    void buildEnrichedQuery_omitsDiagnosisSection_whenBlank() {
        String out = buildEnrichedQuery("기본 쿼리", "", "답변 있음");

        assertThat(out).contains("기본 쿼리");
        assertThat(out).contains("답변 있음");
        assertThat(out).doesNotContain("[경영 진단]");
    }

    @Test
    void buildEnrichedQuery_omitsAnswersSection_whenSkipped() {
        // 재질문 스킵 경로 — 답변이 비어도 진단 기반으로 매칭이 진행돼야 한다.
        String out = buildEnrichedQuery("기본 쿼리", "진단 내용", "");

        assertThat(out).contains("기본 쿼리");
        assertThat(out).contains("진단 내용");
        assertThat(out).doesNotContain("[추가 확인 사항]");
    }

    @Test
    void buildEnrichedQuery_returnsBaseQueryOnly_whenNothingElse() {
        assertThat(buildEnrichedQuery("기본 쿼리", "", "")).isEqualTo("기본 쿼리");
    }
}
