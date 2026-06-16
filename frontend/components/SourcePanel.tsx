"use client";
import { useEffect } from "react";

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
}: {
  sessionId: string;
  sources: Source[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
  onSourceAdded: (s: Source) => void;
  onQuizSource?: (s: Source) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();

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
      <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
        Sources {sources.length > 0 && <span className="text-faint">({readyCount} ready)</span>}
      </h2>
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
          />
        ))}
      </div>
    </div>
  );
}
