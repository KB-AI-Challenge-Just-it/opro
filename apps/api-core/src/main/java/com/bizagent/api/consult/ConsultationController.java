package com.bizagent.api.consult;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

/**
 * 대화형 2-콜 컨설팅 엔드포인트.
 * 온보딩 직후 /diagnose(콜1) → 사장님이 진단 읽고 답변 → /specialize(콜2).
 */
@Slf4j
@RestController
@RequestMapping("/api/consult")
@RequiredArgsConstructor
public class ConsultationController {

    private final ConsultationService consultationService;

    /** 콜1 · 개인화 진단. 최대 수십 초 걸릴 수 있다(Opus). */
    @PostMapping("/diagnose")
    public Map<String, Object> diagnose(@RequestBody Map<String, Object> body) {
        long profileId = requireLong(body, "profileId");
        Map<String, Object> res = new HashMap<>();
        res.put("profileId", profileId);
        try {
            ConsultationService.DiagnoseResult result = consultationService.diagnose(profileId);
            res.put("sessionId", result.sessionId());
            res.put("diagnosis", result.diagnosis());
            res.put("followUpQuestions", result.followUpQuestions());
            res.put("status", "DIAGNOSED");
        } catch (Exception e) {
            // 기존 파이프라인 방어 패턴과 동일 — 원시 500 대신 실패 상태를 반환한다.
            log.warn("[profile={}] 콜1 진단 실패: {}", profileId, e.toString());
            res.put("status", "ERROR");
            res.put("message", e.getMessage());
        }
        return res;
    }

    /**
     * 요청 body에서 필수 long 값을 꺼낸다. 없거나 숫자로 파싱 불가하면 400을 던진다
     * (OnboardingController의 입력 검증 관례와 동일 — 원시 500이 새어나가지 않게 한다).
     * 그래야 클라이언트 오류(잘못된 body)와 서버 처리 실패(try 안의 status:ERROR)가 구분된다.
     */
    private static long requireLong(Map<String, Object> body, String key) {
        Object raw = body == null ? null : body.get(key);
        if (raw == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + "는 필수입니다");
        }
        try {
            return Long.parseLong(String.valueOf(raw).trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + "는 숫자여야 합니다");
        }
    }
}
