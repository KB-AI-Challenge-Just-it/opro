package com.bizagent.api.profile;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final BusinessProfileRepository repository;

    /** 온보딩 질문지 제출 → 프로필 등록. TODO: Q9 국세청 상태조회 연동, 유효성 검증 */
    @PostMapping
    public BusinessProfile submit(@RequestBody BusinessProfile profile) {
        return repository.save(profile);
    }

    @GetMapping("/{id}")
    public BusinessProfile get(@PathVariable Long id) {
        return repository.findById(id).orElseThrow();
    }
}
