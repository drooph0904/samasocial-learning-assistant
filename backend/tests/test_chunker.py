from app.ingestion.chunker import chunk_segments


def test_defaults_are_600_90():
    import inspect
    sig = inspect.signature(chunk_segments)
    assert sig.parameters["max_tokens"].default == 600
    assert sig.parameters["overlap"].default == 90


def test_metadata_preserved_and_indexed():
    long_text = "word " * 2000  # > 600 tokens -> multiple chunks
    meta = {"type": "pdf", "page": 5, "filename": "x.pdf"}
    chunks = chunk_segments([(long_text, meta)])
    assert len(chunks) > 1
    assert all(c.metadata["filename"] == "x.pdf" for c in chunks)
    assert all(c.metadata["page"] == 5 for c in chunks)
    assert [c.metadata["chunk_index"] for c in chunks] == list(range(len(chunks)))


def test_short_segment_becomes_single_chunk():
    chunks = chunk_segments([("hello world", {"page": 1})], max_tokens=500, overlap=0)
    assert len(chunks) == 1
    assert chunks[0].content == "hello world"
    assert chunks[0].metadata["page"] == 1


def test_long_text_splits_into_multiple_chunks_with_metadata_preserved():
    text = " ".join(["word"] * 2000)
    chunks = chunk_segments([(text, {"page": 7})], max_tokens=100, overlap=10)
    assert len(chunks) > 1
    assert all(c.metadata["page"] == 7 for c in chunks)


def test_overlap_repeats_tail_tokens():
    text = " ".join(str(i) for i in range(300))
    chunks = chunk_segments([(text, {})], max_tokens=100, overlap=20)
    # consecutive chunks should share some tokens due to overlap
    assert chunks[0].content.split()[-1] in chunks[1].content.split()[:25]
