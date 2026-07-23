package com.bizagent.api.report;

import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;

import java.sql.ResultSet;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 이슈 #89 회귀 방지 — ReportController.MATCH_MAPPER 의 match_score nullable 처리.
 *
 * 핵심 함정: JDBC wasNull() 은 "가장 최근 get* 호출" 결과를 참조한다. getInt("match_score") 로
 * SQL NULL 을 읽으면 0 + wasNull=true 가 되지만, 이후 getString("detail_url") 등 다른 getter 가
 * 호출되면 wasNull 이 그 컬럼 기준으로 리셋된다. 따라서 legacy row(match_score IS NULL AND
 * detail_url IS NOT NULL)에서 wasNull 캡처를 미루면 detail_url 의 non-null 로 잘못 판정되어
 * matchScore 가 null 이 아닌 0 으로 새어나간다. 아래 fakeRs 는 이 wasNull 시맨틱을 그대로 재현하여
 * 캡처 시점이 잘못되면 실제로 테스트가 깨지도록 한다.
 */
class ReportMatchMapperTest {

    /**
     * wasNull() 이 직전 get* 결과를 반영하는 실제 JDBC 시맨틱을 흉내내는 ResultSet 목.
     * @param scoreValue getInt("match_score") 반환값
     * @param scoreIsNull match_score 가 SQL NULL 인지 (getInt 호출 시 wasNull 상태로 반영)
     * @param detailUrl getString("detail_url") 반환값 (non-null 이면 이후 wasNull 을 false 로 리셋)
     */
    private static ResultSet fakeRs(int scoreValue, boolean scoreIsNull, String detailUrl) {
        ResultSet rs = mock(ResultSet.class);
        AtomicBoolean lastWasNull = new AtomicBoolean(false);
        try {
            when(rs.getInt("match_score")).thenAnswer((Answer<Integer>) inv -> {
                lastWasNull.set(scoreIsNull);
                return scoreValue;
            });
            // 나머지 컬럼은 문자열 — 값이 null 인지에 따라 wasNull 상태를 갱신한다.
            when(rs.getString(anyString())).thenAnswer((Answer<String>) inv -> {
                String col = inv.getArgument(0);
                String val = switch (col) {
                    case "pblanc_id" -> "P1";
                    case "title" -> "테스트 공고";
                    case "evidence" -> "근거";
                    case "apply_end" -> "2026-12-31";
                    case "detail_url" -> detailUrl;
                    default -> null;
                };
                lastWasNull.set(val == null);
                return val;
            });
            when(rs.wasNull()).thenAnswer((Answer<Boolean>) inv -> lastWasNull.get());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return rs;
    }

    @Test
    void matchScoreNull_whenColumnIsNull_evenIfDetailUrlNonNull() throws Exception {
        // legacy row: match_score IS NULL AND detail_url IS NOT NULL (opro-postgres-1 id 5,6,7,13~19 등)
        ResultSet rs = fakeRs(0, true, "https://example.com/apply");

        ReportDetail.Match m = ReportController.MATCH_MAPPER.mapRow(rs, 1);

        assertThat(m.matchScore()).isNull();          // 0 이 아니라 null 이어야 UI 가드가 프로그레스 바를 숨긴다
        assertThat(m.detailUrl()).isEqualTo("https://example.com/apply");
    }

    @Test
    void matchScorePreserved_whenColumnHasValue() throws Exception {
        ResultSet rs = fakeRs(67, false, "https://example.com/apply");

        ReportDetail.Match m = ReportController.MATCH_MAPPER.mapRow(rs, 1);

        assertThat(m.matchScore()).isEqualTo(67);
    }

    @Test
    void matchScoreZero_whenColumnIsExplicitZero() throws Exception {
        // 실제 값 0 (체크리스트 0/3 충족)은 null 과 구분되어 0 으로 보존돼야 한다.
        ResultSet rs = fakeRs(0, false, "https://example.com/apply");

        ReportDetail.Match m = ReportController.MATCH_MAPPER.mapRow(rs, 1);

        assertThat(m.matchScore()).isEqualTo(0);
    }
}
