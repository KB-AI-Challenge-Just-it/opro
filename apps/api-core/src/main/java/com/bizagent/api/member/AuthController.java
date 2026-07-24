package com.bizagent.api.member;

import com.bizagent.api.profile.BusinessProfile;
import com.bizagent.api.profile.BusinessProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

/**
 * 평문 id/pw 회원가입·로그인 (MVP — 해싱·세션·JWT 없음, 사용자 명시 요청).
 * 로그인 성공 시 프론트가 localStorage에 그대로 저장해 세션처럼 쓴다(bizagent_session).
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AppUserRepository appUserRepository;
    private final BusinessProfileRepository businessProfileRepository;

    public record SignupRequest(String username, String password, String name) {}
    public record LoginRequest(String username, String password) {}

    @PostMapping("/signup")
    public Map<String, Object> signup(@RequestBody SignupRequest req) {
        if (isBlank(req.username()) || isBlank(req.password()) || isBlank(req.name())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "id/pw/이름은 필수입니다");
        }
        if (appUserRepository.existsByUsername(req.username())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 아이디입니다");
        }
        AppUser user = new AppUser();
        user.setUsername(req.username());
        user.setPassword(req.password());
        user.setDisplayName(req.name());
        AppUser saved = appUserRepository.save(user);

        Map<String, Object> out = new HashMap<>();
        out.put("userId", saved.getId());
        out.put("username", saved.getUsername());
        out.put("name", saved.getDisplayName());
        out.put("profileId", null);
        out.put("preferredNotifyHour", saved.getPreferredNotifyHour());
        return out;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginRequest req) {
        if (isBlank(req.username()) || isBlank(req.password())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "id/pw를 입력해주세요");
        }
        AppUser user = appUserRepository.findByUsername(req.username())
                .filter(u -> req.password().equals(u.getPassword()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다"));

        Long profileId = businessProfileRepository.findFirstByUserIdOrderByIdDesc(user.getId())
                .map(BusinessProfile::getId)
                .orElse(null);

        Map<String, Object> out = new HashMap<>();
        out.put("userId", user.getId());
        out.put("username", user.getUsername());
        out.put("name", user.getDisplayName());
        out.put("profileId", profileId);
        out.put("preferredNotifyHour", user.getPreferredNotifyHour());
        return out;
    }

    /**
     * 계정 단위 알림 수신 시간(07~23시) 수정.
     * 기존 컨벤션대로 클라이언트가 보낸 userId를 그대로 신뢰(별도 인증 토큰 없음 — MVP).
     */
    @PatchMapping("/{userId}/notify-hour")
    public Map<String, Object> updateNotifyHour(@PathVariable Long userId,
                                                @RequestParam int preferredNotifyHour) {
        if (preferredNotifyHour < 7 || preferredNotifyHour > 23) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알림 시간은 07~23시 사이여야 합니다");
        }
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다"));
        user.setPreferredNotifyHour(preferredNotifyHour);
        appUserRepository.save(user);

        Map<String, Object> out = new HashMap<>();
        out.put("userId", user.getId());
        out.put("preferredNotifyHour", user.getPreferredNotifyHour());
        return out;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
