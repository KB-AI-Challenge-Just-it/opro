package com.bizagent.api.aiclient;

import com.bizagent.api.collect.BizinfoCollector;
import com.bizagent.api.collect.EcosCollector;
import com.bizagent.api.collect.SbizCollector;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/** 데모·수동 실행용 엔드포인트 */
@Slf4j
@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentController {

    private final ProfileMatchTrigger profileMatchTrigger;
    private final AiEngineClient aiEngine;
    private final JdbcTemplate jdbc;
    private final BizinfoCollector bizinfoCollector;
    private final EcosCollector ecosCollector;
    private final SbizCollector sbizCollector;

    /** 수집(기업마당·ECOS·소진공) + 인덱스 재구성 즉시 실행 (ScheduledJobs.dailyRun의 06:00 크론을
     *  안 기다리고 데모/테스트용으로 수동 트리거). 매칭 재실행은 하지 않는다 — 필요하면 /check 별도 호출. */
    @PostMapping("/collect")
    public Map<String, Object> collect() {
        Map<String, Object> res = new HashMap<>();
        try {
            res.put("bizinfo", bizinfoCollector.collect());
            res.put("ecos", ecosCollector.collect());
            res.put("sbiz", sbizCollector.collect());
            res.put("indexed", aiEngine.rebuildIndexes());
            res.put("status", "OK");
        } catch (Exception e) {
            log.warn("수동 수집 실행 실패: {}", e.toString());
            res.put("status", "ERROR");
            res.put("message", e.getMessage());
        }
        return res;
    }

    /** 자동/수동 수집 상태 조회 (이슈 #70). realCount==0 이면 시드만 존재하는 상태다. */
    @GetMapping("/collect/status")
    public Map<String, Object> collectStatus() {
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM policy_announcement", Integer.class);
        Integer realCount = jdbc.queryForObject(
                "SELECT count(*) FROM policy_announcement WHERE pblanc_id NOT LIKE 'DEMO-%'", Integer.class);
        long totalCount = total == null ? 0 : total;
        long real = realCount == null ? 0 : realCount;
        Map<String, Object> res = new HashMap<>();
        res.put("total", totalCount);
        res.put("realCount", real);
        res.put("seedOnly", real == 0);
        return res;
    }

    /** 특정 프로필 능동 매칭 즉시 실행 (스케줄 안 기다리고 데모). 이미 알린 공고는 재알림하지 않음. */
    @PostMapping("/check/{profileId}")
    public Map<String, Object> check(@PathVariable Long profileId) {
        Map<String, Object> res = new HashMap<>();
        res.put("profileId", profileId);
        try {
            var result = profileMatchTrigger.runForProfile(profileId);
            res.put("newMatches", result.newMatchCount());
            res.put("status", result.newMatchCount() > 0 ? "PROCESSED" : "NO_NEW_MATCH");
            if (result.reportId() != null) res.put("reportId", result.reportId());
        } catch (Exception e) {
            // OnboardingController.submit / ScheduledJobs.dailyRun과 동일하게 방어 —
            // 데모 호출자에게 원시 500 대신 실패 상태를 반환한다.
            log.warn("[profile={}] 수동 매칭 실행 실패: {}", profileId, e.toString());
            res.put("status", "ERROR");
            res.put("message", e.getMessage());
        }
        return res;
    }

    /** 확장(5-3): 리포트에서 매칭된 공고의 신청서 초안 생성 */
    @PostMapping("/draft")
    public Map<String, Object> draft(@RequestParam Long reportId, @RequestParam String pblancId) {
        Map<String, Object> rep = jdbc.queryForMap("""
            SELECT r.profile_id, a.cause_text FROM report r
            JOIN analysis_result a ON a.id = r.analysis_id WHERE r.id = ?
            """, reportId);
        Map<String, Object> profile = jdbc.queryForMap(
                "SELECT * FROM business_profile WHERE id = ?", rep.get("profile_id"));
        Map<String, Object> ann = jdbc.queryForMap(
                "SELECT pblanc_id, title, summary_html, target FROM policy_announcement WHERE pblanc_id = ?",
                pblancId);

        Map<String, Object> draft = aiEngine.generateDraft(ann, profile, (String) rep.get("cause_text"));
        jdbc.update("""
            INSERT INTO application_draft (report_id, pblanc_id, sections) VALUES (?, ?, ?::jsonb)
            """, reportId, pblancId, toJson(draft.get("sections")));
        return draft;
    }

    private String toJson(Object o) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }
}
