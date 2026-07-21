package com.bizagent.api.profile;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BusinessProfileRepository extends JpaRepository<BusinessProfile, Long> {
    /** 로그인 시 이 사용자의 최신 온보딩 프로필을 찾는다. 한 사용자가 여러 번 온보딩해도 가장 최근 것을 쓴다. */
    Optional<BusinessProfile> findFirstByUserIdOrderByIdDesc(Long userId);
}
