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
    <div className="group rounded-lg border border-gray-200 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <span>{ICON[source.type]}</span>
        <span className="min-w-0 flex-1 truncate">{source.title || source.type}</span>
        {source.status === "ready" && <span className="whitespace-nowrap text-green-600">✓ ready</span>}
        {source.status === "error" && <span className="whitespace-nowrap text-red-600">⚠ error</span>}
        {source.status === "ready" && source.summary && (
          <button
            onClick={() => setShowSummary(true)}
            title="View summary"
            className="text-gray-400 hover:text-indigo-600"
          >
            👁
          </button>
        )}
        {canRetry && onRetry && (
          <button onClick={() => onRetry(source)} title="Retry" className="text-gray-400 hover:text-indigo-600">
            ↻
          </button>
        )}
        <button
          onClick={() => onDelete(source.id)}
          title="Remove this source"
          className="text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
        >
          ✕
        </button>
      </div>

      {source.status === "processing" && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full w-1/3 animate-[loading_1.2s_ease-in-out_infinite] rounded-full bg-amber-400" />
          </div>
          <p className="mt-1 text-xs text-amber-600">Processing…</p>
        </div>
      )}

      {source.status === "ready" && source.summary && (
        <p className="mt-2 line-clamp-2 text-gray-600">{source.summary}</p>
      )}
      {source.error && <p className="mt-2 text-red-600">{source.error}</p>}

      {showSummary && (
        <Modal title={source.title || "Source summary"} onClose={() => setShowSummary(false)}>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{source.summary}</p>
        </Modal>
      )}
    </div>
  );
}
