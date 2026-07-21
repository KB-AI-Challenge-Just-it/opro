package com.bizagent.api.profile;

import com.bizagent.api.collect.NtsBizStatusClient;
import com.bizagent.api.trigger.MatchStatusTracker;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final BusinessProfileRepository repository;
    private final ProfileMatchTrigger profileMatchTrigger;
    private final NtsBizStatusClient ntsBizStatusClient;
    private final MatchStatusTracker matchStatusTracker;
    private final JdbcTemplate jdbc;

    /**
     * 온보딩 질문지 제출 → 프로필 등록 → 웰컴 리포트(무조건) → 비동기 능동 매칭.
     * 리포트 생성과 매칭 여부를 분리한다(이슈 #47): 매칭이 없어도 제출에는 항상 반응이 와야 한다.
     * 웰컴 리포트는 알림을 만들지 않는다 — 본인이 방금 한 액션이라 알림까지는 불필요.
     * 매칭(BM25+벡터 → Claude 분석 → Claude 리포트 생성)은 가상 스레드로 비동기 실행한다(이슈 #53) —
     * 최대 수 분 걸릴 수 있는 이 과정을 HTTP 응답이 기다리게 하지 않는다. 프론트는
     * GET /api/onboarding/{id}/match-status를 폴링해 진행 단계를 스텝퍼로 보여준다.
     */
    @PostMapping
    public BusinessProfile submit(@RequestBody BusinessProfile profile) {
        BusinessProfile saved = repository.save(profile);
        try {
            createWelcomeReport(saved);
        } catch (Exception e) {
            log.warn("웰컴 리포트 생성 실패 (프로필 저장은 정상): profileId={}, {}", saved.getId(), e.toString());
        }
        Thread.ofVirtual().start(() -> {
            try {
                profileMatchTrigger.runForProfile(saved.getId());
            } catch (Exception e) {
                log.warn("온보딩 직후 매칭 실패 (프로필 저장은 정상): profileId={}, {}", saved.getId(), e.toString());
                matchStatusTracker.fail(saved.getId());
            }
        });
        return saved;
    }

    /** 이슈 #53 — 온보딩 직후 비동기 매칭 진행 단계 폴링용. */
    @GetMapping("/{id}/match-status")
    public Map<String, Object> matchStatus(@PathVariable Long id) {
        MatchStatusTracker.Status status = matchStatusTracker.get(id);
        Map<String, Object> out = new java.util.HashMap<>();
        out.put("stage", status.stage().name());
        if (status.reportId() != null) out.put("reportId", status.reportId());
        return out;
    }

    /** Claude 호출 없이 고정 템플릿으로 생성 — 이 시점엔 매칭 여부와 무관한 실질 정보가 없어 비용을 안 쓴다. */
    private void createWelcomeReport(BusinessProfile saved) {
        String bodyMd = """
                # 🎉 등록이 완료됐어요

                %s · %s %s 프로필이 등록됐습니다.
                사장님께 맞는 정책자금 공고가 새로 나오면 바로 알려드릴게요.
                """.formatted(saved.getIndustry(), saved.getRegionSido(), saved.getRegionSigungu());
        jdbc.update("""
                INSERT INTO report (profile_id, analysis_id, body_md, pushed_at)
                VALUES (?, NULL, ?, now())
                """, saved.getId(), bodyMd);
    }

    @GetMapping("/{id}")
    public BusinessProfile get(@PathVariable Long id) {
        return repository.findById(id).orElseThrow();
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
