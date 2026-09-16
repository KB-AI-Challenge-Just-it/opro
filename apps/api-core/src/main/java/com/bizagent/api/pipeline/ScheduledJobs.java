package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.collect.BizinfoCollector;
import com.bizagent.api.collect.DaeguStartupCollector;
import com.bizagent.api.collect.EcosCollector;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.function.IntSupplier;

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
    private final DaeguStartupCollector daegu;
    private final ProfileMatchTrigger profileMatchTrigger;
    private final AiEngineClient aiEngine;
    private final JdbcTemplate jdbc;

    /** 비용이 발생할 수 있는 매분 능동 매칭은 기본적으로 꺼 둔다. */
    @Value("${biz-agent.scheduler.notify-enabled:false}")
    private boolean notifyEnabled;

    /** 06:00 수집 전용 — 수집 후 BM25·임베딩 재구성.
     *  daegu(대구창업허브)는 HTML 크롤링이라 요청 딜레이만큼 오래 걸린다 — collector.daegu
     *  .max-detail-per-run으로 1회 실행 시간을 묶어두고, 초과분은 다음 실행이 이어받는다.
     *
     *  수집기는 축별로 독립 실패해야 한다. 예전엔 세 호출이 한 log.info 인자로 묶여 있어
     *  기업마당 API 한 곳이 죽으면 ecos·daegu는 물론 rebuildIndexes()까지 통째로 건너뛰었다
     *  — 외부 API 한 곳의 장애가 그날 배치 전체를 무효로 만든다. 각자 감싸서 끊어낸다. */
    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    public void collectAndIndex() {
        log.info("collect 완료 — bizinfo={}, ecos={}, daegu={}",
                safeCollect("bizinfo", bizinfo::collect),
                safeCollect("ecos", ecos::collect),
                safeCollect("daegu", daegu::collect));
        try {
            aiEngine.rebuildIndexes(); // 수집 후 BM25·임베딩 재구성
        } catch (Exception e) {
            log.warn("인덱스 재구성 실패 — 다음 배치에서 재시도: {}", e.toString());
        }
    }

    /** 수집기 하나의 실패를 그 축으로 가둔다. 실패 시 건수 대신 "FAILED"를 로그에 남긴다. */
    private String safeCollect(String name, IntSupplier collector) {
        try {
            return String.valueOf(collector.getAsInt());
        } catch (Exception e) {
            log.warn("{} 수집 실패, 다른 수집기는 계속 진행: {}", name, e.toString());
            return "FAILED";
        }
    }

    /**
     * 매분 정각 — 현재 시:분(Asia/Seoul)을 알림 시각으로 설정한 사용자의 활성 프로필만 재매칭.
     * profile_funding_alert dedup 이 이미 알린 공고를 걸러내므로 신규 매칭만 통과한다.
     */
    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    public void notifyTimeMatchTrigger() {
        if (!notifyEnabled) {
            return;
        }
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
