package com.bizagent.api.profile;

import com.bizagent.api.collect.NtsBizStatusClient;
import com.bizagent.api.trigger.MatchStatusTracker;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 이슈 #110 — PATCH /api/onboarding/{id}/notify-hour.
 *
 * 범위(07~23) 검증과 userId 소유권 검증(다른 사용자면 404, 존재 자체를 숨김 — 이슈 #57 패턴)을
 * 컨트롤러 경계에서 확인한다. repository 는 Mockito mock 으로 대체.
 */
class OnboardingControllerNotifyHourTest {

    private static final long PROFILE_ID = 5L;
    private static final long OWNER = 7L;
    private static final long OTHER = 99L;

    private static OnboardingController controller(BusinessProfileRepository repo) {
        return new OnboardingController(
                repo,
                mock(ProfileMatchTrigger.class),
                mock(NtsBizStatusClient.class),
                mock(MatchStatusTracker.class),
                mock(JdbcTemplate.class));
    }

    private static BusinessProfile profileOwnedBy(long userId) {
        BusinessProfile p = new BusinessProfile();
        p.setId(PROFILE_ID);
        p.setUserId(userId);
        return p;
    }

    @Test
    void updateNotifyHour_persistsWhenInRangeAndOwner() {
        BusinessProfileRepository repo = mock(BusinessProfileRepository.class);
        BusinessProfile profile = profileOwnedBy(OWNER);
        when(repo.findById(PROFILE_ID)).thenReturn(Optional.of(profile));

        controller(repo).updateNotifyHour(PROFILE_ID, OWNER, 21);

        assertThat(profile.getPreferredNotifyHour()).isEqualTo(21);
        verify(repo).save(profile);
    }

    @Test
    void updateNotifyHour_rejectsBelowRange_with400() {
        BusinessProfileRepository repo = mock(BusinessProfileRepository.class);

        assertThatThrownBy(() -> controller(repo).updateNotifyHour(PROFILE_ID, OWNER, 6))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
        // 범위 위반은 DB 접근 전에 걸러야 한다.
        verify(repo, never()).findById(PROFILE_ID);
        verify(repo, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void updateNotifyHour_rejectsAboveRange_with400() {
        BusinessProfileRepository repo = mock(BusinessProfileRepository.class);

        assertThatThrownBy(() -> controller(repo).updateNotifyHour(PROFILE_ID, OWNER, 24))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
        verify(repo, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void updateNotifyHour_hidesOtherUsersProfile_with404() {
        BusinessProfileRepository repo = mock(BusinessProfileRepository.class);
        when(repo.findById(PROFILE_ID)).thenReturn(Optional.of(profileOwnedBy(OWNER)));

        assertThatThrownBy(() -> controller(repo).updateNotifyHour(PROFILE_ID, OTHER, 21))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
        // 소유권 불일치 시 값을 저장하지 않는다.
        verify(repo, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void updateNotifyHour_missingProfile_with404() {
        BusinessProfileRepository repo = mock(BusinessProfileRepository.class);
        when(repo.findById(PROFILE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller(repo).updateNotifyHour(PROFILE_ID, OWNER, 21))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }
}
