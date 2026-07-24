package com.bizagent.api.member;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

@Entity
@Table(name = "app_user")
@Getter @Setter @NoArgsConstructor
public class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;
    private String displayName;
    private String username;
    private String password; // 평문 저장 — MVP/해커톤 범위, 해싱 없음 (사용자 명시 요청)

    // 계정 단위 알림 수신 시간(07~23시). DDL이 SMALLINT라 Integer 기본 매핑(INTEGER)과
    // 어긋나지 않도록 SMALLINT로 명시 — ddl-auto: validate 부팅 실패 방지.
    @JdbcTypeCode(SqlTypes.SMALLINT)
    private Integer preferredNotifyHour = 9;

    @CreationTimestamp
    private OffsetDateTime createdAt;
}
