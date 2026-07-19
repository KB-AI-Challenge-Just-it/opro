package com.bizagent.api.notification.kakao;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * 카카오 인가/메시지 API 호출 전용 (AiEngineClient 와 동일한 WebClient 패턴).
 *  - kauth.kakao.com : OAuth 인가 URL 생성 · code↔토큰 교환 · 토큰 갱신
 *  - kapi.kakao.com  : 나에게 보내기 발송
 * 토큰 저장/조회·발송 이력은 이 클래스가 아니라 호출부(Jdbc)가 담당한다.
 */
@Component
public class KakaoApiClient {

    private final WebClient authClient;
    private final WebClient apiClient;
    private final String authBaseUrl;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;

    public KakaoApiClient(
            @Value("${kakao.auth-base-url}") String authBaseUrl,
            @Value("${kakao.api-base-url}") String apiBaseUrl,
            @Value("${kakao.client-id}") String clientId,
            @Value("${kakao.client-secret}") String clientSecret,
            @Value("${kakao.redirect-uri}") String redirectUri) {
        this.authClient = WebClient.create(authBaseUrl);
        this.apiClient = WebClient.create(apiBaseUrl);
        this.authBaseUrl = authBaseUrl;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    /** 프론트를 이동시킬 카카오 인가 URL (scope=talk_message, state 에 profileId 보존) */
    public String authorizeUrl(String state) {
        return authBaseUrl + "/oauth/authorize"
                + "?response_type=code"
                + "&client_id=" + enc(clientId)
                + "&redirect_uri=" + enc(redirectUri)
                + "&scope=" + enc("talk_message")
                + "&state=" + enc(state);
    }

    /** 콜백 code → 액세스/리프레시 토큰 교환 */
    public KakaoTokens exchangeCode(String code) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", clientId);
        form.add("redirect_uri", redirectUri);
        form.add("code", code);
        if (!clientSecret.isBlank()) form.add("client_secret", clientSecret);
        return KakaoTokens.from(postToken(form));
    }

    /** refresh_token 으로 액세스 토큰 갱신 */
    public KakaoTokens refresh(String refreshToken) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "refresh_token");
        form.add("client_id", clientId);
        form.add("refresh_token", refreshToken);
        if (!clientSecret.isBlank()) form.add("client_secret", clientSecret);
        return KakaoTokens.from(postToken(form));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> postToken(MultiValueMap<String, String> form) {
        return authClient.post().uri("/oauth/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .bodyValue(form)
                .retrieve().bodyToMono(Map.class).block();
    }

    /**
     * 나에게 보내기 발송. template_object 는 JSON 문자열이지만 form-urlencoded 파라미터로 보낸다(§5-4).
     * 실패(4xx/5xx/네트워크)는 예외로 던지고, 삼키는 책임은 KakaoMemoSender 가 진다.
     */
    public void sendMemo(String accessToken, String templateObjectJson) {
        apiClient.post().uri("/v2/api/talk/memo/default/send")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData("template_object", templateObjectJson))
                .retrieve().bodyToMono(Void.class).block();
    }

    private static String enc(String v) {
        return URLEncoder.encode(v == null ? "" : v, StandardCharsets.UTF_8);
    }
}
