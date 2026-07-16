package com.bizagent.api.collect;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class SbizCollectorTest {

    @Test
    void collect_returnsZeroWithoutCallingDb_whenApiKeyIsBlank() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SbizCollector collector = new SbizCollector(jdbc);
        ReflectionTestUtils.setField(collector, "apiKey", "");

        int result = collector.collect();

        assertThat(result).isZero();
        verifyNoInteractions(jdbc);
    }

    @Test
    void collect_returnsZeroWithoutCallingDb_whenApiKeyIsNull() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SbizCollector collector = new SbizCollector(jdbc);
        ReflectionTestUtils.setField(collector, "apiKey", null);

        int result = collector.collect();

        assertThat(result).isZero();
        verifyNoInteractions(jdbc);
    }
}
