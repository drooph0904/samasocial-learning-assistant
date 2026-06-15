import os

import fitz

from app.ingestion.base import ParsedSource


class PdfParser:
    def parse(self, ref: str) -> ParsedSource:
        doc = fitz.open(ref)
        segments: list[tuple[str, dict]] = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            if text:
                segments.append((text, {"type": "pdf", "page": i}))
        if not segments:
            raise ValueError("PDF has no extractable text (scanned/image PDFs need OCR)")
        title = os.path.basename(ref)
        return ParsedSource(title=title, segments=segments)
