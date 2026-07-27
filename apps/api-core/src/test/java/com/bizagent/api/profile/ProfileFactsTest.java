package com.bizagent.api.profile;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ProfileFacts.compose — 프로필을 라벨링된 확정 사실로 조립. 핵심은 revenue_basis를 반영해
 * 매출을 연/월로 정확히 라벨링하는 것(monthly_revenue_band 컬럼명 함정으로 '월'로 오표기되던
 * 사고 방지). 순수 정적 함수이므로 DB·Spring 컨텍스트 없이 검증한다.
 */
class ProfileFactsTest {

    private static Map<String, Object> base() {
        Map<String, Object> p = new HashMap<>();
        p.put("industry", "카페/디저트");
        p.put("region_sido", "서울");
        p.put("region_sigungu", "강남구");
        p.put("operating_period", "1~3년");
        p.put("employee_band", "1~4명");
        p.put("monthly_revenue_band", "1억~3억");
        p.put("revenue_basis", "ANNUAL");
        p.put("funding_purpose", List.of("운영"));
        p.put("funding_amount_band", "1천만~5천만");
        p.put("tax_delinquency", "없음");
        p.put("overdue_status", "없음");
        p.put("funding_experience", "없음");
        return p;
    }

    @Test
    void annualRevenueLabeledAsYearly() {
        String out = ProfileFacts.compose(base());
        assertThat(out).contains("연매출: 1억~3억");
        assertThat(out).doesNotContain("월");
    }

    @Test
    void monthlyRevenueLabeledAsMonthlyAverage() {
        Map<String, Object> p = base();
        p.put("revenue_basis", "MONTHLY");
        p.put("monthly_revenue_band", "500만~1천만");
        String out = ProfileFacts.compose(p);
        assertThat(out).contains("월평균 매출: 500만~1천만");
    }

    @Test
    void unknownRevenueBasisMakesNoMonthlyOrYearlyClaim() {
        Map<String, Object> p = base();
        p.remove("revenue_basis");
        String out = ProfileFacts.compose(p);
        assertThat(out).contains("매출: 1억~3억");
        assertThat(out).doesNotContain("연매출");
        assertThat(out).doesNotContain("월평균");
    }

    @Test
    void fundingPurposeMappedToLabelAndJoined() {
        Map<String, Object> p = base();
        p.put("funding_purpose", List.of("운영", "시설"));
        String out = ProfileFacts.compose(p);
        assertThat(out).contains("자금 용도: 운영자금, 시설자금");
    }

    @Test
    void combinesRegionSidoAndSigungu() {
        assertThat(ProfileFacts.compose(base())).contains("지역: 서울 강남구");
    }

    @Test
    void includesRiskFieldsAsPositiveSignalsWhenNone() {
        String out = ProfileFacts.compose(base());
        assertThat(out).contains("세금 체납: 없음");
        assertThat(out).contains("연체 상태: 없음");
        assertThat(out).contains("정책자금 수혜 이력: 없음");
    }

    @Test
    void skipsFieldsThatAreNullOrBlank() {
        Map<String, Object> p = new HashMap<>();
        p.put("industry", "카페/디저트");
        String out = ProfileFacts.compose(p);
        assertThat(out).contains("업종: 카페/디저트");
        assertThat(out).doesNotContain("연매출");
        assertThat(out).doesNotContain("자금 용도");
        assertThat(out).doesNotContain("세금 체납");
    }

    @Test
    void handlesSqlArrayForFundingPurpose() throws Exception {
        // JdbcTemplate은 TEXT[] 컬럼을 java.sql.Array(PgArray)로 돌려준다 — 그 경로도 처리해야 한다.
        Map<String, Object> p = base();
        p.put("funding_purpose", new FakeArray(new String[] {"시설", "창업"}));
        String out = ProfileFacts.compose(p);
        assertThat(out).contains("자금 용도: 시설자금, 창업자금");
    }

    /** java.sql.Array의 getArray()만 쓰는 최소 스텁 (테스트용). */
    private static class FakeArray implements java.sql.Array {
        private final Object[] value;
        FakeArray(Object[] value) { this.value = value; }
        @Override public Object getArray() { return value; }
        @Override public String getBaseTypeName() { return "text"; }
        @Override public int getBaseType() { return java.sql.Types.VARCHAR; }
        @Override public Object getArray(Map<String, Class<?>> map) { return value; }
        @Override public Object getArray(long index, int count) { return value; }
        @Override public Object getArray(long index, int count, Map<String, Class<?>> map) { return value; }
        @Override public java.sql.ResultSet getResultSet() { return null; }
        @Override public java.sql.ResultSet getResultSet(Map<String, Class<?>> map) { return null; }
        @Override public java.sql.ResultSet getResultSet(long index, int count) { return null; }
        @Override public java.sql.ResultSet getResultSet(long index, int count, Map<String, Class<?>> map) { return null; }
        @Override public void free() { }
    }
}
