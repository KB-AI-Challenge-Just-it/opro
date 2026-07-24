package com.bizagent.api.consult;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.pipeline.PipelineService;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 대화형 2-콜 컨설팅 오케스트레이션.
 * 콜1(진단) → [사장님이 진단 읽고 재질문 답변] → 콜2(전문화)로 이어지는 상태를
 * consultation_session 테이블로 잇는다. AI 호출만 ai-engine에 위임한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsultationService {

    private final JdbcTemplate jdbc;
    private final AiEngineClient aiEngine;
    private final PipelineService pipelineService;
    private final ProfileMatchTrigger profileMatchTrigger;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 콜1 결과 — 프론트가 진단 본문과 재질문을 바로 렌더한다. */
    public record DiagnoseResult(long sessionId, String diagnosis,
                                 List<Map<String, Object>> followUpQuestions) {}

    /** 콜2 결과 — reportId는 매칭이 하나도 없으면 null이다. */
    public record SpecializeResult(long sessionId, Long reportId, String status) {}

    /**
     * 콜1 · 개인화 진단. 프로필 + 상권/경기지표를 모아 ai-engine에 넘기고,
     * 결과를 세션(status=DIAGNOSED)으로 저장한다.
     */
    @SuppressWarnings("unchecked")
    public DiagnoseResult diagnose(long profileId) {
        long t0 = System.currentTimeMillis();
        Map<String, Object> profile = loadProfile(profileId);

        Map<String, Object> marketContext = fetchMarketContext(profile);
        Map<String, Object> econContext = fetchEconContext();

        Map<String, Object> res = aiEngine.diagnose(profile, marketContext, econContext);
        String diagnosis = String.valueOf(res.getOrDefault("diagnosis", ""));
        Object rawQuestions = res.get("follow_up_questions");
        List<Map<String, Object>> questions =
                rawQuestions instanceof List ? (List<Map<String, Object>>) rawQuestions : List.of();

        Long sessionId = jdbc.queryForObject("""
            INSERT INTO consultation_session (profile_id, status, diagnosis_text, follow_up_questions)
            VALUES (?, 'DIAGNOSED', ?, ?::jsonb)
            RETURNING id
            """, Long.class, profileId, diagnosis, toJson(questions));

        log.info("[profile={}] 콜1 진단 완료 ({}ms, sessionId={}, 재질문 {}건)",
                profileId, System.currentTimeMillis() - t0, sessionId, questions.size());
        return new DiagnoseResult(sessionId, diagnosis, questions);
    }

    /**
     * 콜2 · 전문화. 진단 + 재질문 답변을 합친 쿼리로 매칭한 뒤,
     * 기존 파이프라인(L3 적합성 설명 → L5 리포트 생성 → 저장·알림)을 그대로 재사용한다.
     * answers가 null이거나 비어있으면(스킵) 진단만으로 매칭한다.
     */
    public SpecializeResult specialize(long sessionId, List<Map<String, Object>> answers) {
        long t0 = System.currentTimeMillis();
        Map<String, Object> session = jdbc.queryForMap("""
            SELECT profile_id, diagnosis_text FROM consultation_session WHERE id = ?
            """, sessionId);
        long profileId = ((Number) session.get("profile_id")).longValue();
        String diagnosisText = (String) session.get("diagnosis_text");

        jdbc.update("UPDATE consultation_session SET follow_up_answers = ?::jsonb WHERE id = ?",
                toJson(answers == null ? List.of() : answers), sessionId);

        Map<String, Object> profile = loadProfile(profileId);
        String query = buildEnrichedQuery(
                profileMatchTrigger.buildQuery(profile),
                diagnosisText == null ? "" : diagnosisText,
                formatAnswers(answers));

        List<Map<String, Object>> matches = aiEngine.match(query, profile);
        if (matches.isEmpty()) {
            log.info("[session={}] 콜2 매칭 결과 없음 ({}ms)", sessionId, System.currentTimeMillis() - t0);
            jdbc.update("UPDATE consultation_session SET status = 'COMPLETED' WHERE id = ?", sessionId);
            return new SpecializeResult(sessionId, null, "NO_MATCH");
        }

        long reportId = pipelineService.run(profileId, matches);
        jdbc.update("UPDATE consultation_session SET status = 'COMPLETED', report_id = ? WHERE id = ?",
                reportId, sessionId);
        log.info("[session={}] 콜2 전문화 완료 ({}ms, reportId={}, 매칭 {}건)",
                sessionId, System.currentTimeMillis() - t0, reportId, matches.size());
        return new SpecializeResult(sessionId, reportId, "COMPLETED");
    }

    /**
     * 매칭 쿼리 조립 — 기본 프로필 쿼리에 진단과 재질문 답변을 덧붙인다.
     * 빈 구간은 섹션 자체를 넣지 않는다(스킵 경로에서 빈 헤더만 남는 것을 막는다).
     */
    private static String buildEnrichedQuery(String baseQuery, String diagnosisText, String answersText) {
        StringBuilder sb = new StringBuilder(baseQuery == null ? "" : baseQuery);
        if (diagnosisText != null && !diagnosisText.isBlank()) {
            sb.append("\n\n[경영 진단]\n").append(diagnosisText.trim());
        }
        if (answersText != null && !answersText.isBlank()) {
            sb.append("\n\n[추가 확인 사항]\n").append(answersText.trim());
        }
        return sb.toString();
    }

    /** 프로필 조회 — PipelineService와 동일한 컬럼 집합을 쓴다. */
    Map<String, Object> loadProfile(long profileId) {
        return jdbc.queryForMap("""
            SELECT industry, entity_type, operating_period, monthly_revenue_band,
                   employee_band, region_sido, region_sigungu,
                   funding_purpose, tax_delinquency, overdue_status, funding_experience,
                   funding_amount_band, revenue_basis, nts_verified,
                   market_region_code, market_industry_code
            FROM business_profile WHERE id = ?
            """, profileId);
    }

    /**
     * 상권 최신 스냅샷 조회. 프로필에 상권 코드가 없으면 조용히 생략한다 —
     * ai-engine이 market_context 없이도 정상 동작하도록 설계돼 있다.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchMarketContext(Map<String, Object> profile) {
        Object regionCode = profile.get("market_region_code");
        Object industryCode = profile.get("market_industry_code");
        if (regionCode == null || industryCode == null) return null;
        try {
            String metricJson = jdbc.queryForObject("""
                SELECT metric::text FROM market_snapshot
                WHERE region_code = ? AND industry_code = ?
                ORDER BY collected_at DESC LIMIT 1
                """, String.class, regionCode, industryCode);
            return objectMapper.readValue(metricJson, Map.class);
        } catch (EmptyResultDataAccessException e) {
            return null;
        } catch (Exception e) {
            log.warn("market_context 조회 실패 — 생략하고 진행: {}", e.toString());
            return null;
        }
    }

    /**
     * 경기지표 최신값 조회 — 지표코드별 가장 최근 관측치를 map으로 모은다.
     * 지표 코드를 하드코딩하지 않고 테이블에 있는 것을 그대로 쓴다.
     */
    private Map<String, Object> fetchEconContext() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT DISTINCT ON (indicator_code) indicator_code, value, observed_at
                FROM econ_indicator
                ORDER BY indicator_code, observed_at DESC
                """);
            if (rows.isEmpty()) return null;
            Map<String, Object> out = new HashMap<>();
            for (Map<String, Object> row : rows) {
                out.put(String.valueOf(row.get("indicator_code")), row.get("value"));
            }
            return out;
        } catch (Exception e) {
            log.warn("econ_context 조회 실패 — 생략하고 진행: {}", e.toString());
            return null;
        }
    }

    /**
     * 재질문 답변을 콜2 매칭 쿼리에 붙일 자연어로 변환한다.
     * 값이 비어있는(건너뛴) 답변은 제외한다 — 스킵을 빈 답변으로 보내도 안전하다.
     */
    private static String formatAnswers(List<Map<String, Object>> answers) {
        if (answers == null || answers.isEmpty()) return "";
        List<String> lines = new ArrayList<>();
        for (Map<String, Object> a : answers) {
            Object value = a.get("value");
            String valueText = value == null ? "" : String.valueOf(value).trim();
            if (valueText.isEmpty()) continue;
            String question = String.valueOf(a.getOrDefault("question", "")).trim();
            lines.add(question.isEmpty() ? valueText : question + " → " + valueText);
        }
        return String.join("\n", lines);
    }

    String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return "[]";
        }
    }
}
