"use client";
import { useState } from "react";
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
            <a href={href} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
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

export function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<Chip | null>(null);

  async function copy() {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
          isUser ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : msg.content ? (
          <Markdown text={msg.content} />
        ) : (
          <span className="inline-block h-3 w-2 animate-pulse bg-gray-400 align-middle" />
        )}

        {msg.chips && msg.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {msg.chips.map((c, i) => (
              <button
                key={i}
                onClick={() => c.snippet && setPreview(c)}
                disabled={!c.snippet}
                title={c.snippet ? "Show source" : undefined}
                className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-300 enabled:hover:bg-white enabled:hover:ring-indigo-300"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {!isUser && msg.content && (
          <button
            onClick={copy}
            className="mt-1 text-xs text-gray-400 opacity-0 transition hover:text-gray-700 group-hover:opacity-100"
          >
            {copied ? "✓ copied" : "⧉ copy"}
          </button>
        )}
      </div>

      {preview && (
        <Modal title={preview.label} onClose={() => setPreview(null)}>
          <p className="whitespace-pre-wrap text-sm text-gray-700">“{preview.snippet}…”</p>
        </Modal>
      )}
    </div>
  );
}
