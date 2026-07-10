-- 데모 페르소나(카페) 초기 임계값 — 추후 통계 기반으로 고도화
INSERT INTO threshold_rule (industry, metric_key, operator, threshold, window_days) VALUES
 ('카페/디저트', 'new_competitors_500m', 'GTE', 3, 30),
 ('카페/디저트', 'foot_traffic_delta_pct', 'LTE', -15, 30),
 ('카페/디저트', 'base_rate_change_bp', 'ABS_GTE', 25, 90);
