package com.bizagent.api.report;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ReportRepository extends JpaRepository<Report, Long> {
    List<Report> findByProfileIdOrderByCreatedAtDesc(Long profileId);
}
