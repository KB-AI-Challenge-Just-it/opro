package com.bizagent.api.collect;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URI;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * L1 · 지역 정책자금 (대구창업허브 DASH 지원사업공고) 수집.
 *
 * 기업마당과 달리 OpenAPI가 없어 목록·상세 HTML을 jsoup으로 파싱한다(정규식으로 마크업을 긁으면
 * 사이트 개편에 바로 깨진다 — 정규식은 onclick 속성 안의 ID 추출처럼 "이미 뽑아낸 문자열"에만 쓴다).
 * 기업마당과 같은 policy_announcement 테이블을 공유하므로 pblanc_id에 'DAEGU_' 접두사를 붙여
 * PK 네임스페이스를 분리하고, source='DAEGU_DASH'로 출처를 남긴다.
 *
 * <h3>비용 구조 — 왜 델타 수집이 필수인가</h3>
 * 목록은 마감분 포함 전체 이력(약 209페이지 · 2,000건대)을 돌려준다. 매 배치마다 전건 상세를
 * 받으면 2,000회 요청이 되므로, 목록에서 얻은 ID를 DB와 먼저 대조해 <b>신규 건만</b> 상세를 받는다.
 * 초기 백필과 일일 델타가 같은 코드로 처리된다 — 첫 실행은 신규가 많고, 이후엔 몇 건뿐이다.
 *
 * <h3>깨면 안 되는 계약</h3>
 * ON CONFLICT는 last_seen_at만 갱신한다. ai-engine의 indexing.py가 "수집기는 기존 행의
 * title/summary_html을 갱신하지 않는다"는 전제로 Chroma 재임베딩을 스킵하기 때문에, 여기서
 * 본문을 덮어쓰면 재기동마다 전체 재임베딩이 돌아 헬스체크(start_period 300s)를 넘겨
 * api-core/web이 아예 뜨지 못한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DaeguStartupCollector {

    /** pblanc_id 네임스페이스 접두사. 설정으로 빼지 않는다 — PK의 일부라 값이 바뀌면 전건이
     *  새 ID로 중복 적재된다(하드코딩 금지 원칙의 대상은 업종·지역·임계값이다). */
    private static final String ID_PREFIX = "DAEGU_";
    static final String SOURCE = "DAEGU_DASH";

    private static final String LIST_PATH   = "/front/project/projectFrontList.do";
    private static final String DETAIL_PATH = "/front/project/projectFrontDetail.do";
    private static final String DOWNLOAD_PATH = "/icms/cmm/fms/FileDownForBoard.do";

    /** onclick="fn_project_detail('PROJECT_00005021'); return false;" 에서 ID만. */
    private static final Pattern PROJECT_ID = Pattern.compile("fn_project_detail\\(\\s*'([^']+)'");
    /** href="javascript:fn_egov_downFile('FILE_0000...','1')" 에서 (파일ID, 파일순번). */
    private static final Pattern DOWN_FILE = Pattern.compile("fn_egov_downFile\\(\\s*'([^']+)'\\s*,\\s*'([^']+)'");
    /** 자유텍스트 안에 섞인 ISO 날짜. n2는 "2026-09-16 09: 00 ~ 2026-10-20 09: 00"처럼 시각이 붙는다. */
    private static final Pattern ISO_DATE = Pattern.compile("(\\d{4}-\\d{2}-\\d{2})");
    private static final Pattern PAGE_INDEX = Pattern.compile("pageIndex=(\\d+)");

    // BizinfoCollector와 같은 이유로 인메모리 버퍼를 올린다 — 목록 한 장이 78KB라 기본 256KB로도
    // 통과하지만, 공고가 길어진 상세 페이지까지 안전하게 덮는다. 타임아웃도 명시(Reactor Netty는
    // 기본값이 없어 응답이 안 오면 무한정 멈춘다).
    private static final ExchangeStrategies STRATEGIES = ExchangeStrategies.builder()
        .codecs(c -> c.defaultCodecs().maxInMemorySize(4 * 1024 * 1024))
        .build();
    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private final WebClient client = WebClient.builder().exchangeStrategies(STRATEGIES).build();

    /** ID 대조 / last_seen_at 갱신 시 IN 목록을 끊는 단위 — PG 파라미터 상한(65535)에 훨씬 못 미치지만
     *  플랜 캐시가 파라미터 수마다 갈리는 것을 막고 쿼리 길이를 예측 가능하게 둔다. */
    private static final int ID_CHUNK = 500;
    /** 목록 페이지 연속 실패 허용 횟수 — 사이트 전체 장애 시 209회를 계속 두드리지 않는다. */
    private static final int MAX_CONSECUTIVE_PAGE_FAILURES = 3;

    /** 적재 SQL. 상수로 뺀 이유는 ON CONFLICT 계약(last_seen_at만 갱신)을 테스트가 직접
     *  검증할 수 있게 하기 위함이다 — 눈으로 보는 것만으로는 회귀를 못 막는다. */
    static final String UPSERT_SQL = """
        INSERT INTO policy_announcement
            (pblanc_id, title, summary_html, support_field, target, region,
             apply_start, apply_end, detail_url, attachment_urls, raw, source)
        VALUES (?, ?, ?, ?, ?, ?, ?::date, ?::date, ?, string_to_array(?::text, ','), ?::jsonb, ?)
        ON CONFLICT (pblanc_id) DO UPDATE SET last_seen_at = now()
        """;

    private final JdbcTemplate jdbc;

    @Value("${collector.daegu.enabled:true}")
    private boolean enabled;

    /** DASH는 대구 전용 포털이라 지역이 고정이다. 기관명(n1)을 region에 넣으면 안 된다 —
     *  ai-engine hybrid_search._region_result()가 region을 시/도명과 부분 문자열로 대조하는데,
     *  목록에 있는 "경북대학교 스타트업지원센터"가 "경북"에 부분매치되어 경상북도 사업자에게
     *  대구 전용 공고가 잘못 매칭된다. 기관명은 raw에만 보관한다. */
    @Value("${collector.daegu.region:대구광역시}")
    private String region;

    @Value("${collector.daegu.base-url:https://startup.daegu.go.kr}")
    private String baseUrl;

    @Value("${collector.daegu.menu-id:00002552}")
    private String menuId;

    /** 페이저에서 마지막 페이지를 읽지 못했을 때를 위한 안전 상한(무한 순회 방지). */
    @Value("${collector.daegu.max-pages:250}")
    private int maxPages;

    /**
     * 한 번의 배치에서 상세를 받아올 최대 건수. 첫 백필(2,000건대)을 한 번에 돌리면
     * 요청 딜레이까지 합쳐 15분 넘게 스케줄러를 점유해 그동안 알림 배치가 밀린다.
     * 상한을 넘긴 신규 건은 이번 실행에 적재되지 않으므로 다음 실행에서도 여전히 "신규"다 —
     * 별도 커서 없이 백필이 며칠에 걸쳐 자연스럽게 나눠 진행된다.
     */
    @Value("${collector.daegu.max-detail-per-run:300}")
    private int maxDetailPerRun;

    /**
     * 기동 시 시더(StartupDataSeeder)가 쓰는 상세 조회 예산 — 06:00 배치보다 훨씬 작게 잡는다.
     * 시더의 목적은 "빈 DB에 DASH 공고가 한 건도 없는 상태"를 벗어나는 것이다(그래야 프론트
     * 출처 필터가 렌더된다). 기동 때마다 수십 분씩 크롤링할 이유가 없고, 나머지는 06:00 배치가
     * 며칠에 걸쳐 이어받는다.
     */
    @Value("${collector.daegu.seed-max-detail:40}")
    private int seedMaxDetail;

    /** 요청 간 딜레이(ms) — robots.txt상 금지 경로는 아니지만 공공 사이트에 부담을 주지 않는다. */
    @Value("${collector.daegu.request-delay-ms:400}")
    private long requestDelayMs;

    // ── 수집 파이프라인 ────────────────────────────────────────────────────

    /** 정기 배치(06:00)용 진입점. @return 이번 실행에서 새로 적재된 공고 수. */
    public int collect() {
        return doCollect(maxDetailPerRun);
    }

    /** 기동 시 시더용 진입점 — 상세 조회 예산만 더 작게 쓰고 나머지 동작은 동일하다. */
    public int collectForSeed() {
        return doCollect(seedMaxDetail);
    }

    private int doCollect(int detailBudget) {
        if (!enabled) {
            log.info("[daegu] collector.daegu.enabled=false — 수집 생략");
            return 0;
        }

        Map<String, Listing> listings = crawlList();
        if (listings.isEmpty()) {
            log.info("[daegu] 목록이 비어 있음 — 적재 없음");
            return 0;
        }

        List<String> pblancIds = listings.keySet().stream().map(id -> ID_PREFIX + id).toList();
        Set<String> existing;
        try {
            existing = findExisting(pblancIds);
        } catch (Exception e) {
            // 델타 판정이 불가능하면 전건 상세 요청으로 번지므로 차라리 이번 배치를 건너뛴다.
            log.warn("[daegu] 기존 공고 대조 실패 — 이번 배치 건너뜀: {}", e.toString());
            return 0;
        }
        touchLastSeen(existing);   // 목록에 여전히 살아있다는 사실만 갱신(본문은 건드리지 않는다)

        List<Listing> fresh = listings.values().stream()
                .filter(l -> !existing.contains(ID_PREFIX + l.projectId()))
                .toList();
        log.info("[daegu] 목록 {}건 (기존 {}건 / 신규 {}건) — 신규분만 상세 조회",
                listings.size(), existing.size(), fresh.size());

        return fetchDetailsAndSave(fresh, detailBudget);
    }

    /** 목록을 페이지 순회하며 projectId 기준으로 중복 제거해 모은다.
     *  (목록은 최신순 라이브 피드라 크롤링 중 항목이 페이지 간에 밀리면 같은 건이 두 번 나온다.) */
    private Map<String, Listing> crawlList() {
        Map<String, Listing> byId = new LinkedHashMap<>();
        int lastPage = -1;
        int consecutiveFailures = 0;

        for (int page = 1; page <= maxPages; page++) {
            List<Listing> items;
            String html;
            try {
                html = fetch(listUrl(page));
                items = parseList(html);
                consecutiveFailures = 0;
            } catch (Exception e) {
                // 한 페이지 실패가 전체 수집을 죽이면 안 된다 — 다만 연속 실패는 사이트 장애 신호라 끊는다.
                log.warn("[daegu] 목록 {}페이지 조회 실패, 건너뜀: {}", page, e.toString());
                if (++consecutiveFailures >= MAX_CONSECUTIVE_PAGE_FAILURES) {
                    log.warn("[daegu] 목록 연속 {}회 실패 — 순회 중단", consecutiveFailures);
                    break;
                }
                if (!pause()) break;
                continue;
            }

            if (items.isEmpty()) break;                      // 페이저를 못 읽어도 빈 목록이면 끝
            for (Listing l : items) byId.putIfAbsent(l.projectId(), l);

            if (lastPage < 0) lastPage = parseLastPageSafely(html, page);
            if (lastPage > 0 && page >= lastPage) break;
            if (!pause()) break;
        }
        return byId;
    }

    /**
     * 신규 건의 상세를 받아 적재. 공고 하나가 실패해도 그 건만 건너뛴다(다음 실행에서 재시도).
     *
     * 상한은 반드시 <b>시도</b> 횟수로 센다. 성공 건수만 세면 상세 요청이 지속 실패할 때
     * (상세 URL 형식 변경·상세 경로만 WAF 차단·타임아웃) 상한이 영원히 트립되지 않아
     * fresh 전건(첫 백필이면 2,000건대)을 끝까지 돈다 — TIMEOUT 30초가 걸리는 최악의 경우
     * 스케줄러 스레드를 수 시간 점유한다. "1회 실행 시간을 묶어둔다"는 경계가 무너지는 지점.
     */
    private int fetchDetailsAndSave(List<Listing> fresh, int detailBudget) {
        int inserted = 0;
        int attempted = 0;
        for (Listing l : fresh) {
            if (attempted >= detailBudget) {
                log.info("[daegu] 상세 조회 상한({}) 도달 — 남은 {}건은 다음 실행에서 이어받는다",
                        detailBudget, fresh.size() - attempted);
                break;
            }
            attempted++;   // 성공 여부와 무관하게 선증가 — 실패가 이어져도 예산은 반드시 소진된다
            String detailUrl = detailUrl(l.projectId());
            try {
                Detail detail = parseDetail(fetch(detailUrl), baseUrl);
                inserted += save(l, detail, detailUrl);
            } catch (Exception e) {
                // 본문 없이 제목만 넣지 않는다 — 적재를 건너뛰면 여전히 "신규"로 남아 다음 실행에서 재시도된다.
                log.warn("[daegu] 공고 적재 실패, 건너뜀 projectId={}: {}", l.projectId(), e.toString());
            }
            if (!pause()) break;
        }
        return inserted;
    }

    private int save(Listing l, Detail detail, String detailUrl) {
        return jdbc.update(UPSERT_SQL, upsertArgs(l, detail, detailUrl));
    }

    /** UPSERT_SQL의 바인딩 인자. region이 기관명이 아닌 고정 지역값인지, pblanc_id 접두사가
     *  붙는지를 테스트가 네트워크 없이 검증할 수 있도록 분리했다. */
    Object[] upsertArgs(Listing l, Detail detail, String detailUrl) {
        // attachment_urls는 TEXT[] — 콤마 결합 후 string_to_array로 되돌린다. 다운로드 URL은
        // 파일ID(영숫자)와 percent-encoded base64로만 이뤄져 콤마가 나올 수 없다.
        // 빈 목록은 null로 넘긴다(string_to_array(NULL,',') → NULL).
        String attachments = detail.attachmentUrls().isEmpty()
                ? null : String.join(",", detail.attachmentUrls());
        return new Object[] {
                ID_PREFIX + l.projectId(),
                l.title(),
                detail.summaryHtml(),
                l.category(),          // support_field ← data-category-type (사업화·시설공간·창업교육·행사 네트워크)
                l.target(),
                region,                // ⚠ 기관명이 아니라 설정된 고정 지역값
                l.applyStart(),        // 파싱 실패 시 null — 자유텍스트를 ::date에 넘기면 배치가 죽는다
                l.applyEnd(),
                detailUrl,
                attachments,
                toJson(l, detail),
                SOURCE
        };
    }

    // ── 파싱 (네트워크 없이 테스트 가능한 순수 함수) ──────────────────────────

    /** 목록 페이지의 공고 항목. institution/viewCount는 raw 보관용(region으로 쓰지 않는다). */
    record Listing(String projectId, String title, String category, String target,
                   String institution, String viewCount, String applyPeriodText,
                   String applyStart, String applyEnd) {}

    /** 상세 페이지에서 뽑은 본문·첨부. fileIds는 다운로드 URL 조립에 실패했을 때의 보존용. */
    record Detail(String summaryHtml, List<String> attachmentUrls, List<String> attachmentNames,
                  List<String> attachmentFileIds) {}

    static List<Listing> parseList(String html) {
        Document doc = Jsoup.parse(html);
        List<Listing> out = new ArrayList<>();
        for (Element li : doc.select("ul.dtl_lst > li")) {
            Element a = li.selectFirst("a[onclick*=fn_project_detail]");
            if (a == null) continue;
            Matcher m = PROJECT_ID.matcher(a.attr("onclick"));
            if (!m.find()) continue;

            Element tit = a.selectFirst("span.tit");
            if (tit == null) continue;
            Element kind = tit.selectFirst("span.kind");
            String category = kind == null ? null
                    : blankToNull(firstNonBlank(kind.attr("data-category-type"), kind.text()));

            // 제목은 span.kind(카테고리 배지)를 떼고 남은 텍스트 — 안 떼면 "창업교육[대구지식재산센터]…"가 된다.
            Element titleOnly = tit.clone();
            titleOnly.select("span.kind").remove();
            String title = titleOnly.text().trim();
            if (title.isEmpty()) continue;   // 제목은 NOT NULL

            String period = spanText(a, "span.n2");   // "2026-09-16 09: 00 ~ 2026-10-20 09: 00"
            out.add(new Listing(
                    m.group(1), title, category,
                    spanText(a, "span.n3"),           // 접수대상
                    spanText(a, "span.n1"),           // 기관명 — raw 전용
                    spanText(a, "span.n4"),           // 조회수
                    blankToNull(period),
                    parseDate(period, 0), parseDate(period, 1)));
        }
        return out;
    }

    /** 페이저의 "마지막" 링크(a.page_nextend)에서 총 페이지 수를 읽는다. 없으면 -1(미상). */
    static int parseLastPage(String html) {
        Element last = Jsoup.parse(html).selectFirst("div.normal_pagination a.page_nextend[href]");
        if (last == null) return -1;
        Matcher m = PAGE_INDEX.matcher(last.attr("href"));
        return m.find() ? Integer.parseInt(m.group(1)) : -1;
    }

    /**
     * 상세 페이지 본문·첨부 추출.
     * 본문은 &lt;pre&gt; 블록들(간단소개·신청방법·지원내용 및 대상·문의처 등 — 공고마다 구성이 다르다)을
     * 문서 순서대로 모은다. "n번째 pre" 나 한글 제목 매칭은 공고별 구성 차이에 바로 깨지므로 쓰지 않는다.
     * 태그를 남긴 HTML 그대로 저장한다 — 컬럼명이 summary_html이고, ai-engine의 두 소비자
     * (indexing.rebuild_indexes / hybrid_search)가 모두 strip_html()을 거치므로 기업마당의
     * bsnsSumryCn과 같은 취급을 받는다.
     */
    static Detail parseDetail(String html, String baseUrl) {
        Document doc = Jsoup.parse(html);

        Set<String> blocks = new LinkedHashSet<>();   // 동일 블록 중복 제거(문의처가 본문 말미와 겹치는 경우 등)
        for (Element pre : doc.select("pre")) {
            String block = pre.html().trim();
            if (!block.isEmpty()) blocks.add(block);
        }
        String summary = blocks.isEmpty() ? null : String.join("<br/><br/>", blocks);

        List<String> urls = new ArrayList<>();
        List<String> names = new ArrayList<>();
        List<String> fileIds = new ArrayList<>();
        for (Element a : doc.select("a[href*=fn_egov_downFile]")) {
            Matcher m = DOWN_FILE.matcher(a.attr("href"));
            if (!m.find()) continue;
            String fileId = m.group(1);
            String fileSn = m.group(2);
            fileIds.add(fileId + ":" + fileSn);
            names.add(blankToNull(a.attr("title")));

            // 다운로드는 같은 페이지의 hidden input에 들어있는 encodeFileId(이미 percent-encoded)가
            // 있어야 열린다. 값이 없으면 URL을 추측하지 않고 fileId만 raw에 남긴다.
            Element hidden = doc.getElementById("encodeFileId" + fileId);
            String encoded = hidden == null ? null : hidden.attr("value");
            if (encoded == null || encoded.isBlank()) continue;
            // JS가 붙이는 ;jsessionid=... 경로 파라미터는 세션 전용이라 뺀다(없어도 받아진다).
            urls.add(baseUrl + DOWNLOAD_PATH + "?atchFileId=" + fileId
                    + "&fileSn=" + fileSn + "&encodeFileId=" + encoded);
        }
        return new Detail(summary, urls, names, fileIds);
    }

    /**
     * 접수일자 텍스트에서 idx(0=시작, 1=마감) 날짜를 ISO 문자열로 반환.
     * 원문은 "2026-09-16 09: 00 ~ 2026-10-20 09: 00"처럼 시각이 붙고 줄바꿈으로 쪼개져 있어
     * 공백 정규화 후 ISO 날짜 부분만 뽑는다. "상시모집" 같은 자유텍스트나 빈 값이면 null —
     * BizinfoCollector.parseDate와 같은 방어다(그대로 ::date 캐스트에 넘기면 적재 전체가 실패한다).
     */
    static String parseDate(String periodText, int idx) {
        if (periodText == null) return null;
        String[] parts = periodText.split("~");
        if (parts.length <= idx) return null;
        Matcher m = ISO_DATE.matcher(parts[idx]);
        if (!m.find()) return null;
        try {
            LocalDate.parse(m.group(1));
            return m.group(1);
        } catch (DateTimeParseException e) {
            return null;   // 2026-13-45 같은 형식만 맞는 값
        }
    }

    // ── URL 조립 ──────────────────────────────────────────────────────────

    String listUrl(int page) {
        return baseUrl + "/index.do?menu_id=" + menuId + "&menu_link=" + LIST_PATH + "&pageIndex=" + page;
    }

    /** 원본 사이트는 menu_link 값 안에 ?project_id=가 한 번 더 들어가는 중첩 쿼리 형태를 쓴다.
     *  이 형태 그대로 보내야 200이 오므로 인코딩하지 않는다(fetch()가 URI로 그대로 전달). */
    String detailUrl(String projectId) {
        return baseUrl + "/index.do?menu_id=" + menuId + "&menu_link=" + DETAIL_PATH
                + "?project_id=" + projectId;
    }

    // ── DB 헬퍼 ───────────────────────────────────────────────────────────

    /** 이미 적재된 pblanc_id 집합. 신규 건만 상세를 받기 위한 델타 판정용. */
    private Set<String> findExisting(List<String> pblancIds) {
        Set<String> found = new LinkedHashSet<>();
        for (int i = 0; i < pblancIds.size(); i += ID_CHUNK) {
            List<String> chunk = pblancIds.subList(i, Math.min(i + ID_CHUNK, pblancIds.size()));
            String sql = "SELECT pblanc_id FROM policy_announcement WHERE pblanc_id IN (%s)"
                    .formatted(placeholders(chunk.size()));
            found.addAll(jdbc.queryForList(sql, String.class, chunk.toArray()));
        }
        return found;
    }

    /** 기존 건은 상세를 다시 받지 않으므로, "아직 피드에 살아있다"는 사실만 별도로 갱신한다.
     *  last_seen_at 외의 컬럼은 건드리지 않아 재임베딩 스킵 전제를 유지한다. */
    private void touchLastSeen(Set<String> pblancIds) {
        if (pblancIds.isEmpty()) return;
        List<String> ids = List.copyOf(pblancIds);
        for (int i = 0; i < ids.size(); i += ID_CHUNK) {
            List<String> chunk = ids.subList(i, Math.min(i + ID_CHUNK, ids.size()));
            try {
                jdbc.update("UPDATE policy_announcement SET last_seen_at = now() WHERE pblanc_id IN (%s)"
                        .formatted(placeholders(chunk.size())), chunk.toArray());
            } catch (Exception e) {
                // 갱신 실패는 신규 적재를 막을 이유가 아니다 — 경고만 남기고 진행.
                log.warn("[daegu] last_seen_at 갱신 실패({}건): {}", chunk.size(), e.toString());
            }
        }
    }

    private static String placeholders(int n) {
        return String.join(",", java.util.Collections.nCopies(n, "?"));
    }

    // ── 공용 유틸 ─────────────────────────────────────────────────────────

    /** package-private — 테스트가 네트워크 없이 상세 조회 실패를 재현하려고 오버라이드한다. */
    String fetch(String url) {
        // uri(String)는 DefaultUriBuilderFactory를 타면서 중첩 쿼리의 '?'를 재인코딩할 수 있다.
        // URI.create로 넘기면 조립한 문자열이 그대로 나간다(curl로 확인한 형태와 동일).
        return client.get().uri(URI.create(url))
                .retrieve().bodyToMono(String.class).timeout(TIMEOUT).block();
    }

    /** 페이저를 못 읽어도 수집을 멈추지 않는다 — -1이면 빈 목록을 만날 때까지(또는 maxPages까지) 순회한다. */
    private static int parseLastPageSafely(String html, int currentPage) {
        try {
            return parseLastPage(html);
        } catch (Exception e) {
            log.debug("[daegu] 페이저 파싱 실패(page={}) — 빈 목록까지 순회한다", currentPage);
            return -1;
        }
    }

    /** 요청 간 딜레이. 인터럽트되면 플래그를 복원하고 false를 반환해 호출부가 순회를 끊게 한다. */
    private boolean pause() {
        if (requestDelayMs <= 0) return true;
        try {
            Thread.sleep(requestDelayMs);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("[daegu] 수집 중 인터럽트 — 순회 중단");
            return false;
        }
    }

    private static String spanText(Element scope, String selector) {
        Element el = scope.selectFirst(selector);
        if (el == null) return null;
        Element copy = el.clone();
        copy.select("em").remove();    // <em class="hidden">기관명</em> 같은 라벨 제거
        return blankToNull(copy.text().trim());
    }

    private static String firstNonBlank(String a, String b) {
        return (a != null && !a.isBlank()) ? a : b;
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private String toJson(Listing l, Detail d) {
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("project_id", l.projectId());
        raw.put("title", l.title());
        raw.put("category", l.category());
        raw.put("target", l.target());
        raw.put("institution", l.institution());   // ⚠ region이 아니라 여기에만 — 부분매치 오염 방지
        raw.put("view_count", l.viewCount());
        raw.put("apply_period_text", l.applyPeriodText());
        raw.put("attachment_file_ids", d.attachmentFileIds());
        raw.put("attachment_names", d.attachmentNames());
        raw.put("source", SOURCE);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(raw);
        } catch (Exception e) {
            return "{}";
        }
    }
}
