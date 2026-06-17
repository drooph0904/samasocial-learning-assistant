"use client";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { addUrlSource, deleteSource, getSource } from "@/lib/api";
import { Source } from "@/lib/types";

import { AddSourceForm } from "./AddSourceForm";
import { SourceCard } from "./SourceCard";
import { useConfirm } from "./ui/Confirm";
import { useToast } from "./ui/Toast";

export function SourcePanel({
  sessionId,
  sources,
  setSources,
  onSourceAdded,
  onQuizSource,
  onCollapse,
}: {
  sessionId: string;
  sources: Source[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
  onSourceAdded: (s: Source) => void;
  onQuizSource?: (s: Source) => void;
  onCollapse?: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return;
    const ids = [...selected];
    const ok = await confirm({
      title: `Remove ${ids.length} source${ids.length === 1 ? "" : "s"}?`,
      body: "Their content will be deleted from this chat.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setSources((prev) => prev.filter((s) => !selected.has(s.id)));
    for (const id of ids) await deleteSource(id);
    toast(`Removed ${ids.length} source${ids.length === 1 ? "" : "s"}`, "info");
    exitSelect();
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Remove this source?",
      body: "Its content will be deleted from this chat.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setSources((prev) => prev.filter((s) => s.id !== id));
    await deleteSource(id);
    toast("Source removed", "info");
  }

  async function handleRetry(s: Source) {
    // url sources keep their URL as the title while errored, so we can re-ingest
    setSources((prev) => prev.filter((x) => x.id !== s.id));
    await deleteSource(s.id);
    try {
      const fresh = await addUrlSource(sessionId, s.type, s.title || "");
      onSourceAdded(fresh);
      toast("Retrying…", "info");
    } catch {
      toast("Couldn't retry that source", "error");
    }
  }

  // notify when a processing source settles
  useEffect(() => {
    const processing = sources.filter((s) => s.status === "processing");
    if (processing.length === 0) return;
    const ids = processing.map((s) => s.id).sort().join(",");
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const updated = await Promise.all(ids.split(",").map((id) => getSource(id)));
        if (cancelled) return;
        updated.forEach((u) => {
          if (u.status === "ready") toast(`“${u.title}” is ready`, "success");
          else if (u.status === "error") toast(`“${u.title}” failed to process`, "error");
        });
        setSources((prev) => prev.map((s) => updated.find((u) => u.id === s.id) || s));
      } finally {
        inFlight = false;
      }
    };
    const t = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.filter((s) => s.status === "processing").map((s) => s.id).sort().join(",")]);

  const readyCount = sources.filter((s) => s.status === "ready").length;

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Sources {sources.length > 0 && <span>· {readyCount} ready</span>}
        </h2>
        {sources.length > 0 &&
          (selectMode ? (
            <div className="ml-auto flex items-center gap-2 text-xs">
              <button
                onClick={handleDeleteSelected}
                disabled={selected.size === 0}
                className="flex items-center gap-1 font-medium text-danger disabled:opacity-40"
              >
                <Trash2 size={13} /> Delete {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
              <button onClick={exitSelect} className="text-faint hover:text-fg">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="ml-auto text-xs text-faint hover:text-fg"
            >
              Select
            </button>
          ))}
        {onCollapse && !selectMode && (
          <button
            onClick={onCollapse}
            title="Collapse sources"
            className="rounded-md border border-border bg-input px-2 py-0.5 text-xs text-muted hover:text-fg"
          >
            ⟨
          </button>
        )}
      </div>
      <AddSourceForm sessionId={sessionId} onAdded={onSourceAdded} />
      <div className="flex-1 space-y-2 overflow-y-auto">
        {sources.length === 0 && (
          <p className="mt-6 text-center text-sm text-faint">No sources yet. Add one to begin.</p>
        )}
        {sources.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            onDelete={handleDelete}
            onRetry={handleRetry}
            onQuiz={onQuizSource}
            selectMode={selectMode}
            selected={selected.has(s.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </div>
  );
}
