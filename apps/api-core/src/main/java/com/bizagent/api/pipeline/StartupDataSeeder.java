package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.collect.BizinfoCollector;
import com.bizagent.api.collect.EcosCollector;
import com.bizagent.api.collect.SbizCollector;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 기동 시 조건부 자동 수집 (이슈 #70). ScheduledJobs 의 형제 — 06:00 크론과 별개로,
 * 개발 컨테이너가 그 시각을 못 넘기고 재기동돼 실 데이터가 한 번도 안 들어온 상태를 방지한다.
 *
 * 실 데이터(pblanc_id NOT LIKE 'DEMO-%')가 전무할 때만 수집을 돌린다 — 이미 있으면 스킵해서
 * 재기동마다 재수집하는 API 낭비·기동 지연을 막는다. 수집은 반드시 별도 가상 스레드에서 돌려
 * 앱 기동(Tomcat 리스닝) 자체는 지연시키지 않는다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class StartupDataSeeder {

    private final BizinfoCollector bizinfo;
    private final EcosCollector ecos;
    private final SbizCollector sbiz;
    private final AiEngineClient aiEngine;
    private final JdbcTemplate jdbc;
    private final DataReadinessGate dataReadinessGate;

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        Integer realCount = jdbc.queryForObject(
                "SELECT count(*) FROM policy_announcement WHERE pblanc_id NOT LIKE 'DEMO-%'", Integer.class);
        long count = realCount == null ? 0 : realCount;

        if (count > 0) {
            log.info("[startup-collect] 실 데이터 {}건 이미 존재 — 자동 수집 스킵", count);
            dataReadinessGate.markReady();
            return;
        }

        log.info("[startup-collect] 실 데이터 없음(시드만 존재) — 자동 수집 시작");
        Thread.ofVirtual().start(this::collect);
    }

    /** 자동 수집. 성공/실패 불문 반드시 게이트를 완료 처리한다 — 미완료로 남으면 매칭이 무한 대기한다. */
    private void collect() {
        long start = System.currentTimeMillis();
        try {
            int bizinfoCount = bizinfo.collect();
            int ecosCount = ecos.collect();
            int sbizCount = sbiz.collect();
            Object indexed = aiEngine.rebuildIndexes();
            log.info("[startup-collect] 완료: bizinfo={}, ecos={}, sbiz={}, indexed={} ({}ms)",
                    bizinfoCount, ecosCount, sbizCount, indexed, System.currentTimeMillis() - start);
        } catch (Exception e) {
            log.warn("[startup-collect] 자동 수집 실패: {}", e.toString());
        } finally {
            dataReadinessGate.markReady();
        }
    }
}
