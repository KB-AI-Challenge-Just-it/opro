package com.bizagent.api.member;

import com.bizagent.api.profile.BusinessProfileRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 이슈 #112 — PATCH /api/auth/{userId}/notify-hour.
 * 계정 단위 알림 시간(07~23시) 수정. 범위 밖 400, 없는 사용자 404, 정상 저장 검증.
 */
class AuthControllerTest {

    private static final long USER_ID = 5L;

    private AuthController controller(AppUserRepository repo) {
        return new AuthController(repo, mock(BusinessProfileRepository.class));
    }

    @Test
    void updateNotifyHour_rejectsBelowRange_with400() {
        AppUserRepository repo = mock(AppUserRepository.class);

        assertThatThrownBy(() -> controller(repo).updateNotifyHour(USER_ID, 6))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(repo, never()).save(any());
    }

    @Test
    void updateNotifyHour_rejectsAboveRange_with400() {
        AppUserRepository repo = mock(AppUserRepository.class);

        assertThatThrownBy(() -> controller(repo).updateNotifyHour(USER_ID, 24))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(repo, never()).save(any());
    }

    @Test
    void updateNotifyHour_acceptsBoundaries_7and23() {
        AppUserRepository repo = mock(AppUserRepository.class);
        AppUser user = new AppUser();
        user.setId(USER_ID);
        when(repo.findById(USER_ID)).thenReturn(Optional.of(user));

        controller(repo).updateNotifyHour(USER_ID, 7);
        assertThat(user.getPreferredNotifyHour()).isEqualTo(7);

        controller(repo).updateNotifyHour(USER_ID, 23);
        assertThat(user.getPreferredNotifyHour()).isEqualTo(23);
    }

    @Test
    void updateNotifyHour_savesValidHour() {
        AppUserRepository repo = mock(AppUserRepository.class);
        AppUser user = new AppUser();
        user.setId(USER_ID);
        when(repo.findById(USER_ID)).thenReturn(Optional.of(user));

        controller(repo).updateNotifyHour(USER_ID, 14);

        assertThat(user.getPreferredNotifyHour()).isEqualTo(14);
        verify(repo).save(user);
    }

    @Test
    void updateNotifyHour_unknownUser_with404() {
        AppUserRepository repo = mock(AppUserRepository.class);
        when(repo.findById(USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller(repo).updateNotifyHour(USER_ID, 10))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }
}
