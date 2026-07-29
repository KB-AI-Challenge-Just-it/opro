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

    /** 화면에 보여줄 매칭 상한 — ai-engine /matching의 top_k(5) 기본값과 맞춘다(이슈 #139). */
    private static final int CUMULATIVE_MATCH_LIMIT = 5;

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
                scoreNull ? null : score,
                rs.getBoolean("is_new"));
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
        // 누적 매칭 목록(이슈 #139) — 이 리포트 하나(analysis_id 하나)의 매칭만 보여주면, 배치가
        // 새로 찾은 매칭 1~2건짜리 리포트가 생길 때마다 이전 리포트에서 안내한 매칭이 화면에서
        // 통째로 사라져 사용자가 "이전 리포트와 다른 별개 결과"로 오인한다(#139 발견).
        // 그 대신 "이 프로필이 이 리포트 시점까지 받은 모든 매칭"을 pblanc_id 기준으로 중복 제거해
        // 점수순으로 재정렬하고, RAG 자체 상한(top_k=5)과 동일하게 5건으로 캡핑한다 — 새 매칭은
        // 그 안에 들 만큼 점수가 좋을 때만 노출된다("new가 순위 안에 들면 나오게").
        // is_new는 profile_funding_alert.notified_at(이 프로필에게 이 매칭을 처음 알린 시각) 기준
        // 실제 달력으로 최근 3일 이내인지로 판정한다 — 어느 리포트를 보고 있는지와 무관하게 3일이
        // 지나면 배지가 자동으로 사라진다(리포트별 analysis_id 비교 방식은 리포트를 다시 열 때마다
        // 영구히 NEW로 남는 문제가 있어 폐기).
        // r2.created_at <= 이 리포트 생성 시각으로 제한해, 과거 리포트를 열어도 그 이후에 생긴
        // 매칭까지 미리 보여주는 시간 역전을 막는다.
        // match_score는 최초 매칭 시점에 고정되고 재평가되지 않으므로(사용자 확인), 마감(apply_end)이
        // 지난 공고는 점수가 아무리 높아도 여기서 걸러 top-5에 다시 못 들어오게 한다 — 신청 못 하는
        // 공고가 계속 1순위로 남는 것을 방지.
        List<ReportDetail.Match> matches = jdbc.query("""
                SELECT pblanc_id, title, evidence, apply_end, detail_url, match_score, is_new
                FROM (
                    SELECT DISTINCT ON (fm.pblanc_id)
                        fm.pblanc_id, pa.title, fm.evidence, pa.apply_end::text AS apply_end,
                        pa.detail_url, fm.match_score,
                        COALESCE(pfa.notified_at >= now() - interval '3 days', false) AS is_new
                    FROM report r2
                    JOIN funding_match fm ON fm.analysis_id = r2.analysis_id
                    JOIN policy_announcement pa ON pa.pblanc_id = fm.pblanc_id
                    LEFT JOIN profile_funding_alert pfa
                        ON pfa.profile_id = r2.profile_id AND pfa.pblanc_id = fm.pblanc_id
                    WHERE r2.profile_id = ? AND r2.created_at <= ?
                      AND (pa.apply_end IS NULL OR pa.apply_end >= CURRENT_DATE)
                    ORDER BY fm.pblanc_id, fm.match_score DESC NULLS LAST, r2.created_at DESC
                ) cumulative
                ORDER BY match_score DESC NULLS LAST
                LIMIT ?
                """,
                MATCH_MAPPER,
                report.getProfileId(), report.getCreatedAt(), CUMULATIVE_MATCH_LIMIT);

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
