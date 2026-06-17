from app.rag.citations import chip_for, label_for


def test_label_for_each_type():
    assert label_for({"type": "pdf", "page": 4}) == "PDF p.4"
    assert label_for({"type": "pptx", "slide": 3}) == "Slide 3"
    assert label_for({"type": "youtube", "timestamp": "3:22"}) == "Video 3:22"
    assert label_for({"type": "webpage", "title": "Graphs"}) == "Web: Graphs"


def test_chip_for_includes_icon():
    chip = chip_for({"type": "youtube", "timestamp": "3:22"})
    assert chip["label"] == "Video 3:22"
    assert chip["icon"] == "video"
