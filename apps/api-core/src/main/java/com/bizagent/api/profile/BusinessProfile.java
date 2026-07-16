package com.bizagent.api.profile;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import java.time.OffsetDateTime;

/** 온보딩 폐쇄형 질문지(기획서 4-1) 응답 프로필 */
@Entity
@Table(name = "business_profile")
@Getter @Setter @NoArgsConstructor
public class BusinessProfile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long userId;
    private String industry;              // Q1
    private String entityType;            // Q2
    private String operatingPeriod;       // Q3
    private String monthlyRevenueBand;    // Q4
    private String employeeBand;          // Q5
    private String regionSido;            // Q6
    private String regionSigungu;
    @Column(columnDefinition = "text[]")
    private String[] concerns;            // Q7 (최대 2개)
    private String fundingExperience;     // Q8
    private String bizRegNo;              // Q9
    private String bizStatus = "ACTIVE";
    private String marketRegionCode;     // 소진공 상권 API 행정동 코드
    private String marketIndustryCode;   // 소진공 상권 API 업종코드
    @CreationTimestamp
    private OffsetDateTime createdAt;
}
