from unittest.mock import MagicMock, patch

from app import vectorstore


def test_get_collection_memoizes_embedding_function_and_passes_it_through():
    vectorstore._client = None
    vectorstore._embedding_function = None

    fake_client = MagicMock()
    fake_ef_instance = MagicMock()

    try:
        with patch.object(vectorstore.chromadb, "HttpClient", return_value=fake_client) as mock_http_client, \
             patch.object(vectorstore.embedding_functions, "SentenceTransformerEmbeddingFunction",
                          return_value=fake_ef_instance) as mock_ef_ctor:
            vectorstore.get_collection("policy_announcements")
            vectorstore.get_collection("policy_announcements")

        # 클라이언트·임베딩 함수 둘 다 최초 1회만 생성 (모델 재로딩 비용 회피)
        mock_http_client.assert_called_once()
        mock_ef_ctor.assert_called_once_with(model_name=vectorstore.settings.embedding_model)

        # 매 호출이 동일한 embedding_function 인스턴스를 넘긴다
        assert fake_client.get_or_create_collection.call_count == 2
        for call in fake_client.get_or_create_collection.call_args_list:
            assert call.kwargs["embedding_function"] is fake_ef_instance
    finally:
        vectorstore._client = None
        vectorstore._embedding_function = None


def test_get_collection_need_embeddings_false_skips_model_load_when_collection_exists():
    vectorstore._client = None
    vectorstore._embedding_function = None

    fake_client = MagicMock()
    fake_collection = MagicMock()
    fake_client.get_collection.return_value = fake_collection

    try:
        with patch.object(vectorstore.chromadb, "HttpClient", return_value=fake_client), \
             patch.object(vectorstore.embedding_functions, "SentenceTransformerEmbeddingFunction") as mock_ef_ctor:
            result = vectorstore.get_collection("policy_announcements", need_embeddings=False)

        assert result is fake_collection
        fake_client.get_collection.assert_called_once_with("policy_announcements")
        mock_ef_ctor.assert_not_called()  # bge-m3 로드 자체가 일어나지 않아야 한다
        fake_client.get_or_create_collection.assert_not_called()
    finally:
        vectorstore._client = None
        vectorstore._embedding_function = None


def test_get_collection_need_embeddings_false_falls_back_when_collection_missing():
    vectorstore._client = None
    vectorstore._embedding_function = None

    fake_client = MagicMock()
    fake_client.get_collection.side_effect = Exception("not found")
    fake_ef_instance = MagicMock()

    try:
        with patch.object(vectorstore.chromadb, "HttpClient", return_value=fake_client), \
             patch.object(vectorstore.embedding_functions, "SentenceTransformerEmbeddingFunction",
                          return_value=fake_ef_instance) as mock_ef_ctor:
            vectorstore.get_collection("policy_announcements", need_embeddings=False)

        # 컬렉션이 아직 없으면(최초 기동) fallback으로 임베딩 함수와 함께 생성한다
        mock_ef_ctor.assert_called_once_with(model_name=vectorstore.settings.embedding_model)
        fake_client.get_or_create_collection.assert_called_once_with(
            "policy_announcements", embedding_function=fake_ef_instance)
    finally:
        vectorstore._client = None
        vectorstore._embedding_function = None
