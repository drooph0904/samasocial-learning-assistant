"use client";
import {
  Check,
  CircleDot,
  Download,
  FileText,
  Globe,
  Lightbulb,
  Minus,
  Plus,
  Presentation,
  RotateCcw,
  Sparkles,
  X,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";

import { generateQuiz, getAnswerKey, getHint, gradeQuiz } from "@/lib/api";
import { printAnswerKey, printBlankTest, printGradedReport } from "@/lib/printPdf";
import { GeneratedQuiz, GradeResponse, Source } from "@/lib/types";

import { useConfirm } from "./ui/Confirm";

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  pdf: FileText,
  pptx: Presentation,
  youtube: Video,
  webpage: Globe,
};
type Difficulty = "easy" | "medium" | "hard";

interface Sel {
  selected: boolean;
  mcq: number;
  written: number;
}

/** Slider + numeric stepper combo (wireframe section 03). */
function StepperRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(10, n));
  return (
    <div className="my-2 flex items-center gap-3">
      <span className="w-28 text-xs text-muted">{label}</span>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-accent"
      />
      <div className="flex items-center gap-1 rounded-lg border border-border bg-panel p-0.5">
        <button onClick={() => onChange(clamp(value - 1))} className="grid h-6 w-6 place-items-center rounded-md bg-input text-muted hover:text-fg"><Minus size={13} /></button>
        <span className="w-7 text-center text-sm tabular-nums">{value}</span>
        <button onClick={() => onChange(clamp(value + 1))} className="grid h-6 w-6 place-items-center rounded-md bg-input text-muted hover:text-fg"><Plus size={13} /></button>
      </div>
    </div>
  );
}

function ScoreRing({ pct }: { pct: number }) {
  const color = pct >= 70 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";
  return (
    <div
      className="grid h-24 w-24 flex-none place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} 0 ${pct}%, var(--input) ${pct}% 100%)` }}
    >
      <div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-panel-2 text-xl font-extrabold text-fg">
        {pct}%
      </div>
    </div>
  );
}

