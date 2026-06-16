import { AnswerKeyItem, GradeResponse, QuizQuestionPublic } from "./types";

function esc(s: string): string {
  return (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

const STYLES = `
  body { font-family: Georgia, serif; max-width: 720px; margin: 32px auto; color: #111; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  .q { margin: 0 0 18px; page-break-inside: avoid; }
  .qnum { font-weight: bold; }
  .src { color: #888; font-size: 11px; font-weight: normal; }
  ol.opts { margin: 6px 0 0 20px; }
  ol.opts li { margin: 2px 0; }
  .line { border-bottom: 1px solid #999; height: 22px; margin-top: 8px; }
  .ans { color: #15803d; margin-top: 4px; }
  .expl { color: #555; font-size: 13px; margin-top: 2px; }
  .verdict-correct { color: #15803d; font-weight: bold; }
  .verdict-partial { color: #b45309; font-weight: bold; }
  .verdict-incorrect { color: #b91c1c; font-weight: bold; }
  @media print { body { margin: 0.5in; } }
`;

function openAndPrint(title: string, bodyHtml: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups to download the PDF.");
    return;
  }
  w.document.write(
    `<html><head><title>${esc(title)}</title><style>${STYLES}</style></head><body>${bodyHtml}</body></html>`,
  );
  w.document.close();
  w.focus();
  // give the new window a tick to render before invoking the print dialog
  setTimeout(() => w.print(), 300);
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function printBlankTest(questions: QuizQuestionPublic[]) {
  const items = questions
    .map((q, i) => {
      const src = q.source ? ` <span class="src">(${esc(q.source)})</span>` : "";
      let body = `<div class="q"><div><span class="qnum">${i + 1}.</span> ${esc(q.question)}${src}</div>`;
      if (q.type === "mcq" && q.options) {
        body += `<ol class="opts" type="A">${q.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>`;
      } else {
        body += `<div class="line"></div><div class="line"></div>`;
      }
      return body + `</div>`;
    })
    .join("");
  openAndPrint("Quiz", `<h1>Quiz</h1><div class="sub">Name: ______________________  Date: __________</div>${items}`);
}

export function printAnswerKey(answers: AnswerKeyItem[]) {
  const items = answers
    .map((a, i) => {
      const src = a.source ? ` <span class="src">(${esc(a.source)})</span>` : "";
      return (
        `<div class="q"><div><span class="qnum">${i + 1}.</span> ${esc(a.question)}${src}</div>` +
        `<div class="ans">Answer: ${esc(a.correct_answer)}</div>` +
        (a.explanation ? `<div class="expl">${esc(a.explanation)}</div>` : "") +
        `</div>`
      );
    })
    .join("");
  openAndPrint("Answer Key", `<h1>Answer Key</h1>${items}`);
}

export function printGradedReport(
  questions: QuizQuestionPublic[],
  grade: GradeResponse,
) {
  const byId = Object.fromEntries(grade.results.map((r) => [r.id, r]));
  const items = questions
    .map((q, i) => {
      const r = byId[q.id];
      if (!r) return "";
      const src = q.source ? ` <span class="src">(${esc(q.source)})</span>` : "";
      const label =
        r.verdict === "correct" ? "✓ Correct" : r.verdict === "partial" ? "～ Partial" : "✗ Incorrect";
      return (
        `<div class="q"><div><span class="qnum">${i + 1}.</span> ${esc(q.question)}${src}</div>` +
        `<div class="verdict-${r.verdict}">${label}</div>` +
        `<div>Your answer: ${esc(r.your_answer)}</div>` +
        `<div class="ans">Correct answer: ${esc(r.correct_answer)}</div>` +
        (r.feedback ? `<div class="expl">Feedback: ${esc(r.feedback)}</div>` : "") +
        (r.explanation ? `<div class="expl">${esc(r.explanation)}</div>` : "") +
        `</div>`
      );
    })
    .join("");
  const s = grade.score;
  const header = `<h1>Graded Report</h1><div class="sub">Score: ${s.points} / ${s.total} &nbsp;·&nbsp; ${s.correct} correct, ${s.partial} partial, ${s.total - s.correct - s.partial} incorrect</div>`;
  openAndPrint("Graded Report", header + items);
}
