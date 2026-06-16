"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatList } from "@/components/ChatList";
import { ChatWindow } from "@/components/ChatWindow";
import { QuizMode } from "@/components/QuizMode";
import { SourcePanel } from "@/components/SourcePanel";
import { deleteChat, getMessages, getSessionTitle, listSources } from "@/lib/api";
import {
  createChat,
  ensureActiveChat,
  getChats,
  removeChat,
  setActiveId,
  setChatTitle,
} from "@/lib/session";
import { ChatMeta, Message, Source } from "@/lib/types";
import { useConfirm } from "@/components/ui/Confirm";
import { useToast } from "@/components/ui/Toast";

function readyKeyOf(sources: Source[]): string {
  return sources
    .filter((s) => s.status === "ready")
    .map((s) => s.id)
    .sort()
    .join(",");
}

export default function Home() {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeId, setActive] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<"chat" | "quiz">("chat");
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();
  const toast = useToast();

  const loadChat = useCallback(async (id: string) => {
    setLoading(true);
    const [srcs, msgs] = await Promise.all([listSources(id), getMessages(id)]);
    setSources(srcs);
    setMessages(msgs);
    setLoading(false);
  }, []);

  // Init exactly once. StrictMode double-invokes effects in dev, which would
  // otherwise call ensureActiveChat() twice and create two empty chats.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    ensureActiveChat().then(async (chat) => {
      setChats(getChats());
      setActive(chat.id);
      await loadChat(chat.id);
    });
  }, [loadChat]);

  // Refresh the active chat's title (collective summary of its sources) whenever
  // its set of ready sources changes.
  const titleInFlight = useRef("");
  useEffect(() => {
    if (!activeId) return;
    const key = readyKeyOf(sources);
    const active = getChats().find((c) => c.id === activeId);
    if (!active || active.titleKey === key) return;
    if (titleInFlight.current === activeId + key) return;
    titleInFlight.current = activeId + key;
    getSessionTitle(activeId).then((title) => {
      setChatTitle(activeId, title, key);
      setChats(getChats());
    });
  }, [sources, activeId]);

  async function switchChat(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setActive(id);
    setTab("chat");
    await loadChat(id);
  }

  async function newChat() {
    const chat = await createChat();
    setChats(getChats());
    setActive(chat.id);
    setSources([]);
    setMessages([]);
    setTab("chat");
  }

  async function handleDeleteChat(id: string) {
    const ok = await confirm({
      title: "Delete this chat?",
      body: "This removes the chat and all its sources. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const remaining = removeChat(id);
    setChats(remaining);
    await deleteChat(id);
    toast("Chat deleted", "info");
    if (id !== activeId) return;
    if (remaining.length > 0) {
      setActiveId(remaining[0].id);
      setActive(remaining[0].id);
      setTab("chat");
      await loadChat(remaining[0].id);
    } else {
      await newChat();
    }
  }

  // ⌘K / Ctrl+K → new chat
  const newChatRef = useRef(() => {});
  newChatRef.current = newChat;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newChatRef.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!activeId) {
    return <div className="grid h-screen place-items-center text-gray-400">Loading…</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          S
        </span>
        <span className="font-semibold">Samasocial Learning Assistant</span>
        <span className="ml-auto hidden text-xs text-gray-400 sm:inline">⌘K new chat</span>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_1fr] lg:grid-cols-[240px_300px_1fr]">
        <div className="hidden border-r border-gray-200 md:block">
          <ChatList
            chats={chats}
            activeId={activeId}
            onSelect={switchChat}
            onNew={newChat}
            onDelete={handleDeleteChat}
          />
        </div>

        <div className="hidden border-r border-gray-200 lg:block">
          <SourcePanel
            sessionId={activeId}
            sources={sources}
            setSources={setSources}
            onSourceAdded={(s) => setSources((p) => [...p, s])}
          />
        </div>

        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
            <h1 className="mr-auto text-sm font-semibold text-gray-500">Workspace</h1>
          <button
            onClick={() => setTab("chat")}
            className={`rounded px-3 py-1 text-sm ${
              tab === "chat" ? "bg-indigo-600 text-white" : "text-gray-600"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setTab("quiz")}
            className={`rounded px-3 py-1 text-sm ${
              tab === "quiz" ? "bg-indigo-600 text-white" : "text-gray-600"
            }`}
          >
            Quiz
          </button>
        </div>
        {loading ? (
          <div className="grid flex-1 place-items-center text-sm text-gray-400">Loading chat…</div>
        ) : tab === "chat" ? (
          <ChatWindow
            key={activeId}
            sessionId={activeId}
            hasSources={sources.some((s) => s.status === "ready")}
            initialMessages={messages}
          />
        ) : (
          <QuizMode key={activeId} sessionId={activeId} sources={sources} />
        )}
        </div>
      </main>
    </div>
  );
}
