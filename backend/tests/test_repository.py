from app import repository as repo


class _FakeQuery:
    def __init__(self, sink):
        self._sink = sink

    def insert(self, rows):
        self._sink.append(len(rows))
        return self

    def execute(self):
        return type("R", (), {"data": []})()


class _FakeDB:
    def __init__(self, sink):
        self._sink = sink

    def table(self, name):
        return _FakeQuery(self._sink)


def test_insert_chunks_batches_large_inserts(monkeypatch):
    sink: list[int] = []
    monkeypatch.setattr(repo, "get_db", lambda: _FakeDB(sink))
    rows = [{"content": str(i)} for i in range(250)]
    repo.insert_chunks(rows, batch_size=100)
    # 250 rows -> batches of 100, 100, 50
    assert sink == [100, 100, 50]


def test_insert_chunks_empty_noop(monkeypatch):
    sink: list[int] = []
    monkeypatch.setattr(repo, "get_db", lambda: _FakeDB(sink))
    repo.insert_chunks([])
    assert sink == []
