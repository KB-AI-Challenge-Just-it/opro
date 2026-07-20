package com.bizagent.api.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportRepository repository;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping
    public List<Report> list(@RequestParam Long profileId) {
        return repository.findByProfileIdOrderByCreatedAtDesc(profileId);
    }

    @GetMapping("/{id}")
    public ReportDetail get(@PathVariable Long id) {
        Report report = repository.findById(id).orElseThrow();
        List<ReportDetail.Match> matches = jdbc.query("""
                SELECT fm.pblanc_id, pa.title, fm.evidence, pa.apply_end::text, pa.detail_url
                FROM funding_match fm
                JOIN policy_announcement pa ON pa.pblanc_id = fm.pblanc_id
                WHERE fm.analysis_id = ?
                ORDER BY fm.rrf_score DESC
                """,
                (rs, i) -> new ReportDetail.Match(
                        rs.getString("pblanc_id"),
                        rs.getString("title"),
                        rs.getString("evidence"),
                        rs.getString("apply_end"),
                        rs.getString("detail_url")),
                report.getAnalysisId());

        // 이미 생성된 초안(있으면) — 재방문 시 재생성 없이 보여주기 위함(이슈 #36).
        // 같은 공고로 재생성될 수 있으니 최신순으로 두고 프론트에서 pblancId당 첫 항목만 쓴다.
        List<ReportDetail.Draft> drafts = jdbc.query("""
                SELECT pblanc_id, sections::text AS sections
                FROM application_draft
                WHERE report_id = ?
                ORDER BY created_at DESC
                """,
                (rs, i) -> {
                    Object parsed;
                    try {
                        parsed = objectMapper.readValue(rs.getString("sections"), Object.class);
                    } catch (Exception e) {
                        parsed = null;
                    }
                    return new ReportDetail.Draft(rs.getString("pblanc_id"), parsed);
                },
                report.getId());

        return new ReportDetail(report, matches, drafts);
    }
}
