package com.bizagent.api.notification.kakao;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * GET /status, DELETE /connection — kakao_token 은 profile_id 단위 row라 프로필마다
 * 독립적으로 연동 여부를 조회·해제할 수 있어야 한다(한 프로필만 알림을 끄는 시나리오).
 */
class KakaoOAuthControllerTest {

    private static final long PROFILE_ID = 7L;

    @Test
    void status_returnsConnectedTrue_whenTokenRowExists() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(org.mockito.ArgumentMatchers.contains("count(*)"),
                eq(Long.class), eq(PROFILE_ID))).thenReturn(1L);
        KakaoOAuthController controller = new KakaoOAuthController(mock(KakaoApiClient.class), jdbc);

        Map<String, Object> result = controller.status(PROFILE_ID);

        assertThat(result).containsEntry("connected", true);
    }

    @Test
    void status_returnsConnectedFalse_whenNoTokenRow() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(org.mockito.ArgumentMatchers.contains("count(*)"),
                eq(Long.class), eq(PROFILE_ID))).thenReturn(0L);
        KakaoOAuthController controller = new KakaoOAuthController(mock(KakaoApiClient.class), jdbc);

        Map<String, Object> result = controller.status(PROFILE_ID);

        assertThat(result).containsEntry("connected", false);
    }

    @Test
    void disconnect_deletesOnlyThatProfilesTokenRow() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        KakaoOAuthController controller = new KakaoOAuthController(mock(KakaoApiClient.class), jdbc);

        controller.disconnect(PROFILE_ID);

        verify(jdbc).update(org.mockito.ArgumentMatchers.contains("DELETE FROM kakao_token"), eq(PROFILE_ID));
    }
}
