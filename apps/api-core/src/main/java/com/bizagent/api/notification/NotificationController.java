package com.bizagent.api.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationRepository repository;
    private final JdbcTemplate jdbc;
    private final NotificationSender notificationSender;

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

    /**
     * 이미 생성된 리포트를 카카오 "나에게 보내기"로 재발송한다(수동 QA용) — 파이프라인을 다시 돌리지
     * 않고 NotificationSender만 호출해 카카오 수신 화면을 바로 확인할 수 있게 한다.
     * notification_delivery는 notification_id FK가 NOT NULL이라 테스트용 notification row를 하나
     * 새로 만들어 보낸다(인앱 알림 목록에도 함께 보임 — 실제 발송과 동일 경로를 타는지 확인하는 것도 목적).
     * 카카오 미동의 프로필이면 KakaoMemoSender가 delivery row 자체를 안 남기므로 NOT_CONNECTED로 구분한다.
     */
    @PostMapping("/kakao-test")
    public Map<String, Object> sendKakaoTest(@RequestParam Long reportId, @RequestParam Long profileId) {
        Long ownerProfileId;
        try {
            ownerProfileId = jdbc.queryForObject("SELECT profile_id FROM report WHERE id = ?", Long.class, reportId);
        } catch (EmptyResultDataAccessException notFound) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        if (!profileId.equals(ownerProfileId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        Long notificationId = jdbc.queryForObject("""
                INSERT INTO notification (profile_id, report_id, type, title, body)
                VALUES (?, ?, 'REPORT', ?, ?) RETURNING id
                """, Long.class, profileId, reportId,
                "[테스트] 카카오 알림 발송 확인", "카카오톡 발송 테스트입니다.");

        notificationSender.send(profileId, notificationId, reportId, "[테스트] 카카오 알림 발송 확인");

        List<String> statuses = jdbc.queryForList("""
                SELECT status FROM notification_delivery WHERE notification_id = ?
                ORDER BY created_at DESC LIMIT 1
                """, String.class, notificationId);

        return Map.of("status", statuses.isEmpty() ? "NOT_CONNECTED" : statuses.get(0));
    }
}
