package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.collect.BizinfoCollector;
import com.bizagent.api.collect.EcosCollector;
import com.bizagent.api.collect.SbizCollector;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

/**
 * 배치 모니터링(이슈 #110):
 *  - 06:00 collectAndIndex(): 전 사용자 공용 공고 수집 → BM25·임베딩 재구성 (매칭은 하지 않음).
 *  - 매시 정각 hourlyMatchTrigger(): preferred_notify_hour 가 현재 시각과 일치하는
 *    활성 프로필만 능동 매칭·알림 재실행.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ScheduledJobs {

    private final BizinfoCollector bizinfo;
    private final EcosCollector ecos;
    private final SbizCollector sbiz;
    private final ProfileMatchTrigger profileMatchTrigger;
    private final AiEngineClient aiEngine;
    private final JdbcTemplate jdbc;

    /** 매일 06:00 — 전 사용자 공용 수집 후 인덱스 재구성. 프로필별 매칭은 hourlyMatchTrigger 로 분리(이슈 #110). */
    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    public void collectAndIndex() {
        log.info("bizinfo upserted={}, ecos={}, sbiz={}",
                bizinfo.collect(), ecos.collect(), sbiz.collect());
        aiEngine.rebuildIndexes(); // 수집 후 BM25·임베딩 재구성
    }

    /**
     * 매시 정각 — preferred_notify_hour 가 현재 시각(Asia/Seoul)과 일치하는 활성 프로필만 재매칭한다(이슈 #110).
     * profile_funding_alert dedup 이 이미 알린 공고를 걸러내므로 "이번에 새로 올라온 공고"만 따로
     * 골라내는 diff 로직 없이도 신규 매칭만 통과한다.
     */
    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    public void hourlyMatchTrigger() {
        int hour = ZonedDateTime.now(ZoneId.of("Asia/Seoul")).getHour();
        List<Long> profileIds = jdbc.queryForList(
                "SELECT id FROM business_profile WHERE biz_status = 'ACTIVE' AND preferred_notify_hour = ?",
                Long.class, hour);
        for (Long pid : profileIds) {
            try {
                var result = profileMatchTrigger.runForProfile(pid);
                if (result.reportId() != null) {
                    log.info("report generated: profileId={}, reportId={}, newMatches={}",
                            pid, result.reportId(), result.newMatchCount());
                }
            } catch (Exception e) {
                log.warn("pipeline failed for profileId={}, skipping: {}", pid, e.getMessage());
            }
        }
    }
}
