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
 * 배치 모니터링:
 *  - 매일 06:00 수집 → 인덱싱 (collectAndIndex)
 *  - 매시 정각, 그 시각을 알림 시간으로 설정한 사용자의 활성 프로필만 능동 매칭 (hourlyMatchTrigger)
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

    /** 06:00 수집 전용 — 3축 수집 후 BM25·임베딩 재구성. */
    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    public void collectAndIndex() {
        log.info("bizinfo upserted={}, ecos={}, sbiz={}",
                bizinfo.collect(), ecos.collect(), sbiz.collect());
        aiEngine.rebuildIndexes(); // 수집 후 BM25·임베딩 재구성
    }

    /**
     * 매시 정각 — 현재 시각(Asia/Seoul)을 알림 시간으로 설정한 사용자의 활성 프로필만 재매칭.
     * profile_funding_alert dedup 이 이미 알린 공고를 걸러내므로 신규 매칭만 통과한다.
     */
    @Scheduled(cron = "0 0 * * * *", zone = "Asia/Seoul")
    public void hourlyMatchTrigger() {
        int hour = ZonedDateTime.now(ZoneId.of("Asia/Seoul")).getHour();
        List<Long> profileIds = jdbc.queryForList(
                "SELECT bp.id FROM business_profile bp " +
                        "JOIN app_user u ON u.id = bp.user_id " +
                        "WHERE bp.biz_status = 'ACTIVE' AND u.preferred_notify_hour = ?",
                Long.class, hour);
        log.info("hourlyMatchTrigger hour={}, targetProfiles={}", hour, profileIds.size());
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
