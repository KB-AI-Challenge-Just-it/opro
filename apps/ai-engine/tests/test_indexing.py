from unittest.mock import MagicMock, patch

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
