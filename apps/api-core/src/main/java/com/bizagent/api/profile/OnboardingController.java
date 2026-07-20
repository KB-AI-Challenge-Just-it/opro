package com.bizagent.api.profile;

import com.bizagent.api.trigger.ProfileMatchTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final BusinessProfileRepository repository;
    private final ProfileMatchTrigger profileMatchTrigger;

    /** 온보딩 질문지 제출 → 프로필 등록 → 동기 능동 매칭. TODO: Q9 국세청 상태조회 연동, 유효성 검증 */
    @PostMapping
    public BusinessProfile submit(@RequestBody BusinessProfile profile) {
        BusinessProfile saved = repository.save(profile);
        // 매칭 실패가 온보딩 저장을 막으면 안 된다 — 실패 시 로그만 남기고 저장된 프로필 반환.
        try {
            profileMatchTrigger.runForProfile(saved.getId());
        } catch (Exception e) {
            log.warn("온보딩 직후 매칭 실패 (프로필 저장은 정상): profileId={}, {}", saved.getId(), e.toString());
        }
        return saved;
    }

    @GetMapping("/{id}")
    public BusinessProfile get(@PathVariable Long id) {
        return repository.findById(id).orElseThrow();
    }
}