export function QuizMode({
  sessionId,
  sources,
  preselectSourceId,
}: {
  sessionId: string;
  sources: Source[];
  preselectSourceId?: string | null;
}) {
  const ready = sources.filter((s) => s.status === "ready");
  const confirm = useConfirm();
  const [sel, setSel] = useState<Record<string, Sel>>({});
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [phase, setPhase] = useState<"build" | "take" | "graded">("build");
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hintBusy, setHintBusy] = useState<Record<string, boolean>>({});
  const [hintsLeft, setHintsLeft] = useState(0);
  const [grade, setGrade] = useState<GradeResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "correct" | "partial" | "incorrect">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const get = (id: string): Sel => sel[id] ?? { selected: true, mcq: 3, written: 2 };
  const setOne = (id: string, patch: Partial<Sel>) =>
    setSel((s) => ({ ...s, [id]: { ...get(id), ...patch } }));

  // Deep-link from "Quiz me on this source": select only that source.
  useEffect(() => {
    if (!preselectSourceId) return;
    const next: Record<string, Sel> = {};
    ready.forEach((s) => {
      next[s.id] = { selected: s.id === preselectSourceId, mcq: 3, written: 2 };
    });
    setSel(next);
    setPhase("build");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectSourceId]);

  const chosen = ready.filter((s) => get(s.id).selected && get(s.id).mcq + get(s.id).written > 0);
  const totalMcq = chosen.reduce((n, s) => n + get(s.id).mcq, 0);
  const totalWritten = chosen.reduce((n, s) => n + get(s.id).written, 0);
  const total = totalMcq + totalWritten;
  const estMin = Math.round(totalMcq * 1 + totalWritten * 2);
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
      const q = await generateQuiz(sessionId, selections, difficulty);
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
    const unanswered = (quiz?.questions.length ?? 0) - answeredCount;
    if (unanswered > 0) {
      const ok = await confirm({
        title: `${unanswered} question${unanswered === 1 ? "" : "s"} unanswered`,
        body: "Submit anyway? Unanswered questions will be marked incorrect.",
        confirmLabel: "Submit",
      });
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      setGrade(await gradeQuiz(quiz!.quiz_id, answers));
      setFilter("all");
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

  // ---------- BUILD (section 03) ----------
  if (phase === "build") {
    return (
      <div className="mx-auto flex h-full w-full max-w-[860px] flex-col overflow-y-auto p-6">
        <h3 className="text-xl font-semibold">Build a quiz</h3>
        <p className="mt-1 text-sm text-muted">
          Pick sources and how many of each question type. Totals update live.
        </p>

        <div className="mt-4 inline-flex w-fit items-center rounded-xl border border-border bg-panel p-1 text-sm">
          <span className="px-3 py-1.5 text-muted">Difficulty</span>
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-lg px-4 py-1.5 capitalize transition ${
                difficulty === d ? "bg-accent text-on-accent" : "text-muted hover:text-fg"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {ready.map((s) => {
            const cur = get(s.id);
            return (
              <div key={s.id} className="rounded-2xl border border-border bg-card p-4">
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={cur.selected}
                    onChange={(e) => setOne(s.id, { selected: e.target.checked })}
                    className="h-4 w-4 accent-accent"
                  />
                  {(() => {
                    const Ic = TYPE_ICON[s.type] ?? FileText;
                    return <Ic size={15} />;
                  })()}
                  <span className="truncate">{s.title || s.type}</span>
                </label>
                {cur.selected && (
                  <div className="mt-2 pl-7">
                    <StepperRow label="Multiple choice" value={cur.mcq} onChange={(n) => setOne(s.id, { mcq: n })} />
                    <StepperRow label="Written" value={cur.written} onChange={(n) => setOne(s.id, { written: n })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="sticky bottom-0 mt-4 flex items-center gap-4 border-t border-border bg-app/95 py-4 backdrop-blur">
          <div className="flex gap-5 text-sm text-muted">
            <div><b className="block text-lg tabular-nums text-fg">{total}</b>total</div>
            <div><b className="block text-lg tabular-nums text-fg">{totalMcq}</b>multiple choice</div>
            <div><b className="block text-lg tabular-nums text-fg">{totalWritten}</b>written</div>
            <div><b className="block text-lg tabular-nums text-fg">~{estMin}m</b>est. time</div>
          </div>
          <button
            onClick={generate}
            disabled={busy || total === 0}
            className="ml-auto rounded-xl bg-accent px-6 py-3 text-sm font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Generating…" : `Generate ${total} question${total === 1 ? "" : "s"} →`}
          </button>
        </div>
      </div>
    );
  }

  // ---------- TAKE (section 04) ----------
  if (phase === "take" && quiz) {
    const isAnswered = (qid: string) => (answers[qid] ?? "").trim() !== "";
    return (
      <div className="flex h-full flex-col">
        <div className="sticky top-0 z-10 border-b border-border bg-app px-6 py-3">
          <div className="mx-auto flex max-w-[820px] items-center gap-3">
            <span className="text-sm font-semibold">
              Answered {answeredCount} / {quiz.questions.length}
            </span>
            <span className="ml-auto flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
              <Lightbulb size={13} /> {hintsLeft} hint{hintsLeft === 1 ? "" : "s"} left
            </span>
          </div>
          <div className="mx-auto mt-3 flex max-w-[820px] flex-wrap gap-1.5">
            {quiz.questions.map((q, i) => (
              <a
                key={q.id}
                href={`#q-${q.id}`}
                className={`grid h-6 w-6 place-items-center rounded-md text-[11px] tabular-nums transition ${
                  isAnswered(q.id) ? "bg-accent text-on-accent" : "bg-input text-faint hover:text-fg"
                }`}
              >
                {i + 1}
              </a>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto flex max-w-[820px] flex-col gap-4">
            {quiz.questions.map((q, i) => (
              <div key={q.id} id={`q-${q.id}`} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start gap-2.5">
                  <span className="text-sm font-extrabold tabular-nums text-accent">{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-medium leading-snug">{q.question}</p>
                    {q.source && (
                      <span className="mt-1.5 inline-block rounded-full bg-input px-2 py-0.5 text-[11px] text-faint">
                        {q.source}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => hint(q.id)}
                    disabled={hintsLeft === 0 || !!hints[q.id] || !!hintBusy[q.id]}
                    className="flex flex-none items-center gap-1 rounded-lg border border-warning/40 px-2.5 py-1 text-xs text-warning disabled:opacity-40"
                  >
                    <Lightbulb size={12} /> {hintBusy[q.id] ? "…" : "Hint"}
                  </button>
                </div>
                {hints[q.id] && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs italic text-warning">
                    <Lightbulb size={13} className="mt-0.5 flex-none" /> {hints[q.id]}
                  </p>
                )}
                {q.type === "mcq" && q.options ? (
                  <div className="mt-3 space-y-2">
                    {q.options.map((opt, oi) => {
                      const selected = answers[q.id] === String(oi);
                      return (
                        <button
                          key={oi}
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: String(oi) }))}
                          className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                            selected ? "border-accent bg-accent/10" : "border-border hover:bg-card-hover"
                          }`}
                        >
                          <span
                            className={`grid h-4 w-4 flex-none place-items-center rounded-full border-2 ${
                              selected ? "border-accent" : "border-faint"
                            }`}
                          >
                            {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3">
                    <textarea
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Type your answer…"
                      maxLength={600}
                      className="w-full rounded-xl border border-border bg-input p-3 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                      rows={3}
                    />
                    <div className="mt-1 text-right text-[11px] text-faint">
                      {(answers[q.id] || "").length} / 600
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="px-6 text-sm text-danger">{error}</p>}
        <div className="sticky bottom-0 flex justify-center gap-2 border-t border-border bg-app px-6 py-3">
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Grading…" : "Submit & grade"}
          </button>
          <button
            onClick={() => printBlankTest(quiz.questions)}
            className="flex items-center gap-1.5 rounded-xl border border-border px-5 py-2.5 text-sm text-muted transition hover:bg-card-hover"
          >
            <Download size={15} /> Download blank test
          </button>
          <button
            onClick={() => setPhase("build")}
            className="rounded-xl border border-border px-5 py-2.5 text-sm text-muted transition hover:bg-card-hover"
          >
            ← New quiz
          </button>
        </div>
      </div>
    );
  }

  // ---------- RESULTS (section 05) ----------
  if (phase === "graded" && quiz && grade) {
    const byId = Object.fromEntries(grade.results.map((r) => [r.id, r]));
    const s = grade.score;
    const pct = Math.round((s.points / s.total) * 100);
    const counts = {
      correct: s.correct,
      partial: s.partial,
      incorrect: s.total - s.correct - s.partial,
    };
    const stripe = { correct: "border-l-success", partial: "border-l-warning", incorrect: "border-l-danger" };
    const vText = { correct: "text-success", partial: "text-warning", incorrect: "text-danger" };
    const vLabel = { correct: "Correct", partial: "Partial", incorrect: "Incorrect" };
    const VIcon = { correct: Check, partial: CircleDot, incorrect: X };

    const filtered = quiz.questions.filter((q) => {
      const r = byId[q.id];
      return r && (filter === "all" || r.verdict === filter);
    });

    return (
      <div className="mx-auto flex h-full w-full max-w-[820px] flex-col gap-4 overflow-y-auto p-6">
        {s.total > 0 && s.points === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <div className="text-lg font-semibold">No points scored</div>
            <p className="mt-1 text-sm text-muted">Want to retake it?</p>
            <button
              onClick={() => {
                setAnswers({});
                setPhase("take");
              }}
              className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
            >
              Retake quiz
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-6 rounded-2xl border border-border bg-card p-6">
            <ScoreRing pct={pct} />
            <div>
              <div className="text-2xl font-extrabold text-accent">
                {s.points} / {s.total} points
              </div>
              <div className="mt-1 flex gap-2 text-sm text-muted">
                <b className="text-success">{counts.correct} correct</b>·
                <b className="text-warning">{counts.partial} partial</b>·
                <b className="text-danger">{counts.incorrect} incorrect</b>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {counts.incorrect + counts.partial > 0 && (
                  <button
                    onClick={() => {
                      setAnswers((prev) => {
                        const keep: Record<string, string> = {};
                        grade.results.forEach((r) => {
                          if (r.verdict === "correct") keep[r.id] = prev[r.id] ?? "";
                        });
                        return keep;
                      });
                      setPhase("take");
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm text-on-accent hover:bg-accent-hover"
                  >
                    <RotateCcw size={14} /> Retry incorrect
                  </button>
                )}
                <button onClick={() => setPhase("build")} className="rounded-lg border border-border px-3.5 py-1.5 text-sm text-muted hover:bg-card-hover">
                  New quiz
                </button>
                <button onClick={() => printGradedReport(quiz.questions, grade)} className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm text-muted hover:bg-card-hover">
                  <Download size={14} /> Report
                </button>
                <button onClick={downloadKey} className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-sm text-muted hover:bg-card-hover">
                  <Download size={14} /> Answer key
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {([
            ["all", `All ${s.total}`, null],
            ["incorrect", `Incorrect ${counts.incorrect}`, X],
            ["partial", `Partial ${counts.partial}`, CircleDot],
            ["correct", `Correct ${counts.correct}`, Check],
          ] as const).map(([key, lbl, Ic]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition ${
                filter === key ? "border-transparent bg-accent text-on-accent" : "border-border text-muted hover:bg-card-hover"
              }`}
            >
              {Ic && <Ic size={12} />} {lbl}
            </button>
          ))}
        </div>

        {filtered.map((q, i) => {
          const r = byId[q.id]!;
          return (
            <div key={q.id} className={`rounded-xl border border-l-[3px] border-border bg-card p-4 ${stripe[r.verdict]}`}>
              <p className="font-medium">
                {quiz.questions.indexOf(q) + 1}. {q.question}
              </p>
              <p className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${vText[r.verdict]}`}>
                {(() => {
                  const VI = VIcon[r.verdict];
                  return <VI size={14} />;
                })()}
                {vLabel[r.verdict]}
              </p>
              <p className="mt-1 text-sm text-muted">Your answer: {r.your_answer}</p>
              {r.verdict !== "correct" && (
                <p className="mt-1 text-sm text-success">Correct: {r.correct_answer}</p>
              )}
              {(r.feedback || r.explanation) && (
                <p className="mt-2 border-t border-border pt-2 text-xs leading-relaxed text-faint">
                  {r.feedback ? `💬 ${r.feedback} ` : ""}
                  {r.explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return null;
}
