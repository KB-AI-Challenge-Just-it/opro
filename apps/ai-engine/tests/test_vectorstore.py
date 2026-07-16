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
