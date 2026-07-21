-- 08: 평문 id/pw 회원가입·로그인 도입
--  배경: 지금까지 web 온보딩이 항상 userId=1(데모 계정)을 하드코딩해서 보냈다.
--  이제 app_user에 로그인용 username/password를 얹어 사용자별로 분리한다.
--  주의: password는 평문 저장이다 (사용자 명시 요청 — 해커톤/데모 범위, 해싱 없음).
ALTER TABLE app_user
  ADD COLUMN username TEXT,
  ADD COLUMN password TEXT;

ALTER TABLE app_user
  ADD CONSTRAINT uq_app_user_username UNIQUE (username);

-- 기존 데모 계정도 로그인 가능하도록 채워둔다.
UPDATE app_user SET username = 'demo', password = 'demo1234'
  WHERE id = 1 AND username IS NULL;
