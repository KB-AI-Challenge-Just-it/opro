package com.bizagent.api.profile;

import java.sql.Array;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 프로필을 사람이 읽는 '확정 라벨 사실'로 조립한다 (결정론적, LLM 미사용).
 *
 * 콜1(진단)·콜2(적합성 설명·리포트) 프롬프트에 원시 프로필 필드 대신 이 팩트시트를 넘겨,
 * monthly_revenue_band 같은 오해를 부르는 컬럼명 때문에 모델이 연매출을 '월'로 잘못 쓰는
 * 사고를 없앤다(revenue_basis를 반영해 매출을 연/월로 정확히 라벨링). 콜1·콜2가 같은 팩트시트를
 * 쓰므로 두 화면의 매출 표기가 어긋나지 않는다.
 *
 * 지역·업종·임계값을 코드에 하드코딩하지 않고, 값은 전부 프로필에서 온다(라벨만 고정).
 */
public final class ProfileFacts {

    private ProfileFacts() {}

    // 온보딩 자금용도 선택지(고정 어휘) → 자연어 라벨. ProfileMatchTrigger.buildQuery와 동일.
    private static final Map<String, String> FUNDING_PURPOSE_LABEL = Map.of(
        "운영", "운영자금", "시설", "시설자금", "창업", "창업자금",
        "대환", "대환자금", "잘모름", "자금"
    );

    /** 프로필 맵(PipelineService/ConsultationService가 JdbcTemplate으로 로드한 것)을 팩트시트로. */
    public static String compose(Map<String, Object> profile) {
        List<String> lines = new ArrayList<>();

        addLine(lines, "업종", str(profile.get("industry")));

        String region = (str(profile.get("region_sido")) + " " + str(profile.get("region_sigungu"))).trim();
        addLine(lines, "지역", region);

        addLine(lines, "업력", str(profile.get("operating_period")));
        addLine(lines, "직원 수", str(profile.get("employee_band")));

        // 매출: revenue_basis로 연/월을 확정 라벨링한다. 미상이면 월/연 주장을 하지 않는다.
        String band = str(profile.get("monthly_revenue_band"));
        if (!band.isBlank()) {
            String label = switch (str(profile.get("revenue_basis"))) {
                case "ANNUAL" -> "연매출";
                case "MONTHLY" -> "월평균 매출";
                default -> "매출";
            };
            lines.add(label + ": " + band.trim());
        }

        List<String> purposes = toList(profile.get("funding_purpose"));
        if (!purposes.isEmpty()) {
            String joined = purposes.stream()
                .map(p -> FUNDING_PURPOSE_LABEL.getOrDefault(p, p))
                .distinct()
                .reduce((a, b) -> a + ", " + b)
                .orElse("");
            addLine(lines, "자금 용도", joined);
        }

        addLine(lines, "희망 자금", str(profile.get("funding_amount_band")));
        // 체납·연체·수혜이력은 '없음'도 긍정 신호(깨끗한 신용)로 그대로 싣는다 — 계획 §5-1.
        addLine(lines, "세금 체납", str(profile.get("tax_delinquency")));
        addLine(lines, "연체 상태", str(profile.get("overdue_status")));
        addLine(lines, "정책자금 수혜 이력", str(profile.get("funding_experience")));

        return String.join("\n", lines);
    }

    private static void addLine(List<String> lines, String label, String value) {
        if (value != null && !value.isBlank()) {
            lines.add(label + ": " + value.trim());
        }
    }

    private static String str(Object v) {
        return v == null ? "" : v.toString();
    }

    /** TEXT[] 컬럼(funding_purpose) → List<String>. JdbcTemplate은 이를 java.sql.Array(PgArray)로 돌려준다. */
    @SuppressWarnings("unchecked")
    private static List<String> toList(Object v) {
        if (v == null) return List.of();
        if (v instanceof List<?> list) return (List<String>) list;
        if (v instanceof Array sqlArray) {
            try {
                List<String> out = new ArrayList<>();
                for (Object o : (Object[]) sqlArray.getArray()) {
                    if (o != null) out.add(o.toString());
                }
                return out;
            } catch (SQLException e) {
                return List.of();
            }
        }
        return List.of();
    }
}
