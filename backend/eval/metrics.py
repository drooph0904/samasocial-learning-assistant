def recall_at_k(retrieved_pages: list[int], gold_pages: list[int], k: int) -> float:
    topk = retrieved_pages[:k]
    return 1.0 if any(p in topk for p in gold_pages) else 0.0


def mrr(retrieved_pages: list[int], gold_pages: list[int]) -> float:
    for rank, page in enumerate(retrieved_pages, start=1):
        if page in gold_pages:
            return 1.0 / rank
    return 0.0


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    xs = sorted(values)
    if len(xs) == 1:
        return float(xs[0])
    idx = (p / 100) * (len(xs) - 1)
    lo = int(idx)
    frac = idx - lo
    hi = min(lo + 1, len(xs) - 1)
    return float(xs[lo] + (xs[hi] - xs[lo]) * frac)
