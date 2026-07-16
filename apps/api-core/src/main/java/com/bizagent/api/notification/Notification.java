package com.bizagent.api.notification;

import jakarta.persistence.*;
import lombok.Getter;
import java.time.OffsetDateTime;

@Entity
@Table(name = "notification")
@Getter
public class Notification {
    @Id
    private Long id;
    private Long profileId;
    private Long reportId;
    private String type;
    private String title;
    @Column(columnDefinition = "text")
    private String body;
    private String status;
    private OffsetDateTime readAt;
    private OffsetDateTime createdAt;
}
