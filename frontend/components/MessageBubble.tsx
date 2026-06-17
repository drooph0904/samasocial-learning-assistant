"use client";
import { Check, Copy } from "lucide-react";
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Chip, Message } from "@/lib/types";

import { Modal } from "./ui/Modal";

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-chat space-y-2 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
          code: ({ className, children }) => {
            const block = (className || "").includes("language-");
            return block ? (
              <code className="block overflow-x-auto rounded-md bg-gray-900 p-3 font-mono text-xs text-gray-100">
                {children}
              </code>
            ) : (
              <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.8em]">{children}</code>
            );
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  streaming = false,
}: {
  msg: Message;
  streaming?: boolean;
}) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<Chip | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`group flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-xs font-bold text-white">
          S
        </div>
      )}
      <div
        className={`rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "max-w-[78%] bg-accent text-on-accent"
            : "max-w-full border border-border bg-bot text-fg"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : msg.content ? (
          // Render plain text while still streaming (cheap), full Markdown once done.
          streaming ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <Markdown text={msg.content} />
          )
        ) : (
          <span className="inline-block h-3 w-2 animate-pulse bg-faint align-middle" />
        )}

        {msg.chips && msg.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {msg.chips.map((c, i) => (
              <button
                key={i}
                onClick={() => c.snippet && setPreview(c)}
                disabled={!c.snippet}
                title={c.snippet ? "Show source" : undefined}
                className={`rounded-full px-2 py-0.5 text-xs ring-1 transition ${
                  isUser
                    ? "bg-white/15 text-on-accent ring-white/25 enabled:hover:bg-white/25"
                    : "bg-app/60 text-muted ring-border enabled:hover:text-accent enabled:hover:ring-accent/50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {!isUser && msg.content && (
          <button
            onClick={copy}
            className="mt-1 flex items-center gap-1 text-xs text-faint opacity-0 transition hover:text-fg group-hover:opacity-100"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "copied" : "copy"}
          </button>
        )}
      </div>

      {preview && (
        <Modal title={preview.label} onClose={() => setPreview(null)}>
          <p className="whitespace-pre-wrap text-sm text-muted">“{preview.snippet}…”</p>
        </Modal>
      )}
    </div>
  );
});
