"use client";
import { useEffect } from "react";

import { getSource } from "@/lib/api";
import { Source } from "@/lib/types";

import { AddSourceForm } from "./AddSourceForm";
import { SourceCard } from "./SourceCard";

export function SourcePanel({
  sessionId,
  sources,
  setSources,
}: {
  sessionId: string;
  sources: Source[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
}) {
  // Poll sources still processing until they settle. Key the effect on the
  // *set* of processing ids (a stable string) rather than the whole array, so
  // a new interval isn't created on every poll result — that previously stacked
  // pollers and flooded the backend.
  const processingKey = sources
    .filter((s) => s.status === "processing")
    .map((s) => s.id)
    .sort()
    .join(",");

  useEffect(() => {
    if (!processingKey) return;
    const ids = processingKey.split(",");
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return; // never overlap polls
      inFlight = true;
      try {
        const updated = await Promise.all(ids.map((id) => getSource(id)));
        if (!cancelled) {
          setSources((prev) => prev.map((s) => updated.find((u) => u.id === s.id) || s));
        }
      } finally {
        inFlight = false;
      }
    };
    const t = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [processingKey, setSources]);

  return (
    <div className="flex h-full flex-col gap-3 border-r border-gray-200 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Sources</h2>
      <AddSourceForm sessionId={sessionId} onAdded={(s) => setSources((p) => [...p, s])} />
      <div className="flex-1 space-y-2 overflow-y-auto">
        {sources.length === 0 && (
          <p className="text-sm text-gray-400">No sources yet. Add one to begin.</p>
        )}
        {sources.map((s) => (
          <SourceCard key={s.id} source={s} />
        ))}
      </div>
    </div>
  );
}
