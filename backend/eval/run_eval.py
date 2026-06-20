import json
import pathlib
import time

from app.config import get_settings
from app.openai_client import get_openai
from app.rag.generator import stream_answer
from app.rag.retriever import build_context, retrieve
from eval.metrics import mrr, percentile, recall_at_k

GOLD = pathlib.Path(__file__).parent / "goldset.jsonl"
REPORT = pathlib.Path(__file__).parent / "report.md"
TOP_K = 6


def _judge_grounded(answer: str, context: str) -> bool:
    prompt = (
        "You are a strict grader. Reply with only YES or NO. "
        "Is EVERY factual claim in the ANSWER supported by the CONTEXT?\n\n"
        f"CONTEXT:\n{context}\n\nANSWER:\n{answer}"
    )
    resp = get_openai().chat.completions.create(
        model=get_settings().openai_chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
    )
    return resp.choices[0].message.content.strip().upper().startswith("YES")


def main() -> None:
    s = get_settings()
    rows = [json.loads(line) for line in GOLD.read_text().splitlines() if line.strip()]
    latencies, recalls, rrs, cite_ok, grounded = [], [], [], [], []

    for row in rows:
        t0 = time.perf_counter()
        hits = retrieve(row["question"], s.corpus_session_id, TOP_K, s.retrieval_min_score)
        context = build_context(hits)
        answer = "".join(stream_answer(row["question"], context, history=[]))
        latencies.append(time.perf_counter() - t0)

        pages = [h["metadata"].get("page") for h in hits
                 if h["metadata"].get("filename") == row["filename"]]
        recalls.append(recall_at_k(pages, row["gold_pages"], TOP_K))
        rrs.append(mrr(pages, row["gold_pages"]))
        cite_ok.append(1.0 if row["answer_substring"].lower() in answer.lower() else 0.0)
        grounded.append(1.0 if _judge_grounded(answer, context) else 0.0)

    n = len(rows)
    report = (
        f"# RAG Eval Report\n\n"
        f"- Questions: {n}\n"
        f"- Latency p50: {percentile(latencies, 50):.2f}s\n"
        f"- Latency p95: {percentile(latencies, 95):.2f}s\n"
        f"- Recall@{TOP_K}: {sum(recalls)/n:.2%}\n"
        f"- MRR: {sum(rrs)/n:.3f}\n"
        f"- Citation accuracy: {sum(cite_ok)/n:.2%}\n"
        f"- Hallucination rate: {1 - sum(grounded)/n:.2%}\n"
    )
    REPORT.write_text(report)
    print(report)


if __name__ == "__main__":
    main()
