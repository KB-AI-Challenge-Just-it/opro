package com.bizagent.api.member;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

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

    @CreationTimestamp
    private OffsetDateTime createdAt;
}
