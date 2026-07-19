package com.bizagent.api.notification.kakao;

import com.bizagent.api.notification.NotificationSender;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 카카오 "나에게 보내기" 미러 발송 (P1.5 데모 강화 · ADR 001).
 * 계약: 어떤 실패도 예외로 전파하지 않는다 — 파이프라인·인앱 알림은 이미 정상 처리된 상태다.
 *   1) kakao_token 조회 (없으면 미동의 → 조용히 스킵)
 *   2) 만료(임박) 시 refresh_token 으로 갱신 후 DB UPDATE (§5-1)
 *   3) 발송 → notification_delivery 에 SENT/FAILED 기록
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class KakaoMemoSender implements NotificationSender {

    private final JdbcTemplate jdbc;
    private final KakaoApiClient kakao;
    private final ObjectMapper om = new ObjectMapper();

    @Value("${web.base-url}")
    private String webBaseUrl;

    @Override
    public void send(long profileId, long notificationId, long reportId, String title) {
        try {
            Map<String, Object> tok;
            try {
                tok = jdbc.queryForMap("""
                        SELECT access_token, refresh_token,
                               (expires_at <= now() + interval '5 minutes') AS needs_refresh
                        FROM kakao_token WHERE profile_id = ?
                        """, profileId);
            } catch (EmptyResultDataAccessException noConsent) {
                // 카카오 미동의 프로필 — 인앱 알림만 발송하고 카톡은 스킵
                return;
            }

            String accessToken = (String) tok.get("access_token");
            if (Boolean.TRUE.equals(tok.get("needs_refresh"))) {
                accessToken = refreshAndStore(profileId, (String) tok.get("refresh_token"));
                if (accessToken == null) {
                    recordDelivery(notificationId, "FAILED", "token refresh failed");
                    return;
                }
            }

            String template = buildTemplate(title, webBaseUrl + "/reports/" + reportId);
            kakao.sendMemo(accessToken, template);
            recordDelivery(notificationId, "SENT", null);

        } catch (Exception e) {
            // 이중 방어: 절대 파이프라인으로 전파하지 않는다
            log.warn("카카오 나에게 보내기 실패 (인앱 알림은 정상): notificationId={}, {}", notificationId, e.toString());
            try {
                recordDelivery(notificationId, "FAILED", e.toString());
            } catch (Exception ignore) {
                // 이력 기록 실패까지 삼킨다
            }
        }
    }

    /** 갱신 성공 시 새 액세스 토큰 반환 + DB 갱신, 실패 시 null (§5-1: 갱신 실패해도 예외 삼키고 스킵) */
    private String refreshAndStore(long profileId, String refreshToken) {
        try {
            KakaoTokens t = kakao.refresh(refreshToken);
            if (t.accessToken() == null) return null;
            // refresh 응답에 새 refresh_token 이 없으면 기존 값 유지
            String newRefresh = t.refreshToken() != null ? t.refreshToken() : refreshToken;
            jdbc.update("""
                    UPDATE kakao_token
                       SET access_token = ?, refresh_token = ?,
                           expires_at = now() + (? * interval '1 second'), refreshed_at = now()
                     WHERE profile_id = ?
                    """, t.accessToken(), newRefresh, (int) t.expiresInSeconds(), profileId);
            return t.accessToken();
        } catch (Exception e) {
            log.warn("카카오 토큰 갱신 실패: profileId={}, {}", profileId, e.toString());
            return null;
        }
    }

    private void recordDelivery(long notificationId, String status, String error) {
        jdbc.update("""
                INSERT INTO notification_delivery (notification_id, channel, status, error, sent_at)
                VALUES (?, 'KAKAO_MEMO', ?, ?, CASE WHEN ? = 'SENT' THEN now() ELSE NULL END)
                """, notificationId, status, error, status);
    }

    /** ADR §4-2 형태: object_type=text, 제목 본문 + 리포트 딥링크 버튼 */
    private String buildTemplate(String title, String webUrl) throws Exception {
        Map<String, Object> template = new LinkedHashMap<>();
        template.put("object_type", "text");
        template.put("text", title);
        template.put("link", Map.of("web_url", webUrl, "mobile_web_url", webUrl));
        template.put("button_title", "리포트 확인");
        return om.writeValueAsString(template);
    }
}
