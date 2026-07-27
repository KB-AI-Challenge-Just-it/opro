from unittest.mock import MagicMock, call, patch

from app.services import indexing


def _connection_cm(rows):
    """pool.connection()이 반환하는 컨텍스트 매니저를 흉내낸다."""
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = rows
    cm = MagicMock()
    cm.__enter__.return_value = conn
    cm.__exit__.return_value = False
    return conn, cm


def test_rebuild_indexes_queries_with_active_announcement_filter():
    rows = [("PID-1", "제목", "<p>요약</p>")]
    conn, cm = _connection_cm(rows)

    with patch.object(indexing.pool, "connection", return_value=cm), \
         patch.object(indexing.bm25_index, "rebuild") as mock_bm25_rebuild, \
         patch.object(indexing, "get_collection") as mock_get_collection:
        mock_collection = MagicMock()
        mock_get_collection.return_value = mock_collection

        count = indexing.rebuild_indexes()

    assert count == 1
    executed_sql = conn.execute.call_args[0][0]
    assert "apply_end >= CURRENT_DATE" in executed_sql
    assert "apply_end IS NULL" in executed_sql
    mock_bm25_rebuild.assert_called_once_with([("PID-1", "제목 요약")])
    mock_collection.upsert.assert_called_once_with(ids=["PID-1"], documents=["제목 요약"])


def test_rebuild_indexes_returns_zero_and_skips_chroma_when_no_active_announcements():
    conn, cm = _connection_cm([])

    with patch.object(indexing.pool, "connection", return_value=cm), \
         patch.object(indexing.bm25_index, "rebuild") as mock_bm25_rebuild, \
         patch.object(indexing, "get_collection") as mock_get_collection:
        count = indexing.rebuild_indexes()

    assert count == 0
    mock_bm25_rebuild.assert_called_once_with([])
    mock_get_collection.assert_not_called()


def test_rebuild_indexes_skips_embedding_model_load_when_nothing_new():
    """기존 id만 있으면(신규 공고 없음) bge-m3(need_embeddings=True) 로드를 아예 하지 않는다."""
    rows = [("PID-1", "제목", "<p>요약</p>")]
    conn, cm = _connection_cm(rows)

    readonly_collection = MagicMock()
    readonly_collection.get.return_value = {"ids": ["PID-1"]}

    with patch.object(indexing.pool, "connection", return_value=cm), \
         patch.object(indexing.bm25_index, "rebuild"), \
         patch.object(indexing, "get_collection") as mock_get_collection:
        mock_get_collection.return_value = readonly_collection

        count = indexing.rebuild_indexes()

    assert count == 1
    # need_embeddings=False로 딱 한 번만 호출 — 임베딩 함수(bge-m3)를 요구하는 기본 호출은 없어야 한다
    mock_get_collection.assert_called_once_with(need_embeddings=False)
    readonly_collection.upsert.assert_not_called()


def test_rebuild_indexes_loads_embedding_model_only_for_new_docs():
    """신규 공고가 있을 때만 임베딩 함수(need_embeddings=True 기본값)를 요구해 bge-m3를 로드한다."""
    rows = [("PID-1", "제목", "<p>요약</p>")]
    conn, cm = _connection_cm(rows)

    readonly_collection = MagicMock()
    readonly_collection.get.return_value = {"ids": []}
    embedding_collection = MagicMock()

    with patch.object(indexing.pool, "connection", return_value=cm), \
         patch.object(indexing.bm25_index, "rebuild"), \
         patch.object(indexing, "get_collection") as mock_get_collection:
        mock_get_collection.side_effect = [readonly_collection, embedding_collection]

        count = indexing.rebuild_indexes()

    assert count == 1
    assert mock_get_collection.call_args_list == [
        call(need_embeddings=False),
        call(),
    ]
    embedding_collection.upsert.assert_called_once_with(ids=["PID-1"], documents=["제목 요약"])
