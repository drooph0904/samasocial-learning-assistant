from app.rag.citations import chip_for, label_for


def test_pdf_label_includes_filename_and_page():
    meta = {"type": "pdf", "page": 42, "filename": "deep-learning.pdf"}
    assert label_for(meta) == "deep-learning.pdf p.42"


def test_pdf_label_without_filename_falls_back():
    assert label_for({"type": "pdf", "page": 7}) == "PDF p.7"


def test_chip_has_label_and_icon():
    chip = chip_for({"type": "pdf", "page": 3, "filename": "x.pdf"})
    assert chip["label"] == "x.pdf p.3"
    assert chip["icon"] == "file"


def test_label_for_pdf_type():
    assert label_for({"type": "pdf", "page": 4}) == "PDF p.4"


def test_label_fallback_unknown_type():
    assert label_for({"type": "unknown"}) == "Source"
