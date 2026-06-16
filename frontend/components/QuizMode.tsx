"use client";
import { useState } from "react";

import { generateQuiz, getAnswerKey, getHint, gradeQuiz } from "@/lib/api";
import { printAnswerKey, printBlankTest, printGradedReport } from "@/lib/printPdf";
import { GeneratedQuiz, GradeResponse, Source } from "@/lib/types";

const ICON: Record<string, string> = { pdf: "📄", pptx: "▭", youtube: "▶", webpage: "🌐" };

interface Sel {
  selected: boolean;
  mcq: number;
  written: number;
}

function ExportMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-border px-4 py-2 text-sm text-muted hover:bg-card-hover"
      >
        ⤓ Export ▾
      </button>
      {open && (
        <div className="absolute bottom-full z-10 mb-1 w-52 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={() => {
                it.onClick();
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-card-hover"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const color = pct >= 70 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626";
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" className="-rotate-90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct / 100)}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text x="45" y="45" textAnchor="middle" dominantBaseline="central" className="rotate-90" transform="rotate(90 45 45)" fontSize="18" fontWeight="700" fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-faint">{label}</span>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-accent"
      />
      <span className="w-10 text-right text-xs text-faint">{value}</span>
    </div>
  );
}

export function QuizMode({ sessionId, sources }: { sessionId: string; sources: Source[] }) {
  const ready = sources.filter((s) => s.status === "ready");
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [phase, setPhase] = useState<"build" | "take" | "graded">("build");
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hintBusy, setHintBusy] = useState<Record<string, boolean>>({});
  const [hintsLeft, setHintsLeft] = useState(0);
  const [grade, setGrade] = useState<GradeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const get = (id: string): Sel => sel[id] ?? { selected: true, mcq: 3, written: 2 };
  const setOne = (id: string, patch: Partial<Sel>) =>
    setSel((s) => ({ ...s, [id]: { ...get(id), ...patch } }));

  const chosen = ready.filter((s) => get(s.id).selected && get(s.id).mcq + get(s.id).written > 0);
  const total = chosen.reduce((n, s) => n + get(s.id).mcq + get(s.id).written, 0);
  const answeredCount = quiz
    ? quiz.questions.filter((q) => (answers[q.id] ?? "").trim() !== "").length
    : 0;

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const selections = chosen.map((s) => ({
        source_id: s.id,
        mcq_count: get(s.id).mcq,
        written_count: get(s.id).written,
      }));
      const q = await generateQuiz(sessionId, selections);
      setQuiz(q);
      setHintsLeft(q.hints_total);
      setAnswers({});
      setHints({});
      setGrade(null);
      setPhase("take");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quiz failed");
    } finally {
      setBusy(false);
    }
  }

  async function hint(qid: string) {
    // one hint per question; ignore re-clicks and in-flight requests so a
    // double-click can't consume two hints from the budget
    if (hints[qid] || hintBusy[qid] || hintsLeft === 0) return;
    setHintBusy((b) => ({ ...b, [qid]: true }));
    try {
      const r = await getHint(quiz!.quiz_id, qid);
      setHints((h) => ({ ...h, [qid]: r.hint }));
      setHintsLeft(r.hints_remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No hints left");
    } finally {
      setHintBusy((b) => ({ ...b, [qid]: false }));
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      setGrade(await gradeQuiz(quiz!.quiz_id, answers));
      setPhase("graded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadKey() {
    try {
      printAnswerKey(await getAnswerKey(quiz!.quiz_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load answer key");
    }
  }

  // ---------- empty state ----------
  if (ready.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-faint">
        No sources to make a quiz from. Add a source on the left, then come back here.
      </div>
    );
  }

  // ---------- BUILD ----------
  if (phase === "build") {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <h2 className="text-sm font-semibold text-muted">
          Pick sources & how many questions of each type
        </h2>
        {ready.map((s) => {
          const cur = get(s.id);
          return (
            <div key={s.id} className="rounded-lg border border-border p-3">
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
                <div className="mt-2 space-y-1 pl-6">
                  <Slider label="MCQ" value={cur.mcq} onChange={(n) => setOne(s.id, { mcq: n })} />
                  <Slider
                    label="Written"
                    value={cur.written}
                    onChange={(n) => setOne(s.id, { written: n })}
                  />
                </div>
              )}
            </div>
          );
        })}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          onClick={generate}
          disabled={busy || total === 0}
          className="self-start rounded bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50"
        >
          {busy ? "Generating…" : `Generate ${total} question${total === 1 ? "" : "s"}`}
        </button>
      </div>
    );
  }

  // ---------- TAKE ----------
  if (phase === "take" && quiz) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">
              Answered {answeredCount}/{quiz.questions.length}
            </span>
            <span className="rounded-full bg-warning/10 px-3 py-1 text-xs text-warning">
              💡 {hintsLeft} hint{hintsLeft === 1 ? "" : "s"} left
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(answeredCount / quiz.questions.length) * 100}%` }}
            />
          </div>
        </div>
        {quiz.questions.map((q, i) => (
          <div key={q.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {i + 1}. {q.question}{" "}
                {q.source && <span className="text-xs text-faint">({q.source})</span>}
              </p>
              <button
                onClick={() => hint(q.id)}
                disabled={hintsLeft === 0 || !!hints[q.id] || !!hintBusy[q.id]}
                title="Get a hint for this question"
                className="shrink-0 rounded border border-warning/40 px-2 py-0.5 text-xs text-warning disabled:opacity-40"
              >
                {hintBusy[q.id] ? "…" : "Hint"}
              </button>
            </div>
            {hints[q.id] && <p className="mt-1 text-xs italic text-warning">💡 {hints[q.id]}</p>}
            {q.type === "mcq" && q.options ? (
              <div className="mt-2 space-y-1">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === String(oi)}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: String(oi) }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                placeholder="Type your answer…"
                className="mt-2 w-full rounded border border-border p-2 text-sm"
                rows={3}
              />
            )}
          </div>
        ))}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2 pb-2">
          <button
            onClick={submit}
            disabled={busy}
            className="rounded bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50"
          >
            {busy ? "Grading…" : "Submit & grade"}
          </button>
          <button
            onClick={() => printBlankTest(quiz.questions)}
            className="rounded border border-border px-4 py-2 text-sm text-muted"
          >
            Download blank test (PDF)
          </button>
          <button
            onClick={() => setPhase("build")}
            className="rounded border border-border px-4 py-2 text-sm text-muted"
          >
            ← New quiz
          </button>
        </div>
      </div>
    );
  }

  // ---------- GRADED ----------
  if (phase === "graded" && quiz && grade) {
    const byId = Object.fromEntries(grade.results.map((r) => [r.id, r]));
    const s = grade.score;
    const vColor = {
      correct: "text-success",
      partial: "text-warning",
      incorrect: "text-danger",
    };
    const vLabel = { correct: "✓ Correct", partial: "～ Partial", incorrect: "✗ Incorrect" };
    const pct = Math.round((s.points / s.total) * 100);
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-4 rounded-lg bg-accent/10 p-4">
          <ScoreRing pct={pct} />
          <div>
            <div className="text-lg font-bold text-accent">
              {s.points} / {s.total} points
            </div>
            <div className="text-xs text-muted">
              {s.correct} correct · {s.partial} partial · {s.total - s.correct - s.partial} incorrect
            </div>
            {pct >= 80 && <div className="mt-1 text-sm">🎉 Great job!</div>}
            {pct >= 40 && pct < 80 && <div className="mt-1 text-sm">👍 Keep going!</div>}
            {pct < 40 && <div className="mt-1 text-sm">📚 Review and try again.</div>}
          </div>
        </div>
        {quiz.questions.map((q, i) => {
          const r = byId[q.id];
          if (!r) return null;
          return (
            <div key={q.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">
                {i + 1}. {q.question}
              </p>
              <p className={`mt-1 font-semibold ${vColor[r.verdict]}`}>{vLabel[r.verdict]}</p>
              <p className="mt-1 text-muted">Your answer: {r.your_answer}</p>
              {r.verdict !== "correct" && (
                <p className="mt-1 text-success">Correct answer: {r.correct_answer}</p>
              )}
              {r.feedback && <p className="mt-1 text-xs text-faint">💬 {r.feedback}</p>}
              {r.explanation && <p className="mt-1 text-xs text-faint">{r.explanation}</p>}
            </div>
          );
        })}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <ExportMenu
            items={[
              { label: "Graded report (PDF)", onClick: () => printGradedReport(quiz.questions, grade) },
              { label: "Answer key (PDF)", onClick: downloadKey },
              { label: "Blank test (PDF)", onClick: () => printBlankTest(quiz.questions) },
            ]}
          />
          <button
            onClick={() => setPhase("build")}
            className="rounded bg-accent px-4 py-2 text-sm text-on-accent"
          >
            New quiz
          </button>
        </div>
      </div>
    );
  }

  return null;
}
