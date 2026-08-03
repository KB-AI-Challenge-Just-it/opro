FROM node:20-slim
WORKDIR /srv

# Next.js는 NEXT_PUBLIC_* 를 `npm run build` 시점에 번들에 인라인한다 —
# 브라우저가 호출할 주소이므로 compose의 런타임 environment로는 절대 바꿀 수 없다.
# 배포 대상이 바뀌면 이미지를 다시 빌드·푸시해야 한다(deploy.sh가 강제).
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

COPY package.json .
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
