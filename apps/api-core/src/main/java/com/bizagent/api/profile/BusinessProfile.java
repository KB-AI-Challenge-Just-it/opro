package com.bizagent.api.profile;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;

/** 온보딩 폐쇄형 질문지(기획서 4-1) 응답 프로필 */
@Entity
@Table(name = "business_profile")
@Getter @Setter @NoArgsConstructor
public class BusinessProfile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private String industry;              // 화면1 (매장 검색 목업 또는 직접입력)
    private String entityType;            // 더 이상 온보딩에서 수집 안 함 (doc/onboarding.md 신규 플로우엔 없음) — 컬럼은 nullable로 유지
    private String operatingPeriod;       // 화면2-a / 사업자번호 자동 판정
    private String monthlyRevenueBand;    // 화면4
    private String employeeBand;          // 화면3
    private String regionSido;            // 화면1
    private String regionSigungu;
    @Column(columnDefinition = "text[]")
    private String[] concerns;            // 더 이상 온보딩에서 수집/사용 안 함 (신규 플로우는 fundingPurpose로 대체) — 컬럼만 유지, 값 안 건드림
    private String fundingExperience;     // 화면7 정책자금 수혜 이력
    private String bizRegNo;              // 화면2 사업자등록번호
    private String bizStatus = "ACTIVE";
    private String marketRegionCode;     // 소진공 상권 API 행정동 코드 (목업)
    private String marketIndustryCode;   // 소진공 상권 API 업종코드 (목업)

    private Boolean ntsVerified = false;   // 화면2 국세청 상태조회 배지 (목업에서 true로 세팅)
    private String revenueBasis = "ANNUAL"; // 'ANNUAL' | 'MONTHLY' — 화면4, 업력 1년 미만이면 MONTHLY로 자동 전환
    private String taxDelinquency;         // 화면5 — "없음" / "있음" / "잘 모름" (TAX_OPTIONS)
    private String overdueStatus;          // 화면6 — "없음" / "있었지만 해결" / "현재 연체 중" / "잘 모름" (OVERDUE_OPTIONS)
    @Column(columnDefinition = "text[]")
    private String[] fundingPurpose;       // 화면8 복수선택(운영/시설/창업/대환/잘모름) — 신규 buildQuery 핵심 입력
    private String fundingAmountBand;      // 화면9
    @JdbcTypeCode(SqlTypes.SMALLINT) // DDL 은 SMALLINT(int2) — ddl-auto:validate 정합 위해 JDBC 타입 명시 (이슈 #110 QA)
    private Integer preferredNotifyHour = 9; // 알림 수신 희망 시각(07~23) — hourlyMatchTrigger 가 이 값으로 대상 필터링 (이슈 #110)

    @CreationTimestamp
    private OffsetDateTime createdAt;
}
