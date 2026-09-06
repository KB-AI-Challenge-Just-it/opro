#!/usr/bin/env bash
#
# deploy.sh — opro 3개 서비스 이미지를 빌드해 GHCR로 푸시한다.
#
# 이 스크립트는 "이미지를 만들어 올리는" 데까지만 한다. 서버에서 실제로 띄우는 건
# opro_infra 저장소의 docker-compose.yml이 담당한다(여기서 올린 이미지를 pull).
#
# 사용법:
#   PUBLIC_API_BASE_URL=http://your-domain.com:8080 ./deploy.sh
#   PUBLIC_API_BASE_URL=... ./deploy.sh web          # 특정 서비스만
#
# 주요 환경변수:
#   PUBLIC_API_BASE_URL  (필수) 브라우저가 호출할 api-core 공개 주소.
#                        Next.js가 빌드 시점에 번들에 박아넣기 때문에 반드시 여기서 줘야 하고,
#                        나중에 opro_infra의 compose를 고쳐도 바뀌지 않는다.
#   TARGET_PLATFORM      (기본 linux/amd64) 배포 서버 아키텍처. arm64 서버면 linux/arm64.
#   GHCR_OWNER           (기본 kb-ai-challenge-just-it) GHCR 네임스페이스. 반드시 소문자.
#   IMAGE_PREFIX         (기본 opro) 이미지 이름 접두사 → opro-web, opro-api-core, ...
#
set -euo pipefail
cd "$(dirname "$0")"

TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
GHCR_OWNER="${GHCR_OWNER:-kb-ai-challenge-just-it}"
IMAGE_PREFIX="${IMAGE_PREFIX:-opro}"
REGISTRY="ghcr.io/${GHCR_OWNER}"
BUILDER_NAME="opro-xbuild"

# GHCR은 대문자 경로를 거부한다 — 조직명이 KB-AI-Challenge-Just-it 이라 실수하기 쉽다.
GHCR_OWNER="$(echo "$GHCR_OWNER" | tr '[:upper:]' '[:lower:]')"
REGISTRY="ghcr.io/${GHCR_OWNER}"

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
ylw()  { printf '\033[33m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

die() { red "✗ $*"; exit 1; }

# ── 사전 점검 ────────────────────────────────────────────────────────────────
step "사전 점검"

docker info >/dev/null 2>&1 || die "Docker가 실행 중이 아니다. Docker Desktop을 먼저 켤 것."

# NEXT_PUBLIC_API_BASE_URL은 빌드 시점에 이미지로 들어간다. 빠뜨리면 브라우저가
# localhost:8080을 호출해 데모가 통째로 죽는데, 서버에 올린 뒤에야 알게 된다 — 여기서 막는다.
if [ -z "${PUBLIC_API_BASE_URL:-}" ]; then
  die "PUBLIC_API_BASE_URL 이 필요하다 (브라우저가 호출할 api-core 공개 주소).
    예: PUBLIC_API_BASE_URL=http://your-domain.com:8080 ./deploy.sh
    이 값은 Next.js 빌드 시점에 이미지에 박히므로 나중에 compose로 못 바꾼다."
fi
case "$PUBLIC_API_BASE_URL" in
  http://localhost*|http://127.0.0.1*)
    die "PUBLIC_API_BASE_URL 이 localhost다 — 서버에 올리면 방문자의 브라우저가
    자기 자신을 호출하게 된다. 서버의 공개 도메인/IP를 줄 것." ;;
esac

# GHCR 인증 확인. 없으면 어차피 push 단계에서 한참 뒤에 실패한다 — 미리 잡는다.
if ! grep -q "ghcr.io" "${HOME}/.docker/config.json" 2>/dev/null; then
  ylw "⚠ ghcr.io 로그인 기록이 안 보인다. 아직 안 했다면:"
  echo "    echo \$GITHUB_PAT | docker login ghcr.io -u <github-id> --password-stdin"
  echo "    (PAT 권한: write:packages)"
fi

# 이미지 태그: latest + 불변 커밋 SHA. 롤백은 opro_infra에서 IMAGE_TAG만 바꾸면 된다.
GIT_SHA="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain -- apps db 2>/dev/null)" ]; then
  ylw "⚠ apps/ 또는 db/ 에 커밋되지 않은 변경이 있다 — :${GIT_SHA} 태그가 실제 소스와 다를 수 있다."
fi

