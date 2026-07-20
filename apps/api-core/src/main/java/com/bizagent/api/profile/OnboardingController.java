package com.bizagent.api.profile;

import com.bizagent.api.collect.SbizStoreSearchClient;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final BusinessProfileRepository repository;
    private final ProfileMatchTrigger profileMatchTrigger;
    private final SbizStoreSearchClient sbizStoreSearchClient;

    /** 온보딩 질문지 제출 → 프로필 등록 → 동기 능동 매칭. TODO: 유효성 검증 */
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

    /**
     * 화면1 · 소진공 상가업소정보 API(B553077) 실 연동.
     * 이 API엔 상호명 검색 오퍼레이션이 없어 시/도 단위로 목록을 받아 상호명을 서버에서 필터링한다
     * (SbizStoreSearchClient 참고 — 그 시/도 최초 1000건 안에서만 찾을 수 있는 구조적 한계).
     * sido 없이 호출되면(구 프론트 호환 등) 지역을 특정할 수 없어 빈 목록을 반환한다.
     */
    @GetMapping("/stores")
    public List<Map<String, Object>> searchStores(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String sido) {
        if (sido == null || sido.isBlank() || query == null || query.isBlank()) {
            return List.of();
        }
        return sbizStoreSearchClient.search(sido, query);
    }

    /**
     * 화면2 · 국세청 사업자등록정보 상태조회 API 목업. 실 연동은 범위 밖 — TODO(실연동): data.go.kr 국세청 상태조회.
     * bizRegNo 형식(숫자 10자리)만 검증하고 값 자체는 항상 동일한 목업 데이터를 돌려준다.
     */
    @GetMapping("/biz-status")
    public Map<String, Object> bizStatus(@RequestParam String bizRegNo) {
        if (bizRegNo == null || !bizRegNo.matches("\\d{10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bizRegNo는 숫자 10자리여야 합니다");
        }
        log.info("[mock] 국세청 상태조회 bizRegNo={}", bizRegNo);
        return Map.of(
            "verified", true,
            "bizStatus", "ACTIVE",
            "industry", "카페/디저트",
            "regionSido", "서울특별시",
            "regionSigungu", "마포구",
            "marketRegionCode", "11440",
            "marketIndustryCode", "I56194",
            "operatingPeriodBand", "1~3년"
        );
    }

    /**
     * 화면3 · 국민연금 가입 사업장 내역 API 목업 (참고용 기본값). 실 연동은 범위 밖.
     */
    @GetMapping("/pension-default")
    public Map<String, Object> pensionDefault(@RequestParam String bizRegNo) {
        if (bizRegNo == null || !bizRegNo.matches("\\d{10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bizRegNo는 숫자 10자리여야 합니다");
        }
        log.info("[mock] 국민연금 기본값 조회 bizRegNo={}", bizRegNo);
        return Map.of("employeeBand", "1~4명");
    }
}
