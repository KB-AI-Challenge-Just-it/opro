package com.bizagent.api.pipeline;

import com.bizagent.api.aiclient.AiEngineClient;
import com.bizagent.api.collect.BizinfoCollector;
import com.bizagent.api.collect.EcosCollector;
import com.bizagent.api.collect.SbizCollector;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 이슈 #110 — ScheduledJobs 분리:
 *  - collectAndIndex(): 수집 + 인덱스 재구성만, 프로필 매칭 없음(회귀 가드).
 *  - hourlyMatchTrigger(): preferred_notify_hour 가 현재 시각과 일치하는 프로필만 매칭.
 *
 * JdbcTemplate 은 서브클래스 fake 로 대체한다. fake 는 (id, hour) row 를 들고 있다가
 * 컨트롤러가 넘긴 hour 인자와 일치하는 id 만 돌려줘 SQL 의 WHERE preferred_notify_hour=? 를 재현한다.
 */
class ScheduledJobsTest {

    /** business_profile 의 (id, preferred_notify_hour) 를 흉내내는 in-memory row. */
    private record Row(long id, int hour) {}

    /**
     * queryForList(sql, Long.class, hour) 를 in-memory row 에 연결하는 fake.
     * WHERE preferred_notify_hour=? 를 재현: 인자 hour 와 같은 row 의 id 만 반환.
     */
    private static final class FakeJdbc extends JdbcTemplate {
        final List<Row> db;
        FakeJdbc(List<Row> db) { this.db = db; }

        @Override
        @SuppressWarnings("unchecked")
        public <T> List<T> queryForList(String sql, Class<T> elementType, Object... args) {
            int hour = ((Number) args[0]).intValue();
            List<Long> out = new ArrayList<>();
            for (Row r : db) {
                if (r.hour() == hour) out.add(r.id());
            }
            return (List<T>) out;
        }
    }

    private static ScheduledJobs jobs(JdbcTemplate jdbc, ProfileMatchTrigger trigger,
                                      BizinfoCollector bizinfo, EcosCollector ecos,
                                      SbizCollector sbiz, AiEngineClient aiEngine) {
        return new ScheduledJobs(bizinfo, ecos, sbiz, trigger, aiEngine, jdbc);
    }

    private static int nowHour() {
        return ZonedDateTime.now(ZoneId.of("Asia/Seoul")).getHour();
    }

    @Test
    void hourlyMatchTrigger_onlyRunsProfilesForCurrentHour() {
        int now = nowHour();
        int other = (now + 1) % 24;
        long matchingId = 11L;
        long otherId = 22L;
        FakeJdbc jdbc = new FakeJdbc(new ArrayList<>(List.of(new Row(matchingId, now), new Row(otherId, other))));
        ProfileMatchTrigger trigger = mock(ProfileMatchTrigger.class);
        when(trigger.runForProfile(matchingId))
                .thenReturn(new ProfileMatchTrigger.RunResult(matchingId, 0, null));

        jobs(jdbc, trigger, mock(BizinfoCollector.class), mock(EcosCollector.class),
                mock(SbizCollector.class), mock(AiEngineClient.class)).hourlyMatchTrigger();

        verify(trigger).runForProfile(matchingId);
        verify(trigger, never()).runForProfile(otherId);
    }

    @Test
    void hourlyMatchTrigger_continuesAfterFailure() {
        int now = nowHour();
        long failing = 1L;
        long ok = 2L;
        FakeJdbc jdbc = new FakeJdbc(new ArrayList<>(List.of(new Row(failing, now), new Row(ok, now))));
        ProfileMatchTrigger trigger = mock(ProfileMatchTrigger.class);
        when(trigger.runForProfile(failing)).thenThrow(new RuntimeException("boom"));
        when(trigger.runForProfile(ok)).thenReturn(new ProfileMatchTrigger.RunResult(ok, 1, 99L));

        // 한 프로필 실패가 배치를 멈추지 않는다.
        jobs(jdbc, trigger, mock(BizinfoCollector.class), mock(EcosCollector.class),
                mock(SbizCollector.class), mock(AiEngineClient.class)).hourlyMatchTrigger();

        verify(trigger).runForProfile(failing);
        verify(trigger).runForProfile(ok);
    }

    @Test
    void collectAndIndex_collectsAndRebuildsWithoutMatching() {
        BizinfoCollector bizinfo = mock(BizinfoCollector.class);
        EcosCollector ecos = mock(EcosCollector.class);
        SbizCollector sbiz = mock(SbizCollector.class);
        AiEngineClient aiEngine = mock(AiEngineClient.class);
        ProfileMatchTrigger trigger = mock(ProfileMatchTrigger.class);
        when(bizinfo.collect()).thenReturn(3);
        when(ecos.collect()).thenReturn(1);
        when(sbiz.collect()).thenReturn(2);

        jobs(mock(JdbcTemplate.class), trigger, bizinfo, ecos, sbiz, aiEngine).collectAndIndex();

        verify(bizinfo).collect();
        verify(ecos).collect();
        verify(sbiz).collect();
        verify(aiEngine).rebuildIndexes();
        // 수집 잡은 프로필 매칭을 하지 않는다(이슈 #110 분리 회귀 가드).
        verifyNoInteractions(trigger);
    }
}
