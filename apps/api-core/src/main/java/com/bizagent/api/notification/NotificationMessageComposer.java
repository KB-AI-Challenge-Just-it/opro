package com.bizagent.api.notification;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 매칭 결과(List of match map)를 알림 문구(제목/본문)로 바꾸는 일만 한다 — 저장(PipelineWriter)이나
 * 발송(NotificationSender/KakaoMemoSender)과 책임을 분리해, "무슨 문구를 보여줄지"가 바뀔 때
 * 이 클래스만 건드리면 되게 한다.
 * matches는 이미 rrf_score DESC로 정렬돼 들어온다(hybrid_match) — 1등 공고를 대표로 보여준다.
 *
 * 공고 원문 요약(summary)은 넣지 않는다 — 정책자금 공고명 자체가 이미 40~80자로 길어서
 * 요약까지 붙이면 어중간하게 잘려("위기…") 문장이 끊긴 인상을 준다. 대신 잘리면 안 되는
 * 핵심 정보(마감일)만 남기고, 전체는 딥링크(리포트 확인 버튼)로 보게 한다.
 */
@Component
public class NotificationMessageComposer {

    // 정책자금 공고 원문 제목이 40~80자로 길어 잘라야 한다 — 앞부분만 보여줘도 어떤 공고인지는 식별된다.
    private static final int TITLE_MAX_LEN = 30;
    // 카카오 "나에게 보내기" 미리보기에서 100자 넘으면 문장 중간이 잘려 보인다는 실사용 확인(이슈) —
    // 제목+본문을 합친 최종 문자열 기준으로 이 값을 넘지 않게 한다(필드별로 따로 자르면 조합에
    // 따라 다시 넘칠 수 있어서, 합친 결과 기준으로 한 번 더 강제한다).
    private static final int COMBINED_MAX_LEN = 80;

    public record Message(String title, String body) {
        /** 카카오 "나에게 보내기"는 본문이 따로 없어 제목+본문을 한 줄 텍스트로 합쳐 보낸다. */
        public String combined() {
            return body == null || body.isBlank() ? title : title + "\n" + body;
        }
    }

    public Message compose(List<Map<String, Object>> matches) {
        if (matches == null || matches.isEmpty()) {
            return new Message("새 리포트가 도착했어요", "맞춤 정책자금 매칭 결과를 확인하세요.");
        }
        Map<String, Object> top = matches.get(0);
        String name = truncate(str(top.get("title")), TITLE_MAX_LEN);
        String title = matches.size() > 1
                ? "%s 외 %d건의 정책자금이 매칭됐어요".formatted(name, matches.size() - 1)
                : "%s 매칭 결과가 도착했어요".formatted(name);

        // 마감일이 없으면(상시모집 등) 본문은 비운다 — 제목에서 이미 뭐가 왔는지 다 보여줬는데,
        // 여기에 의미 없는 안내 문장을 더 붙이면 필러로만 보인다.
        String deadline = str(top.get("apply_end"));
        String body = deadline.isBlank() ? "" : "마감 " + deadline;

        // 우선순위는 제목 > 마감일 — 제목은 이미 위에서 잘랐으니, 합친 길이가 여전히 넘치면
        // 본문(마감일 안내문)부터 줄인다. 남는 공간이 없으면 본문은 비운다(제목만으로도 충분히
        // 식별 가능하므로 최후에는 제목만 보내는 쪽을 택한다).
        int remaining = COMBINED_MAX_LEN - title.length() - 1;
        if (body.length() > remaining) {
            body = remaining > 0 ? truncate(body, remaining) : "";
        }
        return new Message(title, body);
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String truncate(String text, int maxLen) {
        if (text.length() <= maxLen) return text;
        return text.substring(0, maxLen).trim() + "…";
    }
}
