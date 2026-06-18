import {
  AnswerKeyItem,
  Chip,
  GeneratedQuiz,
  GradeResponse,
  Message,
  QuizSelection,
  Source,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Fire-and-forget warm-up. Render's free tier spins the service down after idle;
// pinging /health on load wakes the worker so the first real request isn't slow.
export function warmBackend(): void {
  fetch(`${API}/health`).catch(() => {});
}

export async function listSources(sessionId: string): Promise<Source[]> {
  const r = await fetch(`${API}/api/sources?session_id=${sessionId}`);
  return r.json();
}

export async function getSource(id: string): Promise<Source> {
  const r = await fetch(`${API}/api/sources/${id}`);
  return r.json();
}

export async function addUrlSource(
  sessionId: string,
  type: string,
  url: string,
): Promise<Source> {
  const r = await fetch(`${API}/api/sources/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, type, url }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "Failed to add source");
  return r.json();
}

export async function addFileSource(sessionId: string, file: File): Promise<Source> {
  const fd = new FormData();
  fd.append("session_id", sessionId);
  fd.append("file", file);
  const r = await fetch(`${API}/api/sources/file`, { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json()).detail || "Upload failed");
  return r.json();
}

export async function deleteSource(sourceId: string): Promise<void> {
  await fetch(`${API}/api/sources/${sourceId}`, { method: "DELETE" });
}

export async function deleteChat(sessionId: string): Promise<void> {
  await fetch(`${API}/api/session/${sessionId}`, { method: "DELETE" });
}

export async function getSessionTitle(sessionId: string): Promise<string> {
  const r = await fetch(`${API}/api/session/title?session_id=${sessionId}`);
  if (!r.ok) return "New chat";
  return (await r.json()).title || "New chat";
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const r = await fetch(`${API}/api/messages?session_id=${sessionId}`);
  if (!r.ok) return [];
  return r.json();
}

export async function generateQuiz(
  sessionId: string,
  selections: QuizSelection[],
  difficulty: "easy" | "medium" | "hard" = "medium",
): Promise<GeneratedQuiz> {
  const r = await fetch(`${API}/api/quiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, selections, difficulty }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "Quiz failed");
  return r.json();
}

export async function gradeQuiz(
  quizId: string,
  answers: Record<string, string>,
): Promise<GradeResponse> {
  const r = await fetch(`${API}/api/quiz/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiz_id: quizId, answers }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "Grading failed");
  return r.json();
}

export async function getHint(
  quizId: string,
  questionId: string,
): Promise<{ hint: string; hints_remaining: number }> {
  const r = await fetch(`${API}/api/quiz/hint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiz_id: quizId, question_id: questionId }),
  });
  if (!r.ok) throw new Error((await r.json()).detail || "No hints remaining");
  return r.json();
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "audio.webm");
  const r = await fetch(`${API}/api/transcribe`, { method: "POST", body: fd });
  if (!r.ok) throw new Error((await r.json()).detail || "Transcription failed");
  return (await r.json()).text;
}

export async function getAnswerKey(quizId: string): Promise<AnswerKeyItem[]> {
  const r = await fetch(`${API}/api/quiz/${quizId}/key`);
  if (!r.ok) throw new Error("Could not load answer key");
  return (await r.json()).answers;
}

// Streams chat: calls onChips once, onToken per token, resolves on done.
export async function streamChat(
  sessionId: string,
  message: string,
  onChips: (chips: Chip[]) => void,
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("Chat request failed");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() || "";
    for (const ev of events) {
      const lines = ev.split("\n");
      const evType = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
      const dataLine = lines.find((l) => l.startsWith("data:"))?.slice(5).trim();
      if (!dataLine) continue;
      const data = JSON.parse(dataLine);
      if (evType === "sources") onChips(data.chips);
      else if (evType === "token") onToken(data.text);
    }
  }
}
