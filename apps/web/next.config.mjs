/** @type {import('next').NextConfig} */

// 브라우저가 치는 /api/* 를 Next 서버가 api-core 로 대신 전달한다.
//
// 이 구조를 쓰는 이유:
//   ① 공개 주소에 포트를 노출하지 않아도 된다 — http://opros.kro.kr 하나로 화면과 API 가 모두 열린다
//   ② 브라우저 입장에서 API 가 같은 오리진이라 CORS 자체가 발생하지 않는다
//      (api-core 의 allowedOrigins 설정이 어긋나 화면은 뜨는데 API 만 막히는 사고를 구조적으로 없앤다)
//   ③ 외부에 열어야 할 포트가 80 하나로 줄어든다
//
// ⚠️ 이 값은 "빌드 시점"에 필요하다. next build 가 아래 rewrites() 를 실행해 결과를
// .next/routes-manifest.json 으로 구워버리고, next start 는 그 매니페스트만 읽는다.
// 따라서 compose 의 environment 로 런타임에 넣어봐야 rewrites 는 [] 인 채로 남는다
// (실제로 이 함정에 빠져 로그인 API 가 전부 404 로 떨어진 적이 있다).
// 반드시 Dockerfile 의 ARG API_PROXY_TARGET 으로 넘길 것.
//
// 미설정이면 rewrite 없이 빌드되고, 브라우저는 NEXT_PUBLIC_API_BASE_URL 로 직접 호출한다
// (그때는 api-core 의 CORS 허용 오리진이 정확해야 한다).
//
// 값 예시:
//   서버   API_PROXY_TARGET=http://api-core:8080     (compose 내부 DNS)
//   로컬   API_PROXY_TARGET=http://localhost:8080    (SSH 터널 등)
const apiProxyTarget = process.env.API_PROXY_TARGET;

export default {
  // 리포트 생성은 matching → analysis → report LLM 호출을 동기 수행해 30초를 넘을 수 있다.
  // Next 14 rewrite 프록시의 기본 제한(30초)이 먼저 연결을 끊으면 백엔드는 정상 저장해도
  // 브라우저에는 fetch 실패로 보인다. api-core의 AI 호출 상한(호출당 240초)보다 여유 있게 둔다.
  experimental: {
    proxyTimeout: 300_000,
  },
  ...(apiProxyTarget
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${apiProxyTarget}/api/:path*` }];
        },
      }
    : {}),
};
