_ICONS = {"pdf": "file", "pptx": "slides", "youtube": "video", "webpage": "globe"}


def label_for(meta: dict) -> str:
    t = meta.get("type")
    if t == "pdf":
        page = meta.get("page")
        filename = meta.get("filename")
        return f"{filename} p.{page}" if filename else f"PDF p.{page}"
    if t == "pptx":
        return f"Slide {meta.get('slide')}"
    if t == "youtube":
        return f"Video {meta.get('timestamp')}"
    if t == "webpage":
        return f"Web: {meta.get('title') or meta.get('url')}"
    return "Source"


def chip_for(meta: dict) -> dict:
    return {"label": label_for(meta), "icon": _ICONS.get(meta.get("type"), "file")}
