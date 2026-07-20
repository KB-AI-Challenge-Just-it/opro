package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.notification.NotificationSender;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 파이프라인 오케스트레이션 (전부 Spring이 지휘, AI 호출만 ai-engine에 위임):
 * L3 적합성 설명 → L4 매칭 저장 → L5 리포트 생성 → 저장·push → 알림 (이슈 #29).
 * 진입점은 ProfileMatchTrigger — 이미 dedup 게이트를 통과한 "신규 매칭"만 넘어온다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PipelineService {

    private final JdbcTemplate jdbc;
    private final AiEngineClient aiEngine;
    private final NotificationSender notificationSender;
    private final PipelineWriter pipelineWriter;

    /**
     * @param profileId  대상 프로필
     * @param newMatches ProfileMatchTrigger 가 이미 알린 공고를 걸러낸 신규 매칭 (top ≤ 5). 비어있지 않음이 전제.
     */
    public long run(long profileId, List<Map<String, Object>> newMatches) {
        long t0 = System.currentTimeMillis();
        log.info("[profile={}] 파이프라인 시작 (신규매칭 {}건)", profileId, newMatches.size());

        Map<String, Object> profile = jdbc.queryForMap("""
            SELECT industry, entity_type, operating_period, monthly_revenue_band,
                   employee_band, region_sido, region_sigungu, concerns
            FROM business_profile WHERE id = ?
            """, profileId);

        // L3 · 적합성 설명 (Sonnet) — 이 공고들이 왜 프로필에 맞는지
        Map<String, Object> analysis = aiEngine.analyze(profile, newMatches);
        String fitText = (String) analysis.get("fit_text");
        log.info("[profile={}] L3 적합성 설명 완료 ({}ms)", profileId, System.currentTimeMillis() - t0);

        // L5 · 리포트 생성 (Sonnet). AI 호출은 둘 다 DB 트랜잭션 밖에서 끝낸다 —
        // /matching·/analysis·/report 는 최대 240초까지 걸릴 수 있어, 그 시간 동안
        // DB 커넥션을 붙잡아두지 않기 위함.
        String bodyMd = aiEngine.generateReport(fitText, newMatches);
        log.info("[profile={}] L5 리포트 생성 완료 ({}ms)", profileId, System.currentTimeMillis() - t0);

        // L4 매칭 저장 + 리포트 저장·push + 알림 생성 + dedup 게이트 기록을 한 트랜잭션으로 커밋.
        // AI 호출이 이미 끝난 뒤라, 여기서 실패해도(예: DB 제약 위반) analysis_result/funding_match/
        // report가 절반만 남는 orphan 상태가 되지 않는다 — 전부 롤백된다.
        PipelineWriter.Result result = pipelineWriter.persist(profileId, fitText, newMatches, bodyMd);
        long reportId = result.reportId();

        // 카카오 나에게 보내기(미러, P1.5) — 순서: notification insert 후. 실패해도 파이프라인에 영향 없음.
        // (Sender 내부에서 이미 예외를 삼키지만 호출부에서도 이중 방어)
        try {
            notificationSender.send(profileId, result.notificationId(), reportId, "새 리포트가 도착했어요");
        } catch (Exception e) {
            log.warn("알림 미러 발송 호출 실패 (인앱 알림은 정상): {}", e.toString());
        }

        log.info("[profile={}] 파이프라인 종료 ({}ms, reportId={})", profileId, System.currentTimeMillis() - t0, reportId);
        // TODO(4주차): push 채널(웹푸시/알림톡 등) 연동
        return reportId;
    }
}
