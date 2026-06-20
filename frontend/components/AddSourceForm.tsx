"use client";
import { Upload } from "lucide-react";
import { useState } from "react";

import { addFileSource } from "@/lib/api";
import { Source } from "@/lib/types";
import { useToast } from "./ui/Toast";

export function AddSourceForm({
  sessionId,
  onAdded,
}: {
  sessionId: string;
  onAdded: (s: Source) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function uploadFile(file: File) {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (ext !== ".pdf") {
      setError("Only PDF files are supported.");
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
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
          {busy ? "Working…" : dragging ? "Drop to upload" : "Drag a PDF here, or click"}
        </span>
        <input type="file" accept=".pdf" hidden onChange={onFile} />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
