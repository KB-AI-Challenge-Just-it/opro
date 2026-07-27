---
name: rag-conventions
description: "ai-engine의 RAG·인덱싱·임베딩·검색 융합·프롬프트 구현과 튜닝 시 반드시 먼저 읽을 컨벤션. 하이브리드 검색, BM25, 벡터 임베딩, Chroma, 매칭 품질, RRF, 청킹, AFHackathon 노트북 참고 요청 시 이 스킬을 사용할 것. 과거 해커톤 노트북에서 검증·기각된 패턴 판정 포함."
---

# RAG Conventions — ai-engine 검색·매칭 컨벤션

과거 해커톤 노트북(`AFHackathon.ipynb`)과 아키텍처 어드바이저 검토에서 확정된 채택/기각 판정. 노트북은 llama_index + FAISS + 자체호스팅 vLLM 스택이라 현 스택(Anthropic + Chroma + kiwi/rank_bm25)에 통짜 이식이 불가하다 — **패턴만 취하고 코드는 가져오지 않는다** (셀 일부에 문법 오류·로직 버그 존재).

## 채택 — 구현할 것

### 1. Chroma 컬렉션에 임베딩 함수 명시 — ✅ 구현됨 (`BAAI/bge-m3`)

`vectorstore.py`의 `get_or_create_collection()`이 `embedding_function` 미지정이면 Chroma 기본값(all-MiniLM-L6-v2, **영어 학습 모델**)으로 한국어 공고를 임베딩해 하이브리드의 벡터 축이 열화된다. `get_collection()`에 `SentenceTransformerEmbeddingFunction(model_name=settings.embedding_model)`을 지정해 해결 (모델은 `config.py`의 `embedding_model` 필드, 기본값 `BAAI/bge-m3` — 1024-dim, 노트북 셀 5의 1024-dim 임베딩 엔드포인트와 규모가 맞고 e5 계열과 달리 query/passage prefix가 불필요해 Chroma의 단일 `embedding_function` 인터페이스와 궁합이 좋다).

- **컬렉션 재생성 필수**: 임베딩 함수를 바꾸면 벡터 차원이 달라진다. 기존 `policy_announcements` 컬렉션(옛 384-dim)에 그대로 `get_or_create_collection`을 호출하면 안 됨 — Chroma 컬렉션을 삭제(또는 `chroma-data` 볼륨 초기화) 후 `/index/rebuild`로 새로 채워야 한다
- `HttpClient` 사용 중이므로 임베딩 계산은 Chroma 서버가 아니라 ai-engine 프로세스(클라이언트) 쪽에서 일어난다 — `sentence-transformers`(+torch) 의존성이 ai-engine 이미지에 들어간다
- 노트북 셀 5의 전용 1024-dim 임베딩 엔드포인트가 이 교훈의 출처다 — 자체호스팅을 따라하라는 게 아니라 "임베딩 모델을 의식적으로 선택하라"가 요지

### 2. RAG 하이퍼파라미터를 `config.py`의 pydantic `Settings`로 집중

노트북 HYPERPARAM dict의 취지(튜너블 중앙화)만 흡수하되, bare dict가 아니라 기존 `Settings`에 필드로 흡수한다 (타입 검증 + env 오버라이드 + 코드베이스 단일 config 패턴 유지). 대상: `RRF_K`(현재 `hybrid_search.py` 모듈 상수 60), `top_k`, BM25 후보 폭, 축별 가중치.

### 3. 선택적 가중 RRF

노트북의 vector 0.6 / BM25 0.4 의도는 가중 RRF(`score = Σ wᵢ/(k + rankᵢ)`)로 반영한다. 기본은 균등(현행과 동일), 가중치는 Settings에서 조정.

### 4. PDF 표 추출 패턴 — E5(신청서 초안) 한정, P3

fitz(본문 텍스트) + camelot(표) + 병합 패턴은 노트북에서 유일하게 실질 재사용 가치가 있다. 단:
- 노트북 `CustomPDFReader`는 문법 오류·페이지 로직 버그가 있다 — **패턴만 참고해 재작성**
- camelot은 무거운 의존성(ghostscript·opencv)이고 텍스트 PDF의 룰드 테이블만 처리한다. 스캔본·**hwp 불가** — PRD §5-3이 경고했듯 hwp 양식은 별도 처리이며, 데모용 공고 1~2건 양식만 사전 확보해 적용한다
- ⭐ 3주차 E2E 마일스톤 이후에만 착수

## 기각 — 재도입 금지 (노트북을 참고하다 "개선"으로 역행하지 말 것)

| 노트북 패턴 | 판정 이유 |
| --- | --- |
| llama_index / FAISS / vLLM 스택 이식 | 현 스택과 충돌. 패턴 마이닝 대상일 뿐 |
| `tokenize_text` 어미·접미사 붙임 규칙 | 현 POS 필터(내용형태소 추출)가 더 표준·단순·우수. 노트북 규칙은 llama_index BM25가 공백 토큰화라서 필요했던 우회다 — rank_bm25는 토큰을 직접 제어하므로 불필요. 복합명사 보존만, 데모 쿼리에서 매칭 실패가 실측될 때 저순위 고려 |
| 청킹 (CHUNK 460 / OVERLAP 55) | 매칭 단위 = 공고 1건. title+summary는 짧아 청킹이 불필요하고, 조각내면 chunk→pblanc_id 매핑·dedup만 복잡해진다. 공고 전문·첨부 PDF까지 인덱싱하도록 확장될 때만 재검토 (그때도 chunk에 pblanc_id 메타 필수) |
| 교집합 + MinMax 가중선형 융합 | 양쪽 top-K의 교집합만 남기는 방식은 sparse 공고 코퍼스에서 recall 붕괴(결과 0) 위험, MinMax는 후보가 적을 때 불안정. RRF가 스케일 무관·union 기반으로 훨씬 robust — **RRF 유지** |

## 공통 원칙

- 응답 JSON 스키마는 `AiEngineClient.java`가 기대하는 구조 그대로 — 필드 추가/변경 시 양쪽(ai-engine 라우터 + Java 클라이언트)을 같은 커밋에서 갱신
- 프롬프트·검색 튜닝은 골든 I/O 예시(데모 시나리오 쿼리 → 기대 top-5)를 기준으로 회귀 확인
- 튜닝 평가 시 `e2e-verify` 시드 공고(DEMO-000x, 3건 중 활성 2건 + 마감 1건)가 최소 평가셋이다.
  DEMO-0003은 마감 처리라 활성 공고 필터로 인덱스에서 제외되므로 매칭 후보에는 안 잡힌다
