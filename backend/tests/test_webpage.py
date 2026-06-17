import pytest

from app.ingestion import webpage as wp
from app.ingestion.webpage import WebpageParser

HTML = """
<html><head><title>Intro to Graphs</title></head>
<body><article><h1>Graphs</h1><p>A graph is a set of nodes and edges.</p></article></body></html>
"""


def test_webpage_extracts_main_text(monkeypatch):
    monkeypatch.setattr(wp, "_fetch_html", lambda url: HTML)
    parsed = WebpageParser().parse("https://example.com/graphs")
    assert parsed.title == "Intro to Graphs"
    assert "nodes and edges" in parsed.segments[0][0]
    assert parsed.segments[0][1]["type"] == "webpage"
    assert parsed.segments[0][1]["url"] == "https://example.com/graphs"


def test_reddit_url_rewritten_to_old_reddit():
    assert (
        wp._fetch_url_for("https://www.reddit.com/r/x/comments/1/abc/")
        == "https://old.reddit.com/r/x/comments/1/abc/"
    )
    assert wp._fetch_url_for("https://reddit.com/r/x") == "https://old.reddit.com/r/x"
    # non-reddit untouched
    assert wp._fetch_url_for("https://example.com/p") == "https://example.com/p"


def test_webpage_empty_raises(monkeypatch):
    monkeypatch.setattr(wp, "_fetch_html", lambda url: "<html><body></body></html>")
    with pytest.raises(ValueError, match="content"):
        WebpageParser().parse("https://example.com/empty")
