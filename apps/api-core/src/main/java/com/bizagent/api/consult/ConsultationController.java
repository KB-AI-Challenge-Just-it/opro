package com.bizagent.api.consult;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

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
        long profileId = Long.parseLong(String.valueOf(body.get("profileId")));
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
}
