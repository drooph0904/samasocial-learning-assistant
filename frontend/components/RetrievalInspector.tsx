"use client";
import { useState } from "react";

type Chunk = {
  content: string;
  filename: string | null;
  page: number | null;
  similarity: number | null;
  rerank_score: number | null;
};

const API = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export default function RetrievalInspector() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 6 }),
      });
      if (!r.ok) {
        setError(`Request failed (${r.status})`);
        return;
      }
      const data = await r.json();
      setResults(data.results ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h2 className="font-semibold">Retrieval Inspector</h2>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-2 py-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Inspect top-K retrieved chunks…"
        />
        <button className="border rounded px-3 py-1" onClick={run} disabled={loading}>
          {loading ? "…" : "Retrieve"}
        </button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <ol className="space-y-2">
        {results.map((c, i) => (
          <li key={i} className="border rounded p-2 text-sm">
            <div className="font-mono text-xs opacity-70">
              {c.filename} p.{c.page} · sim {c.similarity?.toFixed(3)} · rerank{" "}
              {c.rerank_score?.toFixed(2)}
            </div>
            <p className="mt-1 line-clamp-4">{c.content}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
