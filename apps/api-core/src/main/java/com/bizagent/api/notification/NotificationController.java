package com.bizagent.api.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationRepository repository;
    private final JdbcTemplate jdbc;

    @GetMapping
    public List<Notification> list(@RequestParam Long profileId,
                                   @RequestParam(defaultValue = "UNREAD") String status) {
        return repository.findByProfileIdAndStatusOrderByCreatedAtDesc(profileId, status);
    }

    @PatchMapping("/{id}/read")
    public Notification markRead(@PathVariable Long id) {
        jdbc.update("UPDATE notification SET status = 'READ', read_at = now() WHERE id = ?", id);
        return repository.findById(id).orElseThrow();
    }
}
