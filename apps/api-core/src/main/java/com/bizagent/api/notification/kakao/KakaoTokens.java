package com.bizagent.api.notification.kakao;

import java.util.Map;

/**
 * 카카오 토큰 엔드포인트(/oauth/token) 응답의 필요한 부분만.
 * refresh 응답에는 refresh_token 이 없을 수 있다(회전 시에만 내려옴) → null 허용.
 */
public record KakaoTokens(String accessToken, String refreshToken, long expiresInSeconds) {

    static KakaoTokens from(Map<String, Object> res) {
        Object exp = res == null ? null : res.get("expires_in");
        long secs = exp instanceof Number n ? n.longValue() : 0L;
        return new KakaoTokens(
                res == null ? null : (String) res.get("access_token"),
                res == null ? null : (String) res.get("refresh_token"),
                secs);
    }
}
