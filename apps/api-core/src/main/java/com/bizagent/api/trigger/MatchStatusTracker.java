package com.bizagent.api.trigger;

import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 온보딩 직후 비동기로 도는 매칭 파이프라인의 진행 단계를 프론트가 폴링할 수 있게
 * 잠깐 들고 있는다(이슈 #53). 영구 저장 대상이 아니다 — 순수 UX 진행률 표시용이라
 * 재시작되면 사라져도 무방하다.
 */
@Component
public class MatchStatusTracker {

    public enum Stage { SEARCHING, ANALYZING, GENERATING, DONE, NO_MATCH, FAILED }

    public record Status(Stage stage, Long reportId) {}

    private final Map<Long, Status> statuses = new ConcurrentHashMap<>();

    public void set(long profileId, Stage stage) {
        statuses.put(profileId, new Status(stage, null));
    }

    public void done(long profileId, long reportId) {
        statuses.put(profileId, new Status(Stage.DONE, reportId));
    }

    public void noMatch(long profileId) {
        statuses.put(profileId, new Status(Stage.NO_MATCH, null));
    }

    public void fail(long profileId) {
        statuses.put(profileId, new Status(Stage.FAILED, null));
    }

    /** 아직 폴링 시작 전(트리거가 아직 첫 단계에 진입 못함)이면 검색 중으로 간주 — null 처리를 프론트에 떠넘기지 않는다. */
    public Status get(long profileId) {
        return statuses.getOrDefault(profileId, new Status(Stage.SEARCHING, null));
    }
}
