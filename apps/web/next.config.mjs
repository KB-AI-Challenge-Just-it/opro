/** @type {import('next').NextConfig} */

// 로컬에서 디자인을 확인할 때만 쓰는 API 프록시.
// 배포된 api-core 는 CORS 허용 오리진이 WEB_BASE_URL(http://opros.kro.kr) 하나로 고정돼 있어서
// localhost 에서 띄운 화면이 직접 호출하면 브라우저가 막는다. 이 rewrite 를 켜면 브라우저는
// 같은 오리진(/api/...)으로만 요청하고 Next 가 서버 사이드에서 대신 전달하므로 CORS 자체가 없다.
//
// DEV_API_PROXY 가 설정된 경우에만 활성화된다 — 프로덕션 빌드에는 영향이 없다.
const devApiProxy = process.env.DEV_API_PROXY;

export default {
  ...(devApiProxy
    ? {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${devApiProxy}/api/:path*` }];
        },
      }
    : {}),
};
