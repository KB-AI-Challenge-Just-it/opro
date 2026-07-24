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
}
