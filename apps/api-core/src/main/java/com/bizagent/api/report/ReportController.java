package com.bizagent.api.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
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

    @GetMapping
    public List<Report> list(@RequestParam Long profileId) {
        return repository.findByProfileIdOrderByCreatedAtDesc(profileId);
    }

    /**
     * 유저의 모든 프로필을 가로질러 "상담" 단위로 리포트를 조회한다 — 홈 카드가
     * "상담 진행하기"/"상담 결과 보기" 2개로 통합되면서(이슈: UX 개선) 질문 목록과
     * 리포트 목록을 별도 화면으로 안 두고 이 하나로 합친다.
     * 프로필마다 온보딩 직후 웰컴 리포트(analysis_id NULL)가 항상 먼저 생기고, 매칭이
     * 성공하면 실제 리포트(analysis_id 있음)가 뒤이어 쌓인다 — 그대로 다 보여주면 매칭
     * 성공한 프로필은 웰컴+실제 리포트가 중복으로 나열돼 혼란스럽다. DISTINCT ON으로
     * 프로필당 한 행만 남기되, 실제 매칭 리포트가 있으면 그걸(없으면 웰컴 리포트를) 고른다.
     */
    @GetMapping("/mine")
    public List<ReportSummary> mine(@RequestParam Long userId) {
        return jdbc.query("""
                SELECT * FROM (
                    SELECT DISTINCT ON (bp.id)
                           r.id, r.profile_id, r.body_md, r.created_at,
                           bp.industry, bp.region_sido, bp.region_sigungu,
                           (r.analysis_id IS NOT NULL) AS matched
                    FROM report r
                    JOIN business_profile bp ON bp.id = r.profile_id
                    WHERE bp.user_id = ?
                    ORDER BY bp.id, (r.analysis_id IS NOT NULL) DESC, r.created_at DESC
                ) t
                ORDER BY t.created_at DESC
                """,
                (rs, i) -> new ReportSummary(
                        rs.getLong("id"),
                        rs.getLong("profile_id"),
                        rs.getString("body_md"),
                        rs.getObject("created_at", java.time.OffsetDateTime.class),
                        rs.getString("industry"),
                        rs.getString("region_sido"),
                        rs.getString("region_sigungu"),
                        rs.getBoolean("matched")),
                userId);
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
