package com.bizagent.api.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportRepository repository;
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * funding_match → ReportDetail.Match 매퍼. match_score 는 nullable(마이그레이션 이전 legacy row 는 NULL).
     * getInt() 는 SQL NULL 을 0 으로 반환하므로 wasNull() 로 구분하되, 반드시 getInt() 직후에 즉시
     * 캡처해야 한다 — wasNull() 은 "가장 최근 get* 호출" 결과를 참조하므로, 뒤의 getString() 이 끼면
     * detail_url 의 null 여부로 잘못 판정된다(이슈 #89 회귀).
     */
    static final RowMapper<ReportDetail.Match> MATCH_MAPPER = (rs, i) -> {
        int score = rs.getInt("match_score");
        boolean scoreNull = rs.wasNull();  // 다른 get* 호출 전에 즉시 캡처 — wasNull()은 직전 getter 참조
        return new ReportDetail.Match(
                rs.getString("pblanc_id"),
                rs.getString("title"),
                rs.getString("evidence"),
                rs.getString("apply_end"),
                rs.getString("detail_url"),
                scoreNull ? null : score);
    };

    @GetMapping
    public List<Report> list(@RequestParam Long profileId) {
        return repository.findByProfileIdOrderByCreatedAtDesc(profileId);
    }

    /**
     * profileId로 소유권을 검증한다(이슈 #57) — 로그인 세션의 profileId와 리포트의
     * 실제 profile_id가 다르면 404. 403이 아니라 404인 이유: 다른 사용자 리포트가
     * "존재한다"는 사실 자체를 노출하지 않기 위함.
     */
    @GetMapping("/{id}")
    public ReportDetail get(@PathVariable Long id, @RequestParam Long profileId) {
        Report report = repository.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!report.getProfileId().equals(profileId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        List<ReportDetail.Match> matches = jdbc.query("""
                SELECT fm.pblanc_id, pa.title, fm.evidence, pa.apply_end::text, pa.detail_url, fm.match_score
                FROM funding_match fm
                JOIN policy_announcement pa ON pa.pblanc_id = fm.pblanc_id
                WHERE fm.analysis_id = ?
                ORDER BY fm.match_score DESC NULLS LAST, fm.rrf_score DESC
                """,
                MATCH_MAPPER,
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
