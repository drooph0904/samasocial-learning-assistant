"use client";
import { useState } from "react";

import { Source } from "@/lib/types";

import { Modal } from "./ui/Modal";

const ICON: Record<string, string> = { pdf: "📄", pptx: "▭", youtube: "▶", webpage: "🌐" };

export function SourceCard({
  source,
  onDelete,
  onRetry,
}: {
  source: Source;
  onDelete: (id: string) => void;
  onRetry?: (s: Source) => void;
}) {
  const [showSummary, setShowSummary] = useState(false);
  const canRetry = source.status === "error" && (source.type === "youtube" || source.type === "webpage");

  return (
    <div className="group rounded-lg border border-border bg-card p-3 text-sm shadow-sm transition hover:bg-card-hover">
      <div className="flex items-center gap-2 font-medium text-fg">
        <span>{ICON[source.type]}</span>
        <span className="min-w-0 flex-1 truncate">{source.title || source.type}</span>
        {source.status === "ready" && <span className="whitespace-nowrap text-xs text-success">✓ ready</span>}
        {source.status === "error" && <span className="whitespace-nowrap text-xs text-danger">⚠ error</span>}
        {source.status === "ready" && source.summary && (
          <button
            onClick={() => setShowSummary(true)}
            title="View summary"
            className="text-faint hover:text-accent"
          >
            👁
          </button>
        )}
        {canRetry && onRetry && (
          <button onClick={() => onRetry(source)} title="Retry" className="text-faint hover:text-accent">
            ↻
          </button>
        )}
        <button
          onClick={() => onDelete(source.id)}
          title="Remove this source"
          className="text-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
        >
          ✕
        </button>
      </div>

      {source.status === "processing" && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
            <div className="h-full w-1/3 animate-[loading_1.2s_ease-in-out_infinite] rounded-full bg-warning" />
          </div>
          <p className="mt-1 text-xs text-warning">Processing…</p>
        </div>
      )}

      {source.status === "ready" && source.summary && (
        <p className="mt-2 line-clamp-2 text-muted">{source.summary}</p>
      )}
      {source.error && <p className="mt-2 text-danger">{source.error}</p>}

      {showSummary && (
        <Modal title={source.title || "Source summary"} onClose={() => setShowSummary(false)}>
          <p className="whitespace-pre-wrap text-sm text-muted">{source.summary}</p>
        </Modal>
      )}
    </div>
  );
}
