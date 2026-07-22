package com.bizagent.api.pipeline;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * 데이터 준비 게이트 (이슈 #70). 매칭이 빈 인덱스로 도는 것을 막는다.
 * StartupDataSeeder 가 자동 수집을 도는 동안 매칭 진입점이 여기서 대기하고,
 * 수집이 끝나면(성공/실패 불문) 통과시킨다.
 * 실 데이터가 이미 있으면 즉시 완료 처리되어 대기가 0이다 — 평상시 플로우엔 지연이 없다.
 */
@Slf4j
@Component
public class DataReadinessGate {

    private final CompletableFuture<Void> ready = new CompletableFuture<>();

    /** 데이터가 준비됨(또는 자동 수집이 성공/실패로 종료됨)을 표시. 멱등 — 여러 번 호출돼도 무방. */
    public void markReady() {
        ready.complete(null);
    }

    /**
     * 데이터가 준비될 때까지 대기(상한 timeout). 이미 준비됐으면 즉시 리턴.
     * 타임아웃이든 그 밖의 예외든 전부 조용히 삼키고 리턴한다 —
     * 게이트 대기 실패가 매칭 자체를 막으면 안 되기 때문.
     */
    public void awaitReady(Duration timeout) {
        try {
            ready.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            log.warn("[data-gate] 준비 대기 종료(계속 진행): {}", e.toString());
        }
    }
}
