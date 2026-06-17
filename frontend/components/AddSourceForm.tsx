"use client";
import { Upload } from "lucide-react";
import { useState } from "react";

import { addFileSource, addUrlSource } from "@/lib/api";
import { Source } from "@/lib/types";
import { useToast } from "./ui/Toast";

export function AddSourceForm({
  sessionId,
  onAdded,
}: {
  sessionId: string;
  onAdded: (s: Source) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const isYoutube = (u: string) => /youtube\.com|youtu\.be/.test(u);

  async function uploadFile(file: File) {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (![".pdf", ".pptx"].includes(ext)) {
      setError("Only PDF and PPTX files are supported.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onAdded(await addFileSource(sessionId, file));
      toast(`Added ${file.name}`, "info");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

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
    if (file) await uploadFile(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <form onSubmit={submitUrl} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="YouTube or webpage URL"
          className="min-w-0 flex-1 rounded-lg border border-border bg-input px-2.5 py-1.5 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          disabled={busy}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          Add
        </button>
      </form>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) uploadFile(f);
        }}
        className={`block cursor-pointer rounded-lg border-2 border-dashed p-4 text-center text-sm transition ${
          dragging
            ? "border-accent bg-accent/10 text-accent"
            : "border-border text-faint hover:bg-card-hover"
        }`}
      >
        <span className="flex items-center justify-center gap-1.5">
          <Upload size={14} />
          {busy ? "Working…" : dragging ? "Drop to upload" : "Drag a PDF/PPTX here, or click"}
        </span>
        <input type="file" accept=".pdf,.pptx" hidden onChange={onFile} />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
