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
  // poll any sources still processing until they settle
  useEffect(() => {
    const processing = sources.filter((s) => s.status === "processing");
    if (processing.length === 0) return;
    const t = setInterval(async () => {
      const updated = await Promise.all(processing.map((s) => getSource(s.id)));
      setSources((prev) => prev.map((s) => updated.find((u) => u.id === s.id) || s));
    }, 2500);
    return () => clearInterval(t);
  }, [sources, setSources]);

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
