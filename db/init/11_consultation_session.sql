-- 09: 대화형 2-콜 컨설팅 세션
--  온보딩 직후 [콜1 진단] → [사장님이 진단 읽고 재질문 답변] → [콜2 전문화] 사이의
--  상태를 잇는다. 상태는 Spring이 소유한다(ai-engine은 stateless).
CREATE TABLE consultation_session (
  id BIGSERIAL PRIMARY KEY,
  profile_id BIGINT NOT NULL REFERENCES business_profile(id),
  status TEXT NOT NULL,                      -- DIAGNOSED | COMPLETED
  diagnosis_text TEXT,                       -- 콜1이 생성한 경영 진단 본문
  follow_up_questions JSONB,                 -- 콜1이 생성한 검증 재질문 배열
  follow_up_answers JSONB,                   -- 사장님 답변 (스킵 시 빈 배열)
  report_id BIGINT REFERENCES report(id),    -- 콜2 완료 후 채워짐
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_consultation_session_profile ON consultation_session (profile_id);
