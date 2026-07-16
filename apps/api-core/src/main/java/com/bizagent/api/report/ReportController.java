package com.bizagent.api.report;

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
        return new ReportDetail(report, matches);
    }
}
