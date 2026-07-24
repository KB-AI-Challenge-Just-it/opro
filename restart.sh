#!/usr/bin/env bash
#
# restart.sh — opro 스택 재빌드·재기동 헬퍼
#
# 이 프로젝트는 compose 파일이 2개다:
#   docker-compose.yml       → postgres·chroma·ai-engine·api-core (백엔드)
#   docker-compose.web.yml   → web (프론트, depends_on 체인 분리를 위해 별도)
#
# 사용법:
#   ./restart.sh              # 전체(ai-engine·api-core·web) 재빌드 후 기동 (기본)
#   ./restart.sh all          # 위와 동일
#   ./restart.sh backend      # ai-engine·api-core 만 재빌드
#   ./restart.sh ai           # ai-engine 만 재빌드
#   ./restart.sh api          # api-core 만 재빌드
#   ./restart.sh web          # web 만 재빌드
#   ./restart.sh quick        # 재빌드 없이 restart 만 (코드 변경 없을 때, 빠름)
#
set -euo pipefail

# 스크립트 위치를 프로젝트 루트로 삼는다 (어디서 실행해도 동작).
cd "$(dirname "$0")"

WEB_COMPOSE="docker-compose.web.yml"
TARGET="${1:-all}"

build_backend() {  # 인자로 받은 서비스들을 재빌드·기동
  echo "▶ 백엔드 재빌드·기동: $*"
  docker compose up -d --build "$@"
}

build_web() {
  echo "▶ web 재빌드·기동"
  docker compose -f "$WEB_COMPOSE" up -d --build web
}

# api-core 가 실제 요청을 받을 때까지 대기 (ai-engine healthy 후에야 뜬다).
# readiness 프로브는 싼 GET(/api/agent/collect/status, DB 카운트만)을 쓴다 —
# 진단 엔드포인트로 확인하면 폴링마다 Claude(Opus)를 호출해 토큰을 낭비한다.
# curl 은 연결 실패 시 %{http_code} 로 "000" 을 출력하므로 200 인지로만 판정한다.
wait_for_api() {
  echo -n "▶ api-core 준비 대기"
  for _ in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      http://localhost:8080/api/agent/collect/status 2>/dev/null || true)
    if [ "$code" = "200" ]; then echo " ✓ (HTTP 200)"; return 0; fi
    echo -n "."; sleep 3
  done
  echo " ✗ 타임아웃 — 'docker compose logs api-core' 확인"; return 1
}

case "$TARGET" in
  all)
    build_backend ai-engine api-core
    build_web
    wait_for_api || true
    ;;
  backend)
    build_backend ai-engine api-core
    wait_for_api || true
    ;;
  ai)
    build_backend ai-engine
    ;;
  api)
    build_backend api-core
    wait_for_api || true
    ;;
  web)
    build_web
    ;;
  quick)
    echo "▶ 재빌드 없이 재시작 (코드 변경 없을 때)"
    docker compose restart ai-engine api-core
    docker compose -f "$WEB_COMPOSE" restart web
    wait_for_api || true
    ;;
  *)
    echo "알 수 없는 대상: $TARGET"
    echo "사용법: ./restart.sh [all|backend|ai|api|web|quick]"
    exit 1
    ;;
esac

echo ""
echo "▶ 현재 상태:"
docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo ""
echo "  web:  http://localhost:3000/onboarding"
echo "  api:  http://localhost:8080"
