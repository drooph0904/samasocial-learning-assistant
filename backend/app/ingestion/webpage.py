import re

import httpx
import trafilatura
from bs4 import BeautifulSoup

from app.ingestion.base import ParsedSource

# A realistic browser UA — many sites (incl. Reddit) return an empty JS shell or
# block requests that look like bots.
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _fetch_url_for(url: str) -> str:
    """Rewrite hosts that need a scrape-friendly variant. Reddit's main site is
    JS-rendered (trafilatura gets nothing); old.reddit.com serves static HTML."""
    return re.sub(r"://(www\.)?reddit\.com", "://old.reddit.com", url, count=1)


def _fetch_html(url: str) -> str:
    headers = {"User-Agent": _UA, "Accept-Language": "en-US,en;q=0.9"}
    resp = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


class WebpageParser:
    def parse(self, ref: str) -> ParsedSource:
        html = _fetch_html(_fetch_url_for(ref))
        text = trafilatura.extract(html) or ""
        soup = BeautifulSoup(html, "html.parser")
        title = soup.title.string.strip() if soup.title and soup.title.string else ref
        if not text.strip():
            # fallback to paragraph text
            text = "\n".join(p.get_text(" ", strip=True) for p in soup.find_all("p"))
        if not text.strip():
            raise ValueError("Could not extract readable content from the page")
        return ParsedSource(
            title=title,
            segments=[(text, {"type": "webpage", "url": ref, "title": title})],
        )
