"use client";
import { useCallback, useEffect, useState } from "react";

import { ChatSwitcher } from "@/components/ChatSwitcher";
import { ChatWindow } from "@/components/ChatWindow";
import { QuizMode } from "@/components/QuizMode";
import { SourcePanel } from "@/components/SourcePanel";
import { getMessages, listSources } from "@/lib/api";
import {
  createChat,
  ensureActiveChat,
  getChats,
  renameChat,
  setActiveId,
} from "@/lib/session";
import { ChatMeta, Message, Source } from "@/lib/types";

export default function Home() {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeId, setActive] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<"chat" | "quiz">("chat");
  const [loading, setLoading] = useState(true);

  // Load a chat's sources + message history.
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

  // Give a fresh "New chat" a meaningful title from its first source.
  function handleSourceAdded(s: Source) {
    setSources((p) => [...p, s]);
    const active = chats.find((c) => c.id === activeId);
    if (active && active.title === "New chat") {
      const title = (s.title || s.type).slice(0, 40);
      renameChat(activeId, title);
      setChats(getChats());
    }
  }

  if (!activeId) {
    return <div className="grid h-screen place-items-center text-gray-400">Loading…</div>;
  }

  return (
    <main className="grid h-screen grid-cols-[320px_1fr]">
      <div className="flex h-full flex-col border-r border-gray-200">
        <div className="border-b border-gray-200 p-3">
          <ChatSwitcher chats={chats} activeId={activeId} onSelect={switchChat} onNew={newChat} />
        </div>
        <div className="min-h-0 flex-1">
          <SourcePanel
            sessionId={activeId}
            sources={sources}
            setSources={setSources}
            onSourceAdded={handleSourceAdded}
          />
        </div>
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
