package com.bizagent.api.aiclient;

import com.bizagent.api.pipeline.PipelineService;
import com.bizagent.api.trigger.TriggerEngine;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 데모·수동 실행용 엔드포인트 */
@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentController {

    private final TriggerEngine triggerEngine;
    private final PipelineService pipeline;
    private final AiEngineClient aiEngine;
    private final JdbcTemplate jdbc;

    /** 특정 프로필 트리거 평가 즉시 실행 (스케줄 안 기다리고 데모) */
    @PostMapping("/check/{profileId}")
    public List<Map<String, Object>> check(@PathVariable Long profileId) {
        List<Map<String, Object>> results = new ArrayList<>();
        for (var ev : triggerEngine.evaluate(profileId)) {
            if (triggerEngine.isDuplicateAlert(ev)) {
                results.add(Map.of("event", ev.dedupKey(), "status", "DUPLICATE_SKIPPED"));
            } else {
                results.add(Map.of("event", ev.dedupKey(), "status", "PROCESSED",
                        "reportId", pipeline.run(ev)));
            }
        }
        return results;
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
