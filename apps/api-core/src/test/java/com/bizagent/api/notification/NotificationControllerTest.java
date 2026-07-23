package com.bizagent.api.notification;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 이슈 #106 — PATCH /api/notifications/by-report/{reportId}/read.
 *
 * 프로필 목록/카카오 딥링크로 리포트를 직접 열 때 호출되는 fire-and-forget 엔드포인트.
 * markReadByReport 는 report_id + profile_id + status='UNREAD' 조건으로 idempotent 하게
 * 읽음 처리하며(0건 업데이트여도 예외 없음), 소유권을 profile_id 로 스코프한다.
 *
 * JdbcTemplate 은 서브클래스 fake 로 대체해 update() 를 in-memory row 시뮬레이터에 연결한다.
 * (Mockito 5 varargs 매칭의 모호함을 피하고, WHERE 조건이 실제로 동작하는지 컨트롤러 경계에서 검증)
 */
class NotificationControllerTest {

    private static final long REPORT_ID = 42L;
    private static final long OWNER_PROFILE = 7L;
    private static final long OTHER_PROFILE = 99L;

    /** notification 테이블의 단일 row 를 흉내내는 상태 홀더. */
    private static final class Row {
        final long reportId;
        final long profileId;
        String status;
        Row(long reportId, long profileId, String status) {
            this.reportId = reportId;
            this.profileId = profileId;
            this.status = status;
        }
    }

    /**
     * update() 를 in-memory db 에 연결하는 JdbcTemplate fake. args = (reportId, profileId) 로
     * 가정하고 컨트롤러 SQL 의 WHERE(report_id=? AND profile_id=? AND status='UNREAD') 를
     * 그대로 재현, 매칭되는 row 만 READ 로 바꾸고 갱신 건수를 돌려준다. 마지막 SQL/args 도 기록.
     */
    private static final class FakeJdbc extends JdbcTemplate {
        final List<Row> db;
        String lastSql;
        Object[] lastArgs;

        FakeJdbc(List<Row> db) {
            this.db = db;
        }

        @Override
        public int update(String sql, Object... args) {
            this.lastSql = sql;
            this.lastArgs = args;
            long reportId = ((Number) args[0]).longValue();
            long profileId = ((Number) args[1]).longValue();
            int updated = 0;
            for (Row r : db) {
                if (r.reportId == reportId && r.profileId == profileId && "UNREAD".equals(r.status)) {
                    r.status = "READ";
                    updated++;
                }
            }
            return updated;
        }
    }

    private static NotificationController controller(JdbcTemplate jdbc) {
        return new NotificationController(mock(NotificationRepository.class), jdbc);
    }

    @Test
    void markReadByReport_marksOwnersUnreadRowAsRead() {
        List<Row> db = new ArrayList<>(List.of(new Row(REPORT_ID, OWNER_PROFILE, "UNREAD")));

        controller(new FakeJdbc(db)).markReadByReport(REPORT_ID, OWNER_PROFILE);

        assertThat(db.get(0).status).isEqualTo("READ");
    }

    @Test
    void markReadByReport_isIdempotent_whenAlreadyRead() {
        // 이미 READ 인 row: 0건 업데이트, 예외 없이 조용히 통과해야 한다.
        List<Row> db = new ArrayList<>(List.of(new Row(REPORT_ID, OWNER_PROFILE, "READ")));

        controller(new FakeJdbc(db)).markReadByReport(REPORT_ID, OWNER_PROFILE); // no throw

        assertThat(db.get(0).status).isEqualTo("READ");
    }

    @Test
    void markReadByReport_isIdempotent_whenNoNotificationForReport() {
        // 알림 없이 생성된 오래된 리포트: 해당 report_id row 가 아예 없어도 404 없이 통과.
        List<Row> db = new ArrayList<>();

        controller(new FakeJdbc(db)).markReadByReport(REPORT_ID, OWNER_PROFILE); // no throw

        assertThat(db).isEmpty();
    }

    @Test
    void markReadByReport_doesNotTouchOtherUsersNotification() {
        // 소유권 스코프: 다른 사용자(OTHER_PROFILE)가 OWNER 의 리포트 알림을 읽음 처리하지 못한다.
        List<Row> db = new ArrayList<>(List.of(new Row(REPORT_ID, OWNER_PROFILE, "UNREAD")));

        controller(new FakeJdbc(db)).markReadByReport(REPORT_ID, OTHER_PROFILE); // no throw

        assertThat(db.get(0).status).isEqualTo("UNREAD"); // owner 의 알림은 그대로 UNREAD
    }

    @Test
    void markReadByReport_scopesSqlByReportAndProfileAndUnreadStatus() {
        // SQL 계약: report_id/profile_id 스코프 + status='UNREAD' 필터를 파라미터 순서대로 전달한다.
        FakeJdbc jdbc = new FakeJdbc(new ArrayList<>());

        controller(jdbc).markReadByReport(REPORT_ID, OWNER_PROFILE);

        assertThat(jdbc.lastSql)
                .contains("report_id = ?")
                .contains("profile_id = ?")
                .contains("status = 'UNREAD'");
        assertThat(jdbc.lastArgs).containsExactly(REPORT_ID, OWNER_PROFILE);
    }

    @Test
    void list_isUnchanged_andDelegatesToRepository() {
        // 회귀 가드: list 는 repository 만 쓴다(기존 계약 유지).
        NotificationRepository repo = mock(NotificationRepository.class);
        when(repo.findByProfileIdAndStatusOrderByCreatedAtDesc(OWNER_PROFILE, "UNREAD"))
                .thenReturn(List.of());

        new NotificationController(repo, mock(JdbcTemplate.class)).list(OWNER_PROFILE, "UNREAD");

        verify(repo).findByProfileIdAndStatusOrderByCreatedAtDesc(OWNER_PROFILE, "UNREAD");
    }
}
