package com.bizagent.api.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface NotificationRepository extends JpaRepository<Notification, Long> {
    List<Notification> findByProfileIdAndStatusOrderByCreatedAtDesc(Long profileId, String status);
}
