package com.bizagent.api.notification.kakao;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * 카카오 OAuth 동의 → 토큰 저장 플로우 (인증/세션 없음 — 데모 전제, state 로 profileId 만 보존).
 *   authorize: 프론트가 브라우저를 여기로 보내면 카카오 인가 서버로 302
 *   callback : 카카오가 code 를 콜백 → 토큰 교환 → kakao_token upsert → web 으로 302
 */
@RestController
@RequestMapping("/api/kakao/oauth")
@RequiredArgsConstructor
@Slf4j
public class KakaoOAuthController {

    private final KakaoApiClient kakao;
    private final JdbcTemplate jdbc;

    @Value("${web.base-url}")
    private String webBaseUrl;

    @GetMapping("/authorize")
    public ResponseEntity<Void> authorize(@RequestParam Long profileId) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(kakao.authorizeUrl(String.valueOf(profileId))))
                .build();
    }

    @GetMapping("/callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String code,
                                         @RequestParam(required = false) String state,
                                         @RequestParam(required = false) String error) {
        boolean connected = false;
        if (code != null && state != null) {
            try {
                long profileId = Long.parseLong(state);
                KakaoTokens tokens = kakao.exchangeCode(code);
                if (tokens.accessToken() == null || tokens.refreshToken() == null) {
                    throw new IllegalStateException("토큰 응답에 access/refresh 누락");
                }
                jdbc.update("""
                        INSERT INTO kakao_token (profile_id, access_token, refresh_token, expires_at, refreshed_at)
                        VALUES (?, ?, ?, now() + (? * interval '1 second'), now())
                        ON CONFLICT (profile_id) DO UPDATE SET
                            access_token  = EXCLUDED.access_token,
                            refresh_token = EXCLUDED.refresh_token,
                            expires_at    = EXCLUDED.expires_at,
                            refreshed_at  = now()
                        """, profileId, tokens.accessToken(), tokens.refreshToken(), (int) tokens.expiresInSeconds());
                connected = true;
            } catch (Exception e) {
                log.warn("카카오 토큰 교환/저장 실패: {}", e.toString());
            }
        } else {
            log.warn("카카오 콜백에 code/state 없음 (error={})", error);
        }
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(webBaseUrl + "/?kakao=" + (connected ? "connected" : "failed")))
                .build();
    }
}
