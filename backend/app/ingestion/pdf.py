import io
import os
from collections import Counter

import fitz

from app.ingestion.base import ParsedSource

_MIN_NATIVE_CHARS = 20  # below this, treat the page as scanned and OCR it


def _ocr_page(page) -> str:
    import pytesseract
    from PIL import Image

    pix = page.get_pixmap(dpi=200)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return pytesseract.image_to_string(img).strip()


def _detect_lang(text: str) -> str:
    try:
        from langdetect import detect

        return detect(text)
    except Exception:
        return "unknown"


def _strip_headers_footers(pages: list[str]) -> list[str]:
    """Drop first/last lines that repeat across many pages (running headers/footers)."""
    firsts = Counter()
    lasts = Counter()
    split = [p.splitlines() for p in pages]
    for lines in split:
        if lines:
            firsts[lines[0].strip()] += 1
            lasts[lines[-1].strip()] += 1
    n = len(pages)
    threshold = max(3, n // 2)
    drop_first = {k for k, v in firsts.items() if k and v >= threshold}
    drop_last = {k for k, v in lasts.items() if k and v >= threshold}
    out = []
    for lines in split:
        if lines and lines[0].strip() in drop_first:
            lines = lines[1:]
        if lines and lines[-1].strip() in drop_last:
            lines = lines[:-1]
        out.append("\n".join(lines).strip())
    return out


class PdfParser:
    def parse(self, ref: str) -> ParsedSource:
        doc = fitz.open(ref)
        filename = os.path.basename(ref)
        raw: list[tuple[str, str]] = []  # (text, extraction)
        for page in doc:
            text = page.get_text().strip()
            extraction = "native"
            if len(text) < _MIN_NATIVE_CHARS:
                ocr = _ocr_page(page)
                if ocr:
                    text, extraction = ocr, "ocr"
            raw.append((text, extraction))

        cleaned = _strip_headers_footers([t for t, _ in raw])
        segments: list[tuple[str, dict]] = []
        for i, (text, (_, extraction)) in enumerate(zip(cleaned, raw), start=1):
            if not text:
                continue
            segments.append(
                (
                    text,
                    {
                        "type": "pdf",
                        "page": i,
                        "filename": filename,
                        "pdf_id": filename,
                        "extraction": extraction,
                        "lang": _detect_lang(text),
                    },
                )
            )
        if not segments:
            raise ValueError("PDF has no extractable text even after OCR")
        return ParsedSource(title=filename, segments=segments)
