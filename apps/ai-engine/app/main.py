"""ai-engine: 순수 AI 마이크로서비스.
비즈니스 로직·수집·트리거·스케줄링은 전부 Spring(api-core)이 담당하고,
여기는 Claude 호출과 RAG(BM25+벡터+RRF)만 수행한다."""
from fastapi import FastAPI
from .db import init_pool
from .routers import screening, analysis, matching, report, draft, indexing

app = FastAPI(title="biz-agent ai-engine", version="0.2.0")

@app.on_event("startup")
def startup():
    init_pool()

app.include_router(screening.router, prefix="/screen",   tags=["L2 1차 스크리닝 (Haiku)"])
app.include_router(analysis.router,  prefix="/analysis", tags=["L3 원인 분석 (Sonnet)"])
app.include_router(matching.router,  prefix="/matching", tags=["L4 하이브리드 RAG"])
app.include_router(report.router,    prefix="/report",   tags=["L5 리포트 생성 (Sonnet)"])
app.include_router(draft.router,     prefix="/draft",    tags=["확장: 신청서 초안"])
app.include_router(indexing.router,  prefix="/index",    tags=["인덱싱 (BM25·임베딩)"])

@app.get("/health")
def health():
    return {"status": "ok"}
