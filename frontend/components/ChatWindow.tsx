"use client";
import { useEffect, useRef, useState } from "react";

import { streamChat, transcribeAudio } from "@/lib/api";
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
  initialMessages = [],
}: {
  sessionId: string;
  hasSources: boolean;
  initialMessages?: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // detect mic + MediaRecorder support on the client (avoids SSR mismatch)
  useEffect(() => {
    setVoiceSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof window !== "undefined" &&
        "MediaRecorder" in window,
    );
  }, []);

  async function toggleRecording() {
    setVoiceError("");
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) setInput((prev) => (prev ? prev + " " : "") + text);
        } catch {
          setVoiceError("Couldn't transcribe that — please try again.");
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setVoiceError("Microphone access was denied.");
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function runTurn(text: string) {
    setBusy(true);
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
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <div className="max-w-md rounded-2xl bg-bot px-4 py-3 text-sm text-fg shadow-sm">
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
                    className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20"
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
      <div className="border-t border-border p-3">
        {voiceError && <p className="mb-1 text-xs text-danger">{voiceError}</p>}
        {(busy || lastQuestion) && (
          <div className="mb-2 flex justify-center gap-2">
            {busy ? (
              <button
                onClick={stop}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:bg-card-hover"
              >
                ⏹ Stop
              </button>
            ) : (
              <button
                onClick={regenerate}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:bg-card-hover"
              >
                ↻ Regenerate
              </button>
            )}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendText(input);
          }}
          className="flex gap-2"
        >
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={busy || transcribing}
              title={recording ? "Stop recording" : "Speak your message"}
              className={`rounded-full px-3 py-2 text-sm transition disabled:opacity-50 ${
                recording
                  ? "animate-pulse bg-danger text-white"
                  : "border border-border text-muted hover:bg-card-hover"
              }`}
            >
              {transcribing ? "…" : recording ? "■" : "🎤"}
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              recording
                ? "Listening… click ■ to stop"
                : transcribing
                  ? "Transcribing…"
                  : "Message your learning assistant…"
            }
            className="min-w-0 flex-1 rounded-full border border-border bg-input px-4 py-2 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            disabled={busy || !input.trim()}
            className="rounded-full bg-accent px-5 py-2 text-sm text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
