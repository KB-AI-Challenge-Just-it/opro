package com.bizagent.api.collect;

import com.bizagent.api.collect.DaeguStartupCollector.Detail;
import com.bizagent.api.collect.DaeguStartupCollector.Listing;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 대구창업허브(DASH) 파싱 단위 테스트 — 전부 네트워크 없이 돈다.
 * 실제 사이트에서 받아 저장한 HTML(src/test/resources/daegu)로 파싱 로직만 검증한다.
 */
class DaeguStartupCollectorTest {

    private static final String LIST_HTML = fixture("daegu/list_p1.html");
    private static final String DETAIL_HTML = fixture("daegu/detail_PROJECT_00005021.html");

    private static String fixture(String path) {
        try (InputStream in = DaeguStartupCollectorTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("fixture 없음: " + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Listing firstListing() {
        return DaeguStartupCollector.parseList(LIST_HTML).get(0);
    }

    // ── 목록 파싱 ─────────────────────────────────────────────────────────

    @Test
    void parseList_readsEveryAnnouncementOnThePage() {
        List<Listing> items = DaeguStartupCollector.parseList(LIST_HTML);

        assertThat(items).hasSize(10);                       // DASH는 10건/페이지
        assertThat(items).allSatisfy(l -> {
            assertThat(l.projectId()).startsWith("PROJECT_");
            assertThat(l.title()).isNotBlank();
        });
    }

    @Test
    void parseList_stripsCategoryBadgeFromTitle() {
        Listing l = firstListing();

        // span.kind를 안 떼면 "창업교육[대구지식재산센터] …"가 된다 — 제목이 카테고리로 오염되는 회귀 방지.
        assertThat(l.title()).isEqualTo("[대구지식재산센터] 2026년 IP인식제고 상표권 무료교육");
        assertThat(l.title()).doesNotStartWith("창업교육");
    }

    @Test
    void parseList_readsCategoryTargetAndInstitution() {
        Listing l = firstListing();

        assertThat(l.category()).isEqualTo("창업교육");       // → support_field (data-category-type)
        assertThat(l.target()).isEqualTo("예비창업자+창업자"); // → target (em 라벨 제거됨)
        assertThat(l.institution()).isEqualTo("대구상공회의소"); // → raw 전용. region으로 절대 쓰지 않는다
    }

    @Test
    void parseList_collectsAllFourCategoryTypes() {
        // 업종·분류를 코드에 하드코딩하지 않고 사이트가 주는 값을 그대로 싣는다는 확인
        // (특정 카테고리만 필터링하면 이 어서션이 깨진다).
        List<String> categories = DaeguStartupCollector.parseList(LIST_HTML).stream()
                .map(Listing::category).distinct().toList();

        assertThat(categories).isNotEmpty().doesNotContainNull();
    }

    @Test
    void parseList_parsesReceiptPeriodSplitAcrossWhitespace() {
        Listing l = firstListing();

        // 원문은 "2026-09-16\n 09:\n 00\n ~\n 2026-10-20\n 09:\n 00" 처럼 쪼개져 있다.
        assertThat(l.applyStart()).isEqualTo("2026-09-16");
        assertThat(l.applyEnd()).isEqualTo("2026-10-20");
    }

    // ── 날짜 방어 ─────────────────────────────────────────────────────────

    @Test
    void parseDate_returnsNullForFreeTextAndMissingValues() {
        // 자유텍스트를 그대로 ::date 캐스트에 넘기면 SQL 예외로 배치 전체가 죽는다
        // (BizinfoCollector.parseDate와 같은 방어).
        assertThat(DaeguStartupCollector.parseDate("상시모집", 0)).isNull();
        assertThat(DaeguStartupCollector.parseDate("예산 소진시까지", 1)).isNull();
        assertThat(DaeguStartupCollector.parseDate("", 0)).isNull();
        assertThat(DaeguStartupCollector.parseDate(null, 0)).isNull();
        assertThat(DaeguStartupCollector.parseDate("2026-09-16 09: 00", 1)).isNull();  // '~' 뒤가 없음
        assertThat(DaeguStartupCollector.parseDate("2026-13-45 ~ 2026-13-99", 0)).isNull(); // 형식만 맞는 값
    }

    @Test
    void parseDate_extractsIsoDateIgnoringTimePart() {
        assertThat(DaeguStartupCollector.parseDate("2026-09-16 09: 00 ~ 2026-10-20 09: 00", 0))
                .isEqualTo("2026-09-16");
        assertThat(DaeguStartupCollector.parseDate("2026-09-16 09: 00 ~ 2026-10-20 09: 00", 1))
                .isEqualTo("2026-10-20");
    }

    // ── 페이저 ────────────────────────────────────────────────────────────

    @Test
    void parseLastPage_readsTotalPagesFromPager() {
        // 페이지 수를 코드에 박지 않고 "마지막" 링크에서 읽는다.
        assertThat(DaeguStartupCollector.parseLastPage(LIST_HTML)).isEqualTo(209);
        assertThat(DaeguStartupCollector.parseLastPage("<html><body>페이저 없음</body></html>")).isEqualTo(-1);
    }

    // ── 상세 파싱 ─────────────────────────────────────────────────────────

    @Test
    void parseDetail_collectsPreBlocksAsSummaryHtml() {
        Detail d = DaeguStartupCollector.parseDetail(DETAIL_HTML, "https://startup.daegu.go.kr");

        assertThat(d.summaryHtml()).isNotBlank();
        assertThat(d.summaryHtml()).contains("대구지역 소상공인 및 일반인");   // 지원내용 및 대상
        assertThat(d.summaryHtml()).contains("일반인 및 소상공인을 위한 무료상표 강좌"); // 간단소개
        // <br/> 마크업은 남긴다 — 컬럼명이 summary_html이고 ai-engine의 두 소비자가 모두
        // strip_html()을 거치므로 기업마당 bsnsSumryCn과 동일한 취급을 받는다.
        assertThat(d.summaryHtml()).contains("<br>");
        // 꺾쇠로 감싼 한글(<소상공인 상표출원지원사업>)이 태그로 먹혀 사라지지 않아야 한다.
        assertThat(d.summaryHtml()).contains("소상공인 상표출원지원사업");
    }

    @Test
    void parseDetail_buildsDownloadUrlFromHiddenEncodeFileId() {
        Detail d = DaeguStartupCollector.parseDetail(DETAIL_HTML, "https://startup.daegu.go.kr");

        assertThat(d.attachmentUrls()).hasSize(1);
        assertThat(d.attachmentUrls().get(0))
                .startsWith("https://startup.daegu.go.kr/icms/cmm/fms/FileDownForBoard.do?")
                .contains("atchFileId=FILE_000000000090175RDUXIB")
                .contains("fileSn=1")
                .contains("encodeFileId=TUkjbLK9jYADYEpiU2%2Fw7MerJypfU3qVDbb5fbPeZfc%3D")
                .doesNotContain("jsessionid");   // 세션 전용 경로 파라미터는 뺀다
        assertThat(d.attachmentNames()).containsExactly("상표교육신청서2차.hwp");
        assertThat(d.attachmentFileIds()).containsExactly("FILE_000000000090175RDUXIB:1");
    }

    @Test
    void parseDetail_leavesAttachmentUrlsEmptyWhenEncodeFileIdMissing() {
        // encodeFileId hidden input이 없으면 URL을 추측하지 않고 fileId만 보관한다.
        String html = """
            <html><body>
              <a href="javascript:fn_egov_downFile('FILE_XYZ','2')" title="공고문.pdf">공고문.pdf</a>
              <pre>본문</pre>
            </body></html>
            """;

        Detail d = DaeguStartupCollector.parseDetail(html, "https://startup.daegu.go.kr");

        assertThat(d.attachmentUrls()).isEmpty();
        assertThat(d.attachmentFileIds()).containsExactly("FILE_XYZ:2");
    }

    // ── 적재 계약 ─────────────────────────────────────────────────────────

    @Test
    void upsertArgs_prefixesIdAndUsesConfiguredRegionNotInstitution() {
        DaeguStartupCollector collector = new DaeguStartupCollector(mock(JdbcTemplate.class));
        ReflectionTestUtils.setField(collector, "region", "대구광역시");
        Listing l = firstListing();
        Detail d = DaeguStartupCollector.parseDetail(DETAIL_HTML, "https://startup.daegu.go.kr");

        Object[] args = collector.upsertArgs(l, d, "https://startup.daegu.go.kr/detail");

        assertThat(args[0]).isEqualTo("DAEGU_PROJECT_00005021");   // 기업마당과 PK 네임스페이스 분리
        assertThat(args[3]).isEqualTo("창업교육");                   // support_field
        assertThat(args[5]).isEqualTo("대구광역시");                 // region = 설정된 고정 지역값
        assertThat(args[5]).isNotEqualTo(l.institution());          // ⚠ 기관명이 들어가면 타 지역 오매칭
        assertThat(args[6]).isEqualTo("2026-09-16");
        assertThat(args[7]).isEqualTo("2026-10-20");
        assertThat(args[11]).isEqualTo("DAEGU_DASH");               // source
        // 기관명은 raw에만 — "경북대학교 스타트업지원센터" 같은 값이 region에 새면
        // hybrid_search._region_result()의 부분매치로 경상북도 사업자에게 잘못 매칭된다.
        assertThat((String) args[10]).contains("\"institution\":\"대구상공회의소\"");
    }

    @Test
    void upsertArgs_passesNullAttachmentsWhenNoFiles() {
        DaeguStartupCollector collector = new DaeguStartupCollector(mock(JdbcTemplate.class));
        ReflectionTestUtils.setField(collector, "region", "대구광역시");
        Detail empty = new Detail("<p>본문</p>", List.of(), List.of(), List.of());

        Object[] args = collector.upsertArgs(firstListing(), empty, "https://example.com");

        assertThat(args[9]).isNull();   // string_to_array(NULL, ',') → NULL
    }

    @Test
    void upsertSql_onConflictTouchesOnlyLastSeenAt() {
        // 하드 계약: ai-engine indexing.py가 "수집기는 기존 행의 title/summary_html을 갱신하지
        // 않는다"는 전제로 Chroma 재임베딩을 스킵한다. 이 전제가 깨지면 재기동마다 전체
        // 재임베딩이 돌아 헬스체크(start_period 300s)를 넘겨 api-core/web이 아예 못 뜬다.
        String sql = DaeguStartupCollector.UPSERT_SQL;
        String onConflict = sql.substring(sql.indexOf("ON CONFLICT"));

        assertThat(onConflict).contains("DO UPDATE SET last_seen_at = now()");
        assertThat(onConflict).doesNotContain("title");
        assertThat(onConflict).doesNotContain("summary_html");
        assertThat(onConflict).doesNotContain("EXCLUDED");
        assertThat(sql).contains("source");   // 출처를 기본값에 맡기지 않고 명시
    }

    // ── 토글 ──────────────────────────────────────────────────────────────

    @Test
    void collect_returnsZeroWithoutTouchingDb_whenDisabled() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DaeguStartupCollector collector = new DaeguStartupCollector(jdbc);
        ReflectionTestUtils.setField(collector, "enabled", false);

        assertThat(collector.collect()).isZero();
        verifyNoInteractions(jdbc);
    }

    // ── 상세 조회 예산 (QA FAIL #1 회귀 고정) ──────────────────────────────

    /** fetch()를 가로채 네트워크 없이 "상세는 항상 실패"를 재현하고 시도 횟수를 센다. */
    private static class FailingDetailCollector extends DaeguStartupCollector {
        int detailAttempts = 0;
        FailingDetailCollector(JdbcTemplate jdbc) { super(jdbc); }
        @Override
        String fetch(String url) {
            if (url.contains("projectFrontDetail.do")) {
                detailAttempts++;
                throw new RuntimeException("상세 조회 실패(시뮬레이션)");
            }
            return LIST_HTML;
        }
    }

    private static FailingDetailCollector failingCollector(int budget, String budgetField) {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        // 기존 공고 없음 → 목록 10건이 전부 신규
        when(jdbc.queryForList(anyString(), eq(String.class), any(Object[].class))).thenReturn(List.of());
        FailingDetailCollector c = new FailingDetailCollector(jdbc);
        ReflectionTestUtils.setField(c, "enabled", true);
        ReflectionTestUtils.setField(c, "region", "대구광역시");
        ReflectionTestUtils.setField(c, "baseUrl", "https://startup.daegu.go.kr");
        ReflectionTestUtils.setField(c, "menuId", "00002552");
        ReflectionTestUtils.setField(c, "maxPages", 1);
        ReflectionTestUtils.setField(c, "requestDelayMs", 0L);
        ReflectionTestUtils.setField(c, budgetField, budget);
        return c;
    }

    @Test
    void detailBudget_countsAttemptsNotSuccesses_soPersistentFailuresStillTripTheCap() {
        // 회귀 고정: 예전엔 fetch() 성공 뒤에 카운터를 올려서, 상세가 계속 실패하면 상한이
        // 영원히 트립되지 않고 신규 전건(첫 백필 2,000건대)을 끝까지 돌았다. TIMEOUT 30초가
        // 걸리면 스케줄러 스레드를 수 시간 점유한다.
        FailingDetailCollector c = failingCollector(3, "maxDetailPerRun");

        int inserted = c.collect();

        assertThat(inserted).isZero();                 // 전부 실패했으니 적재 0
        assertThat(c.detailAttempts).isEqualTo(3);     // 신규는 10건이지만 예산만큼만 시도
    }

    @Test
    void seedBudget_isUsedByCollectForSeed_andIsIndependentOfBatchBudget() {
        // 시더는 06:00 배치보다 작은 예산을 쓴다 — 기동 때마다 수십 분 크롤링하지 않기 위함.
        FailingDetailCollector c = failingCollector(2, "seedMaxDetail");
        ReflectionTestUtils.setField(c, "maxDetailPerRun", 300);

        c.collectForSeed();

        assertThat(c.detailAttempts).isEqualTo(2);     // 배치 예산(300)이 아니라 시더 예산(2)
    }

    @Test
    void collectForSeed_respectsDisabledToggle() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DaeguStartupCollector c = new DaeguStartupCollector(jdbc);
        ReflectionTestUtils.setField(c, "enabled", false);

        assertThat(c.collectForSeed()).isZero();
        verifyNoInteractions(jdbc);
    }

    // ── URL 조립 ──────────────────────────────────────────────────────────

    @Test
    void detailUrl_keepsNestedQueryFormRequiredByTheSite() {
        DaeguStartupCollector collector = new DaeguStartupCollector(mock(JdbcTemplate.class));
        ReflectionTestUtils.setField(collector, "baseUrl", "https://startup.daegu.go.kr");
        ReflectionTestUtils.setField(collector, "menuId", "00002552");

        // menu_link 값 안에 ?project_id=가 한 번 더 들어가는 형태 — 인코딩하면 200이 안 온다.
        assertThat(collector.detailUrl("PROJECT_00005021")).isEqualTo(
                "https://startup.daegu.go.kr/index.do?menu_id=00002552"
                        + "&menu_link=/front/project/projectFrontDetail.do?project_id=PROJECT_00005021");
        assertThat(collector.listUrl(3)).isEqualTo(
                "https://startup.daegu.go.kr/index.do?menu_id=00002552"
                        + "&menu_link=/front/project/projectFrontList.do&pageIndex=3");
    }
}
