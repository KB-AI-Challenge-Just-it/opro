package com.bizagent.api.profile;

import com.bizagent.api.trigger.MatchStatusTracker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final BusinessProfileRepository repository;
    private final MatchStatusTracker matchStatusTracker;
    private final JdbcTemplate jdbc;

    /**
     * 온보딩 질문지 제출 → 프로필 등록 → 웰컴 리포트(무조건).
     * 리포트 생성과 매칭 여부를 분리한다(이슈 #47): 매칭이 없어도 제출에는 항상 반응이 와야 한다.
     * 웰컴 리포트는 알림을 만들지 않는다 — 본인이 방금 한 액션이라 알림까지는 불필요.
     *
     * 첫 리포트 생성은 대화형 2-콜 컨설팅(POST /api/consult/diagnose → /specialize)이 담당한다 —
     * 프론트가 온보딩 완료 직후 /consult/loading-diagnosis 로 이동시킨다. 예전의 온보딩 직후
     * 비동기 능동 매칭(runForProfile)은 여기서 제거했다: 그대로 두면 온보딩 한 번에 (답변을 반영하지
     * 않은) 리포트가 하나 더 생성되고 알림이 중복되며 Claude 비용이 두 배로 든다. 사용자의 재질문
     * 답변을 무시한 리포트가 먼저 도착해 이 기능의 핵심 가치를 훼손하기도 한다.
     * runForProfile 자체는 매시간 배치(ScheduledJobs.hourlyMatchTrigger)와 수동 데모(/api/agent/check)가 계속 쓴다.
     * (수집·인덱싱만 일일 배치 — ScheduledJobs.collectAndIndex, 매일 06:00 1회)
     */
    @PostMapping
    public BusinessProfile submit(@RequestBody BusinessProfile profile) {
        BusinessProfile saved = repository.save(profile);
        try {
            createWelcomeReport(saved);
        } catch (Exception e) {
            log.warn("웰컴 리포트 생성 실패 (프로필 저장은 정상): profileId={}, {}", saved.getId(), e.toString());
        }
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

    /** 질문 목록 조회 — 이 사용자가 지금까지 제출한 온보딩(질문지) 전체를 최신순으로. */
    @GetMapping("/mine")
    public java.util.List<BusinessProfile> mine(@RequestParam Long userId) {
        return repository.findByUserIdOrderByIdDesc(userId);
    }
}
