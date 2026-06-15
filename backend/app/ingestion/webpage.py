import httpx
import trafilatura
from bs4 import BeautifulSoup

from app.ingestion.base import ParsedSource


def _fetch_html(url: str) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; SamaBot/1.0)"}
    resp = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


class WebpageParser:
    def parse(self, ref: str) -> ParsedSource:
        html = _fetch_html(ref)
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
