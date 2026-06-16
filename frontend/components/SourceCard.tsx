"use client";
import { useState } from "react";

import { Source } from "@/lib/types";

const ICON: Record<string, string> = { pdf: "📄", pptx: "▭", youtube: "▶", webpage: "🌐" };
const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  pptx: "Slides",
  youtube: "YouTube",
  webpage: "Web page",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export function SourceCard({
  source,
  onDelete,
  onRetry,
  onQuiz,
}: {
  source: Source;
  onDelete: (id: string) => void;
  onRetry?: (s: Source) => void;
  onQuiz?: (s: Source) => void;
}) {
  const [open, setOpen] = useState(false);
  const canRetry = source.status === "error" && (source.type === "youtube" || source.type === "webpage");

  return (
    <>
      <div className="group rounded-xl border border-border bg-card p-3 text-sm transition hover:bg-card-hover">
        <button
          onClick={() => source.status === "ready" && setOpen(true)}
          disabled={source.status !== "ready"}
          className="w-full text-left disabled:cursor-default"
        >
          <div className="flex items-center gap-2 font-medium text-fg">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-input text-xs">
              {ICON[source.type]}
            </span>
            <span className="min-w-0 flex-1 truncate">{source.title || source.type}</span>
            {source.status === "ready" && <span className="text-[11px] font-semibold text-success">● ready</span>}
            {source.status === "processing" && (
              <span className="text-[11px] font-semibold text-warning">processing</span>
            )}
            {source.status === "error" && <span className="text-[11px] font-semibold text-danger">● error</span>}
          </div>
          {source.status === "ready" && source.summary && (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{source.summary}</p>
          )}
        </button>

        {source.status === "processing" && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-input">
              <div className="h-full w-1/3 animate-[loading_1.2s_ease-in-out_infinite] rounded-full bg-warning" />
            </div>
          </div>
        )}
        {source.error && <p className="mt-2 text-xs text-danger">{source.error}</p>}

        <div className="mt-2.5 flex gap-1.5">
          {source.status === "ready" && (
            <button
              onClick={() => setOpen(true)}
              className="flex-1 rounded-lg border border-accent/40 bg-input py-1.5 text-xs text-accent transition hover:bg-accent/10"
            >
              👁 Details
            </button>
          )}
          {canRetry && onRetry && (
            <button
              onClick={() => onRetry(source)}
              className="flex-1 rounded-lg border border-border bg-input py-1.5 text-xs text-muted transition hover:bg-card-hover"
            >
              ↻ Retry
            </button>
          )}
          <button
            onClick={() => onDelete(source.id)}
            className="flex-1 rounded-lg border border-border bg-input py-1.5 text-xs text-muted transition hover:text-danger"
          >
            ⌫ Remove
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-[520px] rounded-2xl border border-border bg-panel-2 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                {ICON[source.type]} {TYPE_LABEL[source.type]}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto grid h-7 w-7 place-items-center rounded-lg bg-input text-muted hover:text-fg"
              >
                ✕
              </button>
            </div>
            <h3 className="mt-3 text-lg font-semibold leading-snug text-fg">{source.title || source.type}</h3>
            <div className="mt-2 flex gap-3 text-xs text-faint">
              {source.created_at && <span>Added {fmtDate(source.created_at)}</span>}
              <span>·</span>
              <span>{TYPE_LABEL[source.type]}</span>
            </div>
            {source.summary && (
              <p className="mt-3 text-sm leading-relaxed text-muted">{source.summary}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {onQuiz && (
                <button
                  onClick={() => {
                    onQuiz(source);
                    setOpen(false);
                  }}
                  className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-on-accent transition hover:bg-accent-hover"
                >
                  📝 Quiz me on this source
                </button>
              )}
              <button
                onClick={() => {
                  onDelete(source.id);
                  setOpen(false);
                }}
                className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2 text-sm text-danger transition hover:bg-danger/20"
              >
                ⌫ Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
