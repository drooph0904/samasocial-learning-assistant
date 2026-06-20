from eval import metrics


def test_recall_at_k():
    assert metrics.recall_at_k([3, 9, 4], [4], k=3) == 1.0
    assert metrics.recall_at_k([3, 9, 8], [4], k=3) == 0.0
    assert metrics.recall_at_k([4, 9, 8], [4], k=1) == 1.0


def test_mrr():
    assert metrics.mrr([9, 4, 7], [4]) == 0.5      # gold first appears at rank 2
    assert metrics.mrr([4, 9, 7], [4]) == 1.0
    assert metrics.mrr([1, 2, 3], [4]) == 0.0


def test_percentile():
    assert metrics.percentile([1, 2, 3, 4], 50) == 2.5
    assert metrics.percentile([10], 95) == 10
