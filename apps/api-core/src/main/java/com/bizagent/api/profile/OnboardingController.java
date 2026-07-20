package com.bizagent.api.profile;

import com.bizagent.api.collect.NtsBizStatusClient;
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
    private final NtsBizStatusClient ntsBizStatusClient;

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
     * 화면1-a · 시/도 선택 후 그 안의 시/군구 목록. 프론트가 두 번째 드롭다운으로 노출.
     */
    @GetMapping("/sigungu")
    public List<Map<String, Object>> listSigungu(@RequestParam String sido) {
        return sbizStoreSearchClient.listSigungu(sido);
    }

    /**
     * 화면1-b · 소진공 상가업소정보 API(B553077) 실 연동.
     * 이 API엔 상호명 검색 오퍼레이션이 없어(juso.go.kr 주소검색 연동은 보류) 선택된 시/군구
     * 전체를 페이지네이션으로 다 받아와 상호명을 서버에서 필터링한다(SbizStoreSearchClient 참고).
     */
    @GetMapping("/stores")
    public List<Map<String, Object>> searchStores(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String sigunguCode) {
        if (sigunguCode == null || sigunguCode.isBlank() || query == null || query.isBlank()) {
            return List.of();
        }
        return sbizStoreSearchClient.searchInSigungu(sigunguCode, query);
    }

    /**
     * 화면2 · 국세청 사업자등록정보 상태조회 API(odcloud) 실 연동.
     * b_stt_cd만 국세청 실측(NtsBizStatusClient) — 나머지(industry·region·marketCode·operatingPeriodBand)는
     * 이 API가 제공하지 않는 필드라 목업값을 임시로 유지한다(실서비스에선 화면1 소진공 검색/직접입력으로 채워짐).
     * 키 미설정·호출 실패 시 verified=false + bizStatus=UNKNOWN 폴백을 200으로 반환한다
     * (프론트가 "국세청 조회 결과를 확인할 수 없습니다" 안내로 직접입력 유도 — page.tsx 513행 근처).
     */
    @GetMapping("/biz-status")
    public Map<String, Object> bizStatus(@RequestParam String bizRegNo) {
        if (bizRegNo == null || !bizRegNo.matches("\\d{10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bizRegNo는 숫자 10자리여야 합니다");
        }
        Map<String, Object> nts = ntsBizStatusClient.status(bizRegNo);
        boolean verified = nts != null;
        String bizStatus = verified ? mapBizStatus(String.valueOf(nts.get("b_stt_cd"))) : "UNKNOWN";
        log.info("[nts] 국세청 상태조회 bizRegNo={} verified={} bizStatus={}", bizRegNo, verified, bizStatus);
        Map<String, Object> out = new java.util.HashMap<>();
        out.put("verified", verified);
        out.put("bizStatus", bizStatus);
        // 국세청 API 미제공 필드 — 목업 임시값 유지(화면2 API 책임 밖).
        out.put("industry", "카페/디저트");
        out.put("regionSido", "서울특별시");
        out.put("regionSigungu", "마포구");
        out.put("marketRegionCode", "11440");
        out.put("marketIndustryCode", "I56194");
        out.put("operatingPeriodBand", "1~3년");
        return out;
    }

    /** 국세청 b_stt_cd → 프론트 재창업 트랙 분기 상태. "01"→계속, "02"→휴업, "03"→폐업. */
    private static String mapBizStatus(String bSttCd) {
        return switch (bSttCd) {
            case "01" -> "ACTIVE";
            case "02" -> "SUSPENDED";
            case "03" -> "CLOSED";
            default -> "UNKNOWN";
        };
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
