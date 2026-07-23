package com.bizagent.api.report;

import java.time.OffsetDateTime;

/** 프로필을 거치지 않고 유저 단위로 리포트를 가로질러 조회할 때 쓰는 요약 뷰(이슈: 리포트 열람 depth 개선).
 * 어느 프로필(업종·지역)에서 나온 리포트인지 알아야 목록에서 구분 가능하므로 함께 담는다.
 * profile당 한 행만 내려간다(이슈: 상담 진행하기/상담 결과 보기 2카드 통합) — matched는 실제 매칭
 * 리포트(analysis_id 존재)인지, 웰컴 리포트뿐인지(매칭 진행 중/실패)를 프론트가 구분해 보여주기 위함. */
public record ReportSummary(
    Long id,
    Long profileId,
    String bodyMd,
    OffsetDateTime createdAt,
    String industry,
    String regionSido,
    String regionSigungu,
    boolean matched
) {}
