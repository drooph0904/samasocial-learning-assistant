"use client";
import { useState } from "react";

import { addFileSource, addUrlSource } from "@/lib/api";
import { Source } from "@/lib/types";

export function AddSourceForm({
  sessionId,
  onAdded,
}: {
  sessionId: string;
  onAdded: (s: Source) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isYoutube = (u: string) => /youtube\.com|youtu\.be/.test(u);

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError("");
    try {
      const s = await addUrlSource(sessionId, isYoutube(url) ? "youtube" : "webpage", url.trim());
      onAdded(s);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add source");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onAdded(await addFileSource(sessionId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={submitUrl} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="YouTube or webpage URL"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          disabled={busy}
          className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      <label className="block cursor-pointer rounded border border-dashed border-gray-300 p-3 text-center text-sm text-gray-500 hover:bg-gray-50">
        {busy ? "Working…" : "Upload PDF or PPTX"}
        <input type="file" accept=".pdf,.pptx" hidden onChange={onFile} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
