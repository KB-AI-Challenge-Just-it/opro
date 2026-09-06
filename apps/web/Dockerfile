FROM node:20-slim
WORKDIR /srv

# Next.js는 NEXT_PUBLIC_* 를 `npm run build` 시점에 번들에 인라인한다 —
# 브라우저가 호출할 주소이므로 compose의 런타임 environment로는 절대 바꿀 수 없다.
# 배포 대상이 바뀌면 이미지를 다시 빌드·푸시해야 한다(deploy.sh가 강제).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

# rewrite 도 빌드 시점 값이다 — next build 가 next.config.mjs 의 rewrites() 를 실행해
# .next/routes-manifest.json 으로 구워버리고, next start 는 그 매니페스트만 읽는다.
# 그래서 compose 의 environment 로 런타임에 넣어도 rewrites 는 [] 인 채로 남는다.
# 값을 바꾸려면 이 build-arg 를 바꿔 이미지를 다시 빌드해야 한다.
ARG API_PROXY_TARGET=""
ENV API_PROXY_TARGET=${API_PROXY_TARGET}

COPY package.json .
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
