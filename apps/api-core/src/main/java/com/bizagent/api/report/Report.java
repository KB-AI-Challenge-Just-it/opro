package com.bizagent.api.report;

import jakarta.persistence.*;
import lombok.Getter;
import java.time.OffsetDateTime;

@Entity
@Table(name = "report")
@Getter
public class Report {
    @Id
    private Long id;
    private Long profileId;
    private Long analysisId;
    @Column(columnDefinition = "text")
    private String bodyMd;
    private OffsetDateTime pushedAt;
    private OffsetDateTime createdAt;
}
