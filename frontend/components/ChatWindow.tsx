"use client";
import { useEffect, useRef, useState } from "react";

import { streamChat } from "@/lib/api";
import { Message } from "@/lib/types";

import { MessageBubble } from "./MessageBubble";

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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
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
          <p className="mt-10 text-center text-sm text-gray-400">
            {hasSources
              ? "Ask anything about your sources."
              : "Add a source on the left, then ask a question."}
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-gray-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder="Ask a question…"
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
