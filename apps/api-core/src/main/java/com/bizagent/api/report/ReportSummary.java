package com.bizagent.api.report;

import java.time.OffsetDateTime;

/** 프로필을 거치지 않고 유저 단위로 리포트를 가로질러 조회할 때 쓰는 요약 뷰(이슈: 리포트 열람 depth 개선).
 * 어느 프로필(업종·지역)에서 나온 리포트인지 알아야 목록에서 구분 가능하므로 함께 담는다. */
public record ReportSummary(
    Long id,
    Long profileId,
    String bodyMd,
    OffsetDateTime createdAt,
    String industry,
    String regionSido,
    String regionSigungu
) {}
