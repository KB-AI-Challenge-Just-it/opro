"""테스트 부트스트랩 — torch를 끌고 오는 무거운 임베딩 의존성(chromadb·sentence-transformers)이
설치돼 있지 않으면 가벼운 스텁으로 대체한다. 실제 설치돼 있으면 그대로 사용한다.
단위 테스트는 임베딩/벡터 실물을 patch로 대체하므로 스텁으로 충분하다."""
import sys
import types
from unittest.mock import MagicMock

try:  # 실물이 있으면 그대로 사용
    import chromadb  # noqa: F401
except Exception:
    chromadb = types.ModuleType("chromadb")
    chromadb.HttpClient = MagicMock()
    utils = types.ModuleType("chromadb.utils")
    ef = types.ModuleType("chromadb.utils.embedding_functions")
    ef.SentenceTransformerEmbeddingFunction = MagicMock()
    utils.embedding_functions = ef
    chromadb.utils = utils
    sys.modules["chromadb"] = chromadb
    sys.modules["chromadb.utils"] = utils
    sys.modules["chromadb.utils.embedding_functions"] = ef

try:
    import sentence_transformers  # noqa: F401
except Exception:
    sys.modules["sentence_transformers"] = types.ModuleType("sentence_transformers")
