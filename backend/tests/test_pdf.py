import fitz
import pytest

from app.ingestion.pdf import PdfParser


def _make_pdf(tmp_path, text):
    doc = fitz.open()
    page = doc.new_page()
    if text:
        page.insert_text((72, 72), text)
    p = tmp_path / "doc.pdf"
    doc.save(str(p))
    return str(p)


def test_native_text_extraction_sets_metadata(tmp_path):
    ref = _make_pdf(tmp_path, "Gradient descent optimizes the loss function.")
    parsed = PdfParser().parse(ref)
    assert parsed.title == "doc.pdf"
    text, meta = parsed.segments[0]
    assert "Gradient descent" in text
    assert meta["type"] == "pdf"
    assert meta["page"] == 1
    assert meta["filename"] == "doc.pdf"
    assert meta["pdf_id"] == "doc.pdf"
    assert meta["extraction"] == "native"
    assert "lang" in meta


def test_scanned_page_falls_back_to_ocr(tmp_path, monkeypatch):
    ref = _make_pdf(tmp_path, "")  # no extractable text -> OCR path
    monkeypatch.setattr(
        "app.ingestion.pdf._ocr_page", lambda page: "Recovered via OCR neural network"
    )
    parsed = PdfParser().parse(ref)
    text, meta = parsed.segments[0]
    assert "Recovered via OCR" in text
    assert meta["extraction"] == "ocr"


def test_completely_empty_pdf_raises(tmp_path, monkeypatch):
    ref = _make_pdf(tmp_path, "")
    monkeypatch.setattr("app.ingestion.pdf._ocr_page", lambda page: "")
    with pytest.raises(ValueError):
        PdfParser().parse(ref)
