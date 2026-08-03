package com.bizagent.api.member;

import at.favre.lib.crypto.bcrypt.BCrypt;
import com.bizagent.api.profile.BusinessProfile;
import com.bizagent.api.profile.BusinessProfileRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

/**
 * id/pw 회원가입·로그인 (MVP — 세션·JWT 없음, 사용자 명시 요청. 로그인 성공 시 프론트가
 * localStorage에 그대로 저장해 세션처럼 쓴다: bizagent_session).
 *
 * 비밀번호는 BCrypt로 해싱해 저장한다. 기존에 평문으로 저장된 계정도 있어(해싱 도입 전 가입),
 * 로그인 시 저장값이 BCrypt 해시 형태($2로 시작)가 아니면 평문 비교 후 통과 시 그 자리에서
 * 해시로 재저장한다(lazy migration) — 기존 계정 로그인을 끊지 않으면서 점진적으로 안전하게 전환.
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
        user.setPassword(BCrypt.withDefaults().hashToString(12, req.password().toCharArray()));
        user.setDisplayName(req.name());
        AppUser saved = appUserRepository.save(user);

        Map<String, Object> out = new HashMap<>();
        out.put("userId", saved.getId());
        out.put("username", saved.getUsername());
        out.put("name", saved.getDisplayName());
        out.put("profileId", null);
        out.put("preferredNotifyHour", saved.getPreferredNotifyHour());
        out.put("preferredNotifyMinute", saved.getPreferredNotifyMinute());
        return out;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginRequest req) {
        if (isBlank(req.username()) || isBlank(req.password())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "id/pw를 입력해주세요");
        }
        AppUser user = appUserRepository.findByUsername(req.username())
                .filter(u -> passwordMatches(req.password(), u))
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
        out.put("preferredNotifyMinute", user.getPreferredNotifyMinute());
        return out;
    }

    /**
     * 계정 단위 알림 수신 시각(07~23시, 0~59분) 수정.
     * 기존 컨벤션대로 클라이언트가 보낸 userId를 그대로 신뢰(별도 인증 토큰 없음 — MVP).
     */
    @PatchMapping("/{userId}/notify-time")
    public Map<String, Object> updateNotifyTime(@PathVariable Long userId,
                                                 @RequestParam int preferredNotifyHour,
                                                 @RequestParam int preferredNotifyMinute) {
        if (preferredNotifyHour < 7 || preferredNotifyHour > 23) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알림 시간은 07~23시 사이여야 합니다");
        }
        if (preferredNotifyMinute < 0 || preferredNotifyMinute > 59) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "알림 분은 0~59 사이여야 합니다");
        }
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다"));
        user.setPreferredNotifyHour(preferredNotifyHour);
        user.setPreferredNotifyMinute(preferredNotifyMinute);
        appUserRepository.save(user);

        Map<String, Object> out = new HashMap<>();
        out.put("userId", user.getId());
        out.put("preferredNotifyHour", user.getPreferredNotifyHour());
        out.put("preferredNotifyMinute", user.getPreferredNotifyMinute());
        return out;
    }

    /** BCrypt 해시($2로 시작)면 해시 비교, 아니면(해싱 도입 전 평문 계정) 평문 비교 후
     *  통과 시 그 자리에서 해시로 재저장한다. */
    private boolean passwordMatches(String rawPassword, AppUser user) {
        String stored = user.getPassword();
        if (stored != null && stored.startsWith("$2")) {
            return BCrypt.verifyer().verify(rawPassword.toCharArray(), stored).verified;
        }
        if (!rawPassword.equals(stored)) {
            return false;
        }
        user.setPassword(BCrypt.withDefaults().hashToString(12, rawPassword.toCharArray()));
        appUserRepository.save(user);
        return true;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
