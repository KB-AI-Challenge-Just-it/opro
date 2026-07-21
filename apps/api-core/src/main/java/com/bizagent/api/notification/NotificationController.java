package com.bizagent.api.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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

    /** profileId로 소유권을 검증한다(이슈 #57) — 다른 사용자의 알림은 읽음 처리할 수 없다. */
    @Transactional
    @PatchMapping("/{id}/read")
    public Notification markRead(@PathVariable Long id, @RequestParam Long profileId) {
        Notification notification = repository.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!notification.getProfileId().equals(profileId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        jdbc.update("UPDATE notification SET status = 'READ', read_at = now() WHERE id = ?", id);
        return repository.findById(id).orElseThrow();
    }
}
