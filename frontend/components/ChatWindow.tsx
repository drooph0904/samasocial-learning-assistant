"use client";
import { RotateCcw, Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { streamChat } from "@/lib/api";
import { Message } from "@/lib/types";

import { MessageBubble } from "./MessageBubble";
import { useLoading } from "./ui/Loading";

export function ChatWindow({
  sessionId,
  hasSources,
  initialMessages = [],
}: {
  sessionId: string;
  hasSources: boolean;
  initialMessages?: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastQuestion, setLastQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { begin } = useLoading();

  // Keep pinned to the bottom during streaming — but instantly (no smooth-scroll
  // jank per token) and only if the user is already near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function runTurn(text: string) {
    setBusy(true);
    const endLoading = begin();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
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
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setMessages((m) => {
          const c = [...m];
          if (!c[c.length - 1].content) c[c.length - 1] = { ...c[c.length - 1], content: "⏹ Stopped." };
          return c;
        });
      } else {
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { ...c[c.length - 1], content: "Something went wrong. Please try again." };
          return c;
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      endLoading();
    }
  }

  async function sendText(text: string) {
    text = text.trim();
    if (!text || busy) return;
    setInput("");
    setLastQuestion(text);
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "", chips: [] },
    ]);
    await runTurn(text);
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function regenerate() {
    if (busy || !lastQuestion) return;
    // replace the last assistant message with a fresh empty one and re-run
    setMessages((m) => {
      const c = [...m];
      if (c.length && c[c.length - 1].role === "assistant") c.pop();
      return [...c, { role: "assistant", content: "", chips: [] }];
    });
    await runTurn(lastQuestion);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
          {messages.length === 0 && (
            <div className="mt-8 flex flex-col items-center gap-4 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-hover text-lg font-bold text-white">
                S
              </div>
              <div className="max-w-md text-sm text-muted">
                {hasSources ? (
                  <>
                    Hi! I&apos;ve read your sources — ask me anything about them, request a summary,
                    or use a quick action below. I&apos;ll always point to where each answer comes
                    from.
                  </>
                ) : (
                  <>
                    Add a PDF on the left and I&apos;ll help you understand it, answer questions,
                    and explore its content.
                  </>
                )}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              msg={m}
              streaming={busy && i === messages.length - 1 && m.role === "assistant"}
            />
          ))}
        </div>
      </div>
      <div className="border-t border-border p-4">
        <div className="mx-auto w-full max-w-[720px]">
          {(busy || lastQuestion) && (
            <div className="mb-2 flex justify-center gap-2">
              {busy ? (
                <button
                  onClick={stop}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:bg-card-hover"
                >
                  <Square size={12} /> Stop
                </button>
              ) : (
                <button
                  onClick={regenerate}
                  className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:bg-card-hover"
                >
                  <RotateCcw size={12} /> Regenerate
                </button>
              )}
            </div>
          )}
          {hasSources && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              <button
                onClick={() => sendText("Summarize my sources")}
                className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20"
              >
                <Sparkles size={13} /> Summarize my sources
              </button>
              <button
                onClick={() => sendText("What are the key concepts in my sources?")}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:bg-card-hover"
              >
                Key concepts
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText(input);
            }}
            className="flex gap-2"
          >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Message your learning assistant…"
            className="min-w-0 flex-1 rounded-full border border-border bg-input px-4 py-2 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            disabled={busy || !input.trim()}
            className="flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
            {!busy && <Send size={15} />}
          </button>
          </form>
        </div>
      </div>
    </div>
  );
}
