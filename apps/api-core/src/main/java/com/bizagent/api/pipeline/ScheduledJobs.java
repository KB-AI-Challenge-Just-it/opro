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

import java.util.List;

/** 배치 모니터링: 매일 06:00 수집 → 인덱싱 → 전 활성 프로필 능동 매칭 재실행 */
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

    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    public void dailyRun() {
        log.info("bizinfo upserted={}, ecos={}, sbiz={}",
                bizinfo.collect(), ecos.collect(), sbiz.collect());
        aiEngine.rebuildIndexes(); // 수집 후 BM25·임베딩 재구성

        // 전 활성 프로필을 재매칭 — profile_funding_alert dedup 이 이미 알린 공고를 걸러내므로
        // "이번에 새로 올라온 공고"만 따로 골라내는 diff 로직 없이도 신규 매칭만 통과한다.
        List<Long> profileIds = jdbc.queryForList(
                "SELECT id FROM business_profile WHERE biz_status = 'ACTIVE'", Long.class);
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
