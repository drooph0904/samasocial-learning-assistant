from app import repository as repo


class _FakeCursor:
    def __init__(self, sink):
        self._sink = sink

    def executemany(self, sql, params):
        self._sink.append(len(params))

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeConn:
    def __init__(self, sink):
        self._sink = sink

    def cursor(self):
        return _FakeCursor(self._sink)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakePool:
    def __init__(self, sink):
        self._sink = sink

    def connection(self):
        return _FakeConn(self._sink)


def test_insert_chunks_batches_large_inserts(monkeypatch):
    sink: list[int] = []
    monkeypatch.setattr(repo, "get_pool", lambda: _FakePool(sink))
    rows = [
        {"session_id": "s", "source_id": "x", "content": str(i),
         "embedding": [0.0], "metadata": {}}
        for i in range(250)
    ]
    repo.insert_chunks(rows, batch_size=100)
    assert sink == [100, 100, 50]


def test_insert_chunks_empty_noop(monkeypatch):
    sink: list[int] = []
    monkeypatch.setattr(repo, "get_pool", lambda: _FakePool(sink))
    repo.insert_chunks([])
    assert sink == []
