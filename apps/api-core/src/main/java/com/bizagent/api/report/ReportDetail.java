package com.bizagent.api.report;

import java.time.OffsetDateTime;
import java.util.List;

public record ReportDetail(
    Long id,
    Long profileId,
    String bodyMd,
    OffsetDateTime pushedAt,
    OffsetDateTime createdAt,
    List<Match> matches,
    List<Draft> drafts
) {
    ReportDetail(Report r, List<Match> matches, List<Draft> drafts) {
        this(r.getId(), r.getProfileId(), r.getBodyMd(), r.getPushedAt(), r.getCreatedAt(), matches, drafts);
    }

    public record Match(String pblancId, String title, String evidence, String applyEnd, String detailUrl, Integer matchScore) {}

    /** 이미 생성된 신청서 초안(있으면) — 재방문 시 재생성 없이 표시하기 위함(이슈 #36). */
    public record Draft(String pblancId, Object sections) {}
}
