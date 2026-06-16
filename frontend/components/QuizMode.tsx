"use client";
import { useState } from "react";

import { generateQuiz } from "@/lib/api";
import { QuizQuestion, Source } from "@/lib/types";

const ICON: Record<string, string> = { pdf: "📄", pptx: "▭", youtube: "▶", webpage: "🌐" };

interface Sel {
  selected: boolean;
  count: number;
}

export function QuizMode({ sessionId, sources }: { sessionId: string; sources: Source[] }) {
  const ready = sources.filter((s) => s.status === "ready");
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [showSource, setShowSource] = useState(true);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const get = (id: string): Sel => sel[id] ?? { selected: true, count: 3 };
  const setOne = (id: string, patch: Partial<Sel>) =>
    setSel((s) => ({ ...s, [id]: { ...get(id), ...patch } }));

  const chosen = ready.filter((s) => get(s.id).selected);
  const total = chosen.reduce((n, s) => n + get(s.id).count, 0);

  async function run() {
    setBusy(true);
    setError("");
    setRevealed({});
    setQuestions([]);
    try {
      const selections = chosen.map((s) => ({ source_id: s.id, count: get(s.id).count }));
      setQuestions(await generateQuiz(sessionId, selections));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quiz failed");
    } finally {
      setBusy(false);
    }
  }

  if (ready.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-gray-400">
        No sources to make a quiz from. Add a source on the left, then come back here.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Pick sources & how many questions</h2>
        {ready.map((s) => {
          const cur = get(s.id);
          return (
            <div key={s.id} className="rounded-lg border border-gray-200 p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={cur.selected}
                  onChange={(e) => setOne(s.id, { selected: e.target.checked })}
                />
                <span>{ICON[s.type]}</span>
                <span className="truncate">{s.title || s.type}</span>
              </label>
              {cur.selected && (
                <div className="mt-2 flex items-center gap-3 pl-6">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={cur.count}
                    onChange={(e) => setOne(s.id, { count: Number(e.target.value) })}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="w-16 text-right text-xs text-gray-500">{cur.count} Qs</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={showSource}
            onChange={(e) => setShowSource(e.target.checked)}
          />
          Show source on each question
        </label>
        <button
          onClick={run}
          disabled={busy || chosen.length === 0}
          className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : `Generate ${total} question${total === 1 ? "" : "s"}`}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {i + 1}. {q.question}
              </p>
              {showSource && q.source && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {q.source}
                </span>
              )}
            </div>
            {revealed[i] ? (
              <p className="mt-2 text-green-700">{q.answer}</p>
            ) : (
              <button
                onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                className="mt-2 text-indigo-600 underline"
              >
                Show answer
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
