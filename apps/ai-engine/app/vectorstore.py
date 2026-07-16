import chromadb
from chromadb.utils import embedding_functions
from .config import settings

_client = None
_embedding_function = None

def get_collection(name: str = "policy_announcements"):
    """HttpClient 사용 시 임베딩은 서버가 아니라 이 프로세스(클라이언트)에서 계산되므로,
    upsert(indexing.py)·query(vector_search.py) 양쪽 다 여기서 지정한 embedding_function을 탄다.
    미지정 시 Chroma 기본값(all-MiniLM-L6-v2, 영어 특화)이 한국어 공고를 임베딩해 시맨틱 축이 열화된다."""
    global _client, _embedding_function
    if _client is None:
        _client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    if _embedding_function is None:
        # 모델 로딩 비용이 커서 모듈 전역에 메모이즈 — 매 호출마다 재생성하지 않는다
        _embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=settings.embedding_model)
    return _client.get_or_create_collection(name, embedding_function=_embedding_function)
