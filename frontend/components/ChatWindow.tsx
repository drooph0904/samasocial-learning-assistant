"use client";
import { useEffect, useRef, useState } from "react";

import { streamChat } from "@/lib/api";
import { Message } from "@/lib/types";

import { MessageBubble } from "./MessageBubble";

const STARTERS = [
  "Summarize my sources",
  "Explain the key idea simply",
  "What can you help me with?",
  "Quiz me on this",
];

export function ChatWindow({
  sessionId,
  hasSources,
}: {
  sessionId: string;
  hasSources: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendText(text: string) {
    text = text.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "", chips: [] },
    ]);
    try {
      await streamChat(
        sessionId,
        text,
        (chips) =>
          setMessages((m) => {
            const c = [...m];
            c[c.length - 1] = { ...c[c.length - 1], chips };
            return c;
          }),
        (tok) =>
          setMessages((m) => {
            const c = [...m];
            c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + tok };
            return c;
          }),
      );
    } catch {
      setMessages((m) => {
        const c = [...m];
        c[c.length - 1] = {
          ...c[c.length - 1],
          content: "Something went wrong. Please try again.",
        };
        return c;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <div className="max-w-md rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
              {hasSources ? (
                <>
                  👋 Hi! I&apos;m your learning assistant. I&apos;ve read your sources — ask me
                  anything about them, request a summary, or say &quot;quiz me&quot;. I&apos;ll
                  always point to where each answer comes from.
                </>
              ) : (
                <>
                  👋 Hi! Add a source on the left — a YouTube link, PDF, PPTX, or webpage URL — and
                  I&apos;ll help you understand it, answer questions, and quiz you on it.
                </>
              )}
            </div>
            {hasSources && (
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendText(s)}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendText(input);
        }}
        className="flex gap-2 border-t border-gray-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Message your learning assistant…"
          className="min-w-0 flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm"
        />
        <button
          disabled={busy || !input.trim()}
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
