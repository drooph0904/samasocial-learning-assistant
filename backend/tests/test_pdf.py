import os
import tempfile

import fitz
import pytest

from app.ingestion.pdf import PdfParser


def test_pdf_extracts_text_per_page():
    parsed = PdfParser().parse("tests/fixtures/sample.pdf")
    assert len(parsed.segments) == 2
    assert "Photosynthesis" in parsed.segments[0][0]
    assert parsed.segments[0][1] == {"type": "pdf", "page": 1}
    assert parsed.segments[1][1]["page"] == 2


def test_pdf_empty_raises():
    path = os.path.join(tempfile.mkdtemp(), "blank.pdf")
    d = fitz.open()
    d.new_page()
    d.save(path)
    with pytest.raises(ValueError, match="no extractable text"):
        PdfParser().parse(path)
