package com.bizagent.api.aiclient;

import com.bizagent.api.collect.BizinfoCollector;
import com.bizagent.api.collect.EcosCollector;
import com.bizagent.api.trigger.ProfileMatchTrigger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 이슈 #160 — POST /api/agent/draft 는 같은 (reportId, pblancId)로 다시 호출돼도
 * LLM을 재호출하지 않고 기존 초안을 그대로 반환해야 한다. 가드가 없으면 호출마다 다른
 * 문구가 새 row로 쌓이고, 조회는 최신 row만 보여줘 이전 초안이 조용히 안 보이게 된다.
 */
class AgentControllerTest {

    private static final long REPORT_ID = 1L;
    private static final String PBLANC_ID = "DEMO-0001";

    /** application_draft 존재 여부 조회(query)와 생성 경로(queryForMap/update)를
     *  모두 흉내내는 JdbcTemplate fake. existingSectionsJson이 null이면 "기존 초안 없음". */
    private static final class FakeJdbc extends JdbcTemplate {
        final String existingSectionsJson;
        final Map<String, Object> reportRow;
        final Map<String, Object> profileRow;
        final Map<String, Object> announcementRow;
        int insertCount = 0;

        FakeJdbc(String existingSectionsJson, Map<String, Object> reportRow,
                 Map<String, Object> profileRow, Map<String, Object> announcementRow) {
            this.existingSectionsJson = existingSectionsJson;
            this.reportRow = reportRow;
            this.profileRow = profileRow;
            this.announcementRow = announcementRow;
        }

        @Override
        @SuppressWarnings("unchecked")
        public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
            List<T> out = new ArrayList<>();
            if (existingSectionsJson != null) out.add((T) existingSectionsJson);
            return out;
        }

        @Override
        public Map<String, Object> queryForMap(String sql, Object... args) {
            if (sql.contains("FROM report")) return reportRow;
            if (sql.contains("FROM business_profile")) return profileRow;
            if (sql.contains("FROM policy_announcement")) return announcementRow;
            throw new IllegalStateException("예상치 못한 쿼리: " + sql);
        }

        @Override
        public int update(String sql, Object... args) {
            insertCount++;
            return 1;
        }
    }

    private static AgentController controller(FakeJdbc jdbc, AiEngineClient aiEngine) {
        return new AgentController(
                mock(ProfileMatchTrigger.class), aiEngine, jdbc,
                mock(BizinfoCollector.class), mock(EcosCollector.class));
    }

    @Test
    void draft_returnsExistingDraft_withoutCallingLlmAgain() {
        FakeJdbc jdbc = new FakeJdbc("{\"사업개요\":\"어제 생성된 문구\"}", null, null, null);
        AiEngineClient aiEngine = mock(AiEngineClient.class);

        Map<String, Object> result = controller(jdbc, aiEngine).draft(REPORT_ID, PBLANC_ID);

        verify(aiEngine, never()).generateDraft(any(), any(), any());
        assertThat(jdbc.insertCount).isZero();
        assertThat(result.get("sections")).isEqualTo(Map.of("사업개요", "어제 생성된 문구"));
    }

    @Test
    void draft_generatesAndPersists_whenNoExistingDraft() {
        Map<String, Object> reportRow = Map.of("profile_id", 7L, "cause_text", "매출 감소");
        Map<String, Object> profileRow = Map.of("id", 7L, "industry", "카페/디저트");
        Map<String, Object> announcementRow = Map.of("pblanc_id", PBLANC_ID, "title", "테스트 공고");
        FakeJdbc jdbc = new FakeJdbc(null, reportRow, profileRow, announcementRow);
        AiEngineClient aiEngine = mock(AiEngineClient.class);
        when(aiEngine.generateDraft(any(), any(), any()))
                .thenReturn(Map.of("sections", Map.of("사업개요", "새로 생성된 문구")));

        Map<String, Object> result = controller(jdbc, aiEngine).draft(REPORT_ID, PBLANC_ID);

        verify(aiEngine, times(1)).generateDraft(any(), any(), any());
        assertThat(jdbc.insertCount).isEqualTo(1);
        assertThat(result.get("sections")).isEqualTo(Map.of("사업개요", "새로 생성된 문구"));
    }
}
