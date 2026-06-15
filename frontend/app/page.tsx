"use client";
import { useEffect, useState } from "react";

import { ChatWindow } from "@/components/ChatWindow";
import { QuizMode } from "@/components/QuizMode";
import { SourcePanel } from "@/components/SourcePanel";
import { listSources } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { Source } from "@/lib/types";

export default function Home() {
  const [sessionId, setSessionId] = useState<string>("");
  const [sources, setSources] = useState<Source[]>([]);
  const [tab, setTab] = useState<"chat" | "quiz">("chat");

  useEffect(() => {
    getSessionId().then(async (id) => {
      setSessionId(id);
      setSources(await listSources(id));
    });
  }, []);

  if (!sessionId) {
    return <div className="grid h-screen place-items-center text-gray-400">Loading…</div>;
  }

  return (
    <main className="grid h-screen grid-cols-[320px_1fr]">
      <SourcePanel sessionId={sessionId} sources={sources} setSources={setSources} />
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
        {tab === "chat" ? (
          <ChatWindow
            sessionId={sessionId}
            hasSources={sources.some((s) => s.status === "ready")}
          />
        ) : (
          <QuizMode sessionId={sessionId} />
        )}
      </div>
    </main>
  );
}
