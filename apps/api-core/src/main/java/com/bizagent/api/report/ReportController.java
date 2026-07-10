package com.bizagent.api.report;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private final ReportRepository repository;

    @GetMapping
    public List<Report> list(@RequestParam Long profileId) {
        return repository.findByProfileIdOrderByCreatedAtDesc(profileId);
    }

    @GetMapping("/{id}")
    public Report get(@PathVariable Long id) {
        return repository.findById(id).orElseThrow();
    }
}
