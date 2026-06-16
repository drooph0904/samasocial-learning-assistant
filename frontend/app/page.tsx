"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatList } from "@/components/ChatList";
import { ChatWindow } from "@/components/ChatWindow";
import { QuizMode } from "@/components/QuizMode";
import { SourcePanel } from "@/components/SourcePanel";
import { getMessages, getSessionTitle, listSources } from "@/lib/api";
import {
  createChat,
  ensureActiveChat,
  getChats,
  setActiveId,
  setChatTitle,
} from "@/lib/session";
import { ChatMeta, Message, Source } from "@/lib/types";

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

  const loadChat = useCallback(async (id: string) => {
    setLoading(true);
    const [srcs, msgs] = await Promise.all([listSources(id), getMessages(id)]);
    setSources(srcs);
    setMessages(msgs);
    setLoading(false);
  }, []);

  useEffect(() => {
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

  if (!activeId) {
    return <div className="grid h-screen place-items-center text-gray-400">Loading…</div>;
  }

  return (
    <main className="grid h-screen grid-cols-[240px_300px_1fr]">
      <div className="border-r border-gray-200">
        <ChatList chats={chats} activeId={activeId} onSelect={switchChat} onNew={newChat} />
      </div>

      <div className="border-r border-gray-200">
        <SourcePanel
          sessionId={activeId}
          sources={sources}
          setSources={setSources}
          onSourceAdded={(s) => setSources((p) => [...p, s])}
        />
      </div>

      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2">
          <h1 className="mr-auto font-semibold">Learning Assistant</h1>
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
  );
}
