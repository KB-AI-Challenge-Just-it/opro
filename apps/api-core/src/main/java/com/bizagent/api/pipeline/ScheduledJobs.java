package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.collect.BizinfoCollector;
import com.bizagent.api.collect.EcosCollector;
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
 *  - 매분 정각, 그 시:분을 알림 시각으로 설정한 사용자의 활성 프로필만 능동 매칭 (notifyTimeMatchTrigger)
 *
 * 2026-08-02: 알림 예약을 시(hour) 단위에서 시:분(hour:minute) 단위로 세분화했다(app_user에
 * preferred_notify_minute 추가). 매시 정각 실행으로는 사용자가 원하는 정확한 분을 맞출 수 없어서,
 * 실행 주기를 매분으로 늘리고 hour·minute을 둘 다 비교한다. profile_funding_alert dedup이 이미
 * 알린 공고를 걸러내므로 같은 프로필을 매분 재확인해도 중복 알림은 가지 않는다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ScheduledJobs {

    private final BizinfoCollector bizinfo;
    private final EcosCollector ecos;
    private final ProfileMatchTrigger profileMatchTrigger;
    private final AiEngineClient aiEngine;
    private final JdbcTemplate jdbc;

    /** 06:00 수집 전용 — 수집 후 BM25·임베딩 재구성. */
    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    public void collectAndIndex() {
        log.info("bizinfo upserted={}, ecos={}", bizinfo.collect(), ecos.collect());
        aiEngine.rebuildIndexes(); // 수집 후 BM25·임베딩 재구성
    }

    /**
     * 매분 정각 — 현재 시:분(Asia/Seoul)을 알림 시각으로 설정한 사용자의 활성 프로필만 재매칭.
     * profile_funding_alert dedup 이 이미 알린 공고를 걸러내므로 신규 매칭만 통과한다.
     */
    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    public void notifyTimeMatchTrigger() {
        ZonedDateTime now = ZonedDateTime.now(ZoneId.of("Asia/Seoul"));
        int hour = now.getHour();
        int minute = now.getMinute();
        List<Long> profileIds = jdbc.queryForList(
                "SELECT bp.id FROM business_profile bp " +
                        "JOIN app_user u ON u.id = bp.user_id " +
                        "WHERE bp.biz_status = 'ACTIVE' AND u.preferred_notify_hour = ? AND u.preferred_notify_minute = ?",
                Long.class, hour, minute);
        log.info("notifyTimeMatchTrigger hour={}, minute={}, targetProfiles={}", hour, minute, profileIds.size());
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
