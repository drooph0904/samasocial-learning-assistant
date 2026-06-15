const KEY = "sama_session_id";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function getSessionId(): Promise<string> {
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const res = await fetch(`${API}/api/session`, { method: "POST" });
  const data = await res.json();
  localStorage.setItem(KEY, data.session_id);
  return data.session_id;
}
