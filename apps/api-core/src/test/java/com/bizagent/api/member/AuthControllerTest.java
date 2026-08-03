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

import at.favre.lib.crypto.bcrypt.BCrypt;

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

        assertThatThrownBy(() -> controller(repo).updateNotifyTime(USER_ID, 6, 0))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(repo, never()).save(any());
    }

    @Test
    void updateNotifyHour_rejectsAboveRange_with400() {
        AppUserRepository repo = mock(AppUserRepository.class);

        assertThatThrownBy(() -> controller(repo).updateNotifyTime(USER_ID, 24, 0))
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

        controller(repo).updateNotifyTime(USER_ID, 7, 0);
        assertThat(user.getPreferredNotifyHour()).isEqualTo(7);

        controller(repo).updateNotifyTime(USER_ID, 23, 0);
        assertThat(user.getPreferredNotifyHour()).isEqualTo(23);
    }

    @Test
    void updateNotifyHour_savesValidHour() {
        AppUserRepository repo = mock(AppUserRepository.class);
        AppUser user = new AppUser();
        user.setId(USER_ID);
        when(repo.findById(USER_ID)).thenReturn(Optional.of(user));

        controller(repo).updateNotifyTime(USER_ID, 14, 0);

        assertThat(user.getPreferredNotifyHour()).isEqualTo(14);
        verify(repo).save(user);
    }

    @Test
    void updateNotifyHour_unknownUser_with404() {
        AppUserRepository repo = mock(AppUserRepository.class);
        when(repo.findById(USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller(repo).updateNotifyTime(USER_ID, 10, 0))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    /**
     * 비밀번호 평문 저장·비교 → BCrypt 전환. 기존 평문 계정도 로그인은 끊기지 않고
     * 그 자리에서 해시로 자동 마이그레이션되는지 검증(lazy migration).
     */
    @Test
    void signup_storesBcryptHash_notPlaintext() {
        AppUserRepository repo = mock(AppUserRepository.class);
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        controller(repo).signup(new AuthController.SignupRequest("newuser", "raw-password", "이름"));
        verify(repo).save(any());

        // save에 전달된 실제 AppUser를 캡처해 저장된 password가 평문이 아닌 BCrypt 해시인지 확인
        org.mockito.ArgumentCaptor<AppUser> captor = org.mockito.ArgumentCaptor.forClass(AppUser.class);
        verify(repo).save(captor.capture());
        AppUser passed = captor.getValue();
        assertThat(passed.getPassword()).isNotEqualTo("raw-password");
        assertThat(passed.getPassword()).startsWith("$2");
        assertThat(BCrypt.verifyer().verify("raw-password".toCharArray(), passed.getPassword()).verified).isTrue();
    }

    @Test
    void login_succeeds_whenPasswordAlreadyBcryptHashed() {
        AppUserRepository repo = mock(AppUserRepository.class);
        BusinessProfileRepository profileRepo = mock(BusinessProfileRepository.class);
        AppUser user = new AppUser();
        user.setId(USER_ID);
        user.setUsername("hashed-user");
        user.setPassword(BCrypt.withDefaults().hashToString(12, "correct-pw".toCharArray()));
        when(repo.findByUsername("hashed-user")).thenReturn(Optional.of(user));
        when(profileRepo.findFirstByUserIdOrderByIdDesc(USER_ID)).thenReturn(Optional.empty());

        var result = new AuthController(repo, profileRepo)
                .login(new AuthController.LoginRequest("hashed-user", "correct-pw"));

        assertThat(result.get("userId")).isEqualTo(USER_ID);
        verify(repo, never()).save(any()); // 이미 해시라 재저장 없음
    }

    @Test
    void login_legacyPlaintextAccount_stillLogsIn_andUpgradesToHash() {
        AppUserRepository repo = mock(AppUserRepository.class);
        BusinessProfileRepository profileRepo = mock(BusinessProfileRepository.class);
        AppUser user = new AppUser();
        user.setId(USER_ID);
        user.setUsername("legacy-user");
        user.setPassword("plaintext-pw"); // 해싱 도입 전 가입한 계정
        when(repo.findByUsername("legacy-user")).thenReturn(Optional.of(user));
        when(profileRepo.findFirstByUserIdOrderByIdDesc(USER_ID)).thenReturn(Optional.empty());

        var result = new AuthController(repo, profileRepo)
                .login(new AuthController.LoginRequest("legacy-user", "plaintext-pw"));

        assertThat(result.get("userId")).isEqualTo(USER_ID); // 기존 계정 로그인 안 끊김
        assertThat(user.getPassword()).startsWith("$2"); // 그 자리에서 해시로 업그레이드
        verify(repo).save(user);
    }

    @Test
    void login_wrongPassword_rejectedWith401() {
        AppUserRepository repo = mock(AppUserRepository.class);
        BusinessProfileRepository profileRepo = mock(BusinessProfileRepository.class);
        AppUser user = new AppUser();
        user.setUsername("someone");
        user.setPassword(BCrypt.withDefaults().hashToString(12, "right-pw".toCharArray()));
        when(repo.findByUsername("someone")).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> new AuthController(repo, profileRepo)
                .login(new AuthController.LoginRequest("someone", "wrong-pw")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
