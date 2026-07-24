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

    /**
     * report_id 기준 읽음 처리(이슈 #106) — 프로필 목록/카카오 딥링크로 리포트를 직접 열 때 호출.
     * fire-and-forget: idempotent(이미 읽었거나 해당 report의 알림이 없어도 0건 업데이트로 조용히 통과,
     * 404를 던지지 않아 리포트 열람을 막지 않는다)하며 profile_id로 소유권을 스코프한다.
     */
    @Transactional
    @PatchMapping("/by-report/{reportId}/read")
    public void markReadByReport(@PathVariable Long reportId, @RequestParam Long profileId) {
        jdbc.update("""
                UPDATE notification SET status = 'READ', read_at = now()
                WHERE report_id = ? AND profile_id = ? AND status = 'UNREAD'
                """, reportId, profileId);
    }
}