# 크로스 빌드용 빌더. Mac(arm64) → 서버(amd64)는 기본 빌더로는 안 되고
# docker-container 드라이버 + QEMU 에뮬레이션이 필요하다.
HOST_ARCH="$(uname -m)"
step "빌드 설정"
echo "  호스트      : ${HOST_ARCH}"
echo "  대상 플랫폼 : ${TARGET_PLATFORM}"
echo "  레지스트리  : ${REGISTRY}"
echo "  태그        : latest, ${GIT_SHA}"
echo "  API 공개주소: ${PUBLIC_API_BASE_URL}"

if [ "$HOST_ARCH" = "arm64" ] && [ "$TARGET_PLATFORM" = "linux/amd64" ]; then
  ylw "  ⚠ arm64 → amd64 크로스 빌드다. QEMU 에뮬레이션이라 Gradle·Next 빌드가"
  ylw "    네이티브 대비 10~30배 느릴 수 있다(전체 20~40분). 커피 한 잔 하고 올 것."
  ylw "    ▸ 더 빠른 방법: GitHub → Actions → \"build & push to GHCR\" → Run workflow"
  ylw "      (amd64 러너에서 네이티브 빌드 + 레지스트리 간 전송 — 보통 수 분)"
fi

if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
  step "buildx 빌더 생성 (${BUILDER_NAME})"
  docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
fi
docker buildx use "$BUILDER_NAME"

# ── 빌드 & 푸시 ──────────────────────────────────────────────────────────────
# --push 로 곧바로 레지스트리에 올린다. 다른 아키텍처 이미지는 로컬 데몬에 --load 할 수
# 없으므로 build 후 docker push 하는 2단계 방식은 애초에 불가능하다.
build_push() {
  local name="$1" context="$2"; shift 2
  local image="${REGISTRY}/${IMAGE_PREFIX}-${name}"
  local cache=()
  # ai-engine 은 캐시를 내보내지 않는다 — torch(2GB)+bge-m3(2.3GB) 레이어까지 전부 업로드해서
  # 캐시로 아끼는 시간보다 올리는 데 드는 시간이 더 크다. 대신 받아 쓰기만 한다.
  if [ "$name" != "ai-engine" ]; then
    cache=(--cache-to "type=registry,ref=${image}:buildcache,mode=max")
  fi
  step "빌드·푸시: ${IMAGE_PREFIX}-${name}"
  docker buildx build \
    --platform "$TARGET_PLATFORM" \
    --tag "${image}:latest" \
    --tag "${image}:${GIT_SHA}" \
    --cache-from "type=registry,ref=${image}:buildcache" \
    "${cache[@]}" \
    "$@" \
    --push "$context"
  grn "  ✓ ${image}:${GIT_SHA}"
}

TARGET="${1:-all}"

case "$TARGET" in
  all)
    # ai-engine이 가장 오래 걸린다(torch + bge-m3 굽기) — 먼저 시작해 체감 시간을 줄인다.
    build_push ai-engine ./apps/ai-engine
    build_push api-core  ./apps/api-core
    build_push web       ./apps/web \
      --build-arg "NEXT_PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL}" \
      --build-arg "API_PROXY_TARGET=http://api-core:8080"
    ;;
  ai|ai-engine) build_push ai-engine ./apps/ai-engine ;;
  api|api-core) build_push api-core  ./apps/api-core ;;
  web)          build_push web       ./apps/web \
                  --build-arg "NEXT_PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL}" \
                  --build-arg "API_PROXY_TARGET=http://api-core:8080" ;;
  *) die "알 수 없는 대상: $TARGET  (사용법: ./deploy.sh [all|ai|api|web])" ;;
esac

# ── 마무리 안내 ──────────────────────────────────────────────────────────────
step "완료"
grn "이미지 태그: ${GIT_SHA}"
cat <<EOF

서버(opro_infra)에서:

    cd opro_infra
    echo "IMAGE_TAG=${GIT_SHA}" >> .env    # 버전 고정 (생략 시 latest)
    docker compose pull
    docker compose up -d
    ./collect.sh                        # 최초 배포라면 필수 — 정책공고 적재

처음 푸시했다면 GHCR 패키지가 private 이라 서버에서 pull이 403으로 실패한다.
아래 중 하나를 먼저 할 것:
  a) GitHub → 조직 Packages → 각 패키지 → Package settings → Change visibility → Public
  b) 서버에서: echo \$PAT | docker login ghcr.io -u <github-id> --password-stdin   (read:packages)
EOF
