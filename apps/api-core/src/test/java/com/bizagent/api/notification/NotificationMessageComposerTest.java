package com.bizagent.api.notification;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 알림 문구 조립 — 정책자금명·마감일이 실제로 들어가는지, 원문 제목이 길면 잘리는지,
 * 제목+본문 합산 길이가 하드캡을 넘지 않는지, 매칭이 없거나 필드가 비어있어도 안전한
 * 문구로 폴백하는지 검증한다. 요약(summary)은 의도적으로 넣지 않는다(어중간하게 잘려
 * 문장이 끊기는 문제 때문).
 */
class NotificationMessageComposerTest {

    private final NotificationMessageComposer composer = new NotificationMessageComposer();

    private static Map<String, Object> match(String title, String applyEnd) {
        Map<String, Object> m = new HashMap<>();
        m.put("title", title);
        m.put("apply_end", applyEnd);
        return m;
    }

    @Test
    void composesTitleAndBody_fromTopMatch() {
        NotificationMessageComposer.Message msg = composer.compose(
                List.of(match("청년창업지원사업", "2026-08-31")));

        assertThat(msg.title()).contains("청년창업지원사업").contains("매칭 결과가 도착했어요");
        assertThat(msg.body()).isEqualTo("마감 2026-08-31");
    }

    @Test
    void titleMentionsExtraCount_whenMultipleMatches() {
        NotificationMessageComposer.Message msg = composer.compose(List.of(
                match("청년창업지원사업", "2026-08-31"),
                match("소상공인 융자", "2026-09-30")));

        assertThat(msg.title()).contains("청년창업지원사업").contains("외 1건");
    }

    @Test
    void truncatesLongAnnouncementTitle() {
        // 실제 정책자금 공고명은 40~80자로 흔히 길다.
        String longTitle = "[서울] 2026년 하반기 위기 소상공인 조기발굴 및 선제지원(Track2) 사업 모집 공고";

        NotificationMessageComposer.Message msg = composer.compose(
                List.of(match(longTitle, "2026-08-31")));

        assertThat(msg.title()).doesNotContain("모집 공고"); // 뒷부분은 잘려나감
        assertThat(msg.title()).contains("…").contains("매칭 결과가 도착했어요");
    }

    @Test
    void combinedMessage_neverExceedsHardCap() {
        String longTitle = "[서울] 2026년 하반기 위기 소상공인 조기발굴 및 선제지원(Track2) 사업 모집 공고 최종본";

        NotificationMessageComposer.Message msg = composer.compose(List.of(
                match(longTitle, "2026-08-31"),
                match("다른 공고", "2026-09-30"),
                match("또 다른 공고", "2026-10-31")));

        assertThat(msg.combined().replace("\n", " ").length()).isLessThanOrEqualTo(80);
    }

    @Test
    void fallsBackToGenericMessage_whenNoMatches() {
        NotificationMessageComposer.Message msg = composer.compose(List.of());

        assertThat(msg.title()).isEqualTo("새 리포트가 도착했어요");
        assertThat(msg.body()).isEqualTo("맞춤 정책자금 매칭 결과를 확인하세요.");
    }

    @Test
    void bodyIsEmpty_whenDeadlineMissing() {
        // 마감일이 없으면(상시모집 등) 제목만 보낸다 — 의미 없는 필러 문장을 붙이지 않는다.
        NotificationMessageComposer.Message msg = composer.compose(
                List.of(match("공고", null)));

        assertThat(msg.body()).isEmpty();
        assertThat(msg.combined()).isEqualTo(msg.title());
    }

    @Test
    void combinedJoinsTitleAndBodyWithNewline() {
        NotificationMessageComposer.Message msg = new NotificationMessageComposer.Message("제목", "본문");

        assertThat(msg.combined()).isEqualTo("제목\n본문");
    }
}
