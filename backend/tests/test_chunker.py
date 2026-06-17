from app.ingestion.chunker import chunk_segments


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
