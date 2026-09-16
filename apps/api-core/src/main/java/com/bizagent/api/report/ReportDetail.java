package com.bizagent.api.report;

import java.time.OffsetDateTime;
import java.util.List;

public record ReportDetail(
    Long id,
    Long profileId,
    Long analysisId,
    String bodyMd,
    OffsetDateTime pushedAt,
    OffsetDateTime createdAt,
    List<Match> matches,
    List<Draft> drafts
) {
    ReportDetail(Report r, List<Match> matches, List<Draft> drafts) {
        this(r.getId(), r.getProfileId(), r.getAnalysisId(), r.getBodyMd(),
                r.getPushedAt(), r.getCreatedAt(), matches, drafts);
    }

    /** source = policy_announcement.source ('BIZINFO' | 'DAEGU_DASH') — 프론트가 출처 배지를 그린다. */
    public record Match(String pblancId, String title, String evidence, String applyEnd, String detailUrl,
                         Integer matchScore, boolean isNew, String source) {}

    /** 이미 생성된 신청서 초안(있으면) — 재방문 시 재생성 없이 표시하기 위함(이슈 #36). */
    public record Draft(String pblancId, Object sections) {}
}
