package com.bizagent.api.report;

import java.time.OffsetDateTime;
import java.util.List;

public record ReportDetail(
    Long id,
    Long profileId,
    String bodyMd,
    OffsetDateTime pushedAt,
    OffsetDateTime createdAt,
    List<Match> matches
) {
    ReportDetail(Report r, List<Match> matches) {
        this(r.getId(), r.getProfileId(), r.getBodyMd(), r.getPushedAt(), r.getCreatedAt(), matches);
    }

    public record Match(String pblancId, String title, String evidence, String applyEnd, String detailUrl) {}
}
