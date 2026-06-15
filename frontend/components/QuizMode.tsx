"use client";
import { useState } from "react";

import { generateQuiz } from "@/lib/api";
import { QuizQuestion } from "@/lib/types";

export function QuizMode({ sessionId }: { sessionId: string }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setRevealed({});
    try {
      setQuestions(await generateQuiz(sessionId, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quiz failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <button
        onClick={run}
        disabled={busy}
        className="mb-4 self-start rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Generating…" : "Quiz me"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="space-y-3 overflow-y-auto">
        {questions.map((q, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-3 text-sm">
            <p className="font-medium">
              {i + 1}. {q.question}
            </p>
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
