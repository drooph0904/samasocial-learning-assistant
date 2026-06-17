"use client";
import { ChevronRight, ClipboardList, MessageSquare, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatList } from "@/components/ChatList";
import { ChatWindow } from "@/components/ChatWindow";
import { QuizMode } from "@/components/QuizMode";
import { SourcePanel } from "@/components/SourcePanel";
import { useConfirm } from "@/components/ui/Confirm";
import { useTheme } from "@/components/ui/Theme";
import { useToast } from "@/components/ui/Toast";
import { deleteChat, getMessages, getSessionTitle, listSources } from "@/lib/api";
import {
  createChat,
  ensureActiveChat,
  getChats,
  removeChat,
  setActiveId,
  setChatTitle,
} from "@/lib/session";
import { SOURCE_ICON } from "@/lib/sourceIcons";
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
  const [quizPreselect, setQuizPreselect] = useState<string | null>(null);
  const [srcCollapsed, setSrcCollapsed] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  // Show the correct shortcut hint per platform (⌘ on Mac, Ctrl elsewhere).
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);

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

  async function handleDeleteChats(ids: string[]) {
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Delete ${ids.length} chat${ids.length === 1 ? "" : "s"}?`,
      body: "This removes the selected chats and all their sources. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    let remaining = getChats();
    for (const id of ids) {
      remaining = removeChat(id);
      await deleteChat(id);
    }
    setChats(remaining);
    toast(`Deleted ${ids.length} chat${ids.length === 1 ? "" : "s"}`, "info");
    if (ids.includes(activeId)) {
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
        setActive(remaining[0].id);
        setTab("chat");
        await loadChat(remaining[0].id);
      } else {
        await newChat();
      }
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
    return <div className="grid h-screen place-items-center bg-app text-faint">Loading…</div>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app text-fg">
      <header className="flex items-center gap-2 border-b border-border bg-panel px-4 py-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-sm font-bold text-white shadow-sm">
          S
        </span>
        <span className="font-semibold">Samasocial Learning Assistant</span>
        <span className="ml-auto hidden text-xs text-faint sm:inline">
          {isMac ? "⌘K" : "Ctrl+K"} new chat
        </span>
        <ThemeToggle />
      </header>
      <main
        className={`grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_1fr] ${
          srcCollapsed ? "lg:grid-cols-[240px_52px_1fr]" : "lg:grid-cols-[240px_320px_1fr]"
        }`}
      >
        <div className="hidden min-h-0 md:block">
          <ChatList
            chats={chats}
            activeId={activeId}
            onSelect={switchChat}
            onNew={newChat}
            onDelete={handleDeleteChat}
            onDeleteMany={handleDeleteChats}
          />
        </div>

        <div className="hidden min-h-0 border-l border-border bg-panel lg:block">
          {srcCollapsed ? (
            <div className="flex h-full flex-col items-center gap-2 p-2">
              <button
                onClick={() => setSrcCollapsed(false)}
                title="Expand sources"
                className="grid h-8 w-8 place-items-center rounded-md border border-border bg-input text-muted hover:text-fg"
              >
                <ChevronRight size={16} />
              </button>
              {sources.map((s) => {
                const Ic = SOURCE_ICON[s.type];
                return (
                  <span
                    key={s.id}
                    title={s.title || s.type}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-card text-muted"
                  >
                    <Ic size={15} />
                  </span>
                );
              })}
            </div>
          ) : (
            <SourcePanel
              sessionId={activeId}
              sources={sources}
              setSources={setSources}
              onSourceAdded={(s) => setSources((p) => [...p, s])}
              onQuizSource={(s) => {
                setQuizPreselect(s.id);
                setTab("quiz");
              }}
              onCollapse={() => setSrcCollapsed(true)}
            />
          )}
        </div>

        <div className="flex h-full min-h-0 flex-col border-l border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <h1 className="mr-auto text-xs font-semibold uppercase tracking-wide text-faint">
              Workspace
            </h1>
            <button
              onClick={() => setTab("chat")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition ${
                tab === "chat" ? "bg-accent text-on-accent" : "text-muted hover:bg-card-hover"
              }`}
            >
              <MessageSquare size={15} /> Chat
            </button>
            <button
              onClick={() => {
                setQuizPreselect(null);
                setTab("quiz");
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition ${
                tab === "quiz" ? "bg-accent text-on-accent" : "text-muted hover:bg-card-hover"
              }`}
            >
              <ClipboardList size={15} /> Quiz
            </button>
          </div>
          {loading ? (
            <div className="grid flex-1 place-items-center text-sm text-faint">Loading chat…</div>
          ) : tab === "chat" ? (
            <ChatWindow
              key={activeId}
              sessionId={activeId}
              hasSources={sources.some((s) => s.status === "ready")}
              initialMessages={messages}
              onMakeQuiz={() => {
                setQuizPreselect(null);
                setTab("quiz");
              }}
            />
          ) : (
            <QuizMode
              key={activeId}
              sessionId={activeId}
              sources={sources}
              preselectSourceId={quizPreselect}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-card-hover hover:text-fg"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
