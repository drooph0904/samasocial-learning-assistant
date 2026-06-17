import { ChatMeta } from "./types";

const KEY_LIST = "sama_chats";
const KEY_ACTIVE = "sama_active_chat";

/** A random UUID v4, generated client-side so creating a chat needs no network. */
function newSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16),
  );
}

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

/** Create a brand new chat (fresh session, 0 sources) and make it active.
 * Instant — the session id is generated locally and the backend creates the
 * session row lazily on first message/source. */
export function createChat(): ChatMeta {
  const id = newSessionId();
  const chat: ChatMeta = { id, title: "New chat", createdAt: Date.now() };
  writeChats([chat, ...readChats()]);
  setActiveId(id);
  return chat;
}

/** Remove several chats at once; returns the remaining chats. */
export function removeChats(ids: string[]): ChatMeta[] {
  const set = new Set(ids);
  const next = readChats().filter((c) => !set.has(c.id));
  writeChats(next);
  return next;
}

/** Set a chat's collective title and the source-set key it was generated for. */
export function setChatTitle(id: string, title: string, titleKey: string) {
  writeChats(readChats().map((c) => (c.id === id ? { ...c, title, titleKey } : c)));
}

/** Remove a chat from the list; returns the remaining chats. */
export function removeChat(id: string): ChatMeta[] {
  const next = readChats().filter((c) => c.id !== id);
  writeChats(next);
  return next;
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
