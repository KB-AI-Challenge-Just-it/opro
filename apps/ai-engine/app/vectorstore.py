import chromadb
from chromadb.utils import embedding_functions
from .config import settings

_client = None
_embedding_function = None

def get_collection(name: str = "policy_announcements", *, need_embeddings: bool = True):
    """HttpClient 사용 시 임베딩은 서버가 아니라 이 프로세스(클라이언트)에서 계산되므로,
    upsert(indexing.py)·query(vector_search.py) 양쪽 다 여기서 지정한 embedding_function을 탄다.
    미지정 시 Chroma 기본값(all-MiniLM-L6-v2, 영어 특화)이 한국어 공고를 임베딩해 시맨틱 축이 열화된다.

    need_embeddings=False면 id 조회 등 임베딩이 필요 없는 작업용으로, bge-m3(2GB대 CPU 로드)를
    아예 만들지 않고 기존 컬렉션만 가져온다 — 컬렉션이 아직 없으면 아래로 내려가 정상 생성한다."""
    global _client, _embedding_function
    if _client is None:
        _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    if not need_embeddings:
        try:
            return _client.get_collection(name)
        except Exception:
            pass
    if _embedding_function is None:
        # 모델 로딩 비용이 커서 모듈 전역에 메모이즈 — 매 호출마다 재생성하지 않는다
        _embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=settings.embedding_model)
    try:
        return _client.get_or_create_collection(name, embedding_function=_embedding_function)
    except ValueError:
        # chromadb(>=1.x)가 컬렉션 생성 직후 메타데이터 동기화 지연으로
        # 방금 만든 컬렉션을 "embedding_function 불일치"로 오판하는 경우가 있다.
        # 재구성 대상(검색 인덱스, 소스는 policy_announcement)이라 삭제 후 재생성이 안전하다.
        _client.delete_collection(name)
        return _client.create_collection(name, embedding_function=_embedding_function)
