import { ChatMeta } from "./types";

const KEY_LIST = "sama_chats";
const KEY_ACTIVE = "sama_active_chat";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

function readChats(): ChatMeta[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_LIST) || "[]");
  } catch {
    return [];
  }
}

function writeChats(chats: ChatMeta[]) {
  localStorage.setItem(KEY_LIST, JSON.stringify(chats));
}

export function getChats(): ChatMeta[] {
  return readChats();
}

export function getActiveId(): string | null {
  return localStorage.getItem(KEY_ACTIVE);
}

export function setActiveId(id: string) {
  localStorage.setItem(KEY_ACTIVE, id);
}

async function createSessionId(): Promise<string> {
  const res = await fetch(`${API}/api/session`, { method: "POST" });
  const data = await res.json();
  return data.session_id;
}

/** Create a brand new chat (fresh session, 0 sources) and make it active. */
export async function createChat(): Promise<ChatMeta> {
  const id = await createSessionId();
  const chat: ChatMeta = { id, title: "New chat", createdAt: Date.now() };
  writeChats([chat, ...readChats()]);
  setActiveId(id);
  return chat;
}

/** Set a chat's collective title and the source-set key it was generated for. */
export function setChatTitle(id: string, title: string, titleKey: string) {
  writeChats(readChats().map((c) => (c.id === id ? { ...c, title, titleKey } : c)));
}

const KEY_LEGACY = "sama_session_id";

/** Migrate a pre-multichat single session into the chat list (run once). */
function migrateLegacy(chats: ChatMeta[]): ChatMeta[] {
  const legacy = localStorage.getItem(KEY_LEGACY);
  if (legacy && !chats.some((c) => c.id === legacy)) {
    const migrated: ChatMeta = { id: legacy, title: "Previous chat", createdAt: Date.now() };
    const next = [migrated, ...chats];
    writeChats(next);
    localStorage.removeItem(KEY_LEGACY);
    return next;
  }
  return chats;
}

/** Ensure at least one chat exists; return the active one. */
export async function ensureActiveChat(): Promise<ChatMeta> {
  const chats = migrateLegacy(readChats());
  const activeId = getActiveId();
  const active = chats.find((c) => c.id === activeId);
  if (active) return active;
  if (chats.length > 0) {
    setActiveId(chats[0].id);
    return chats[0];
  }
  return createChat();
}
