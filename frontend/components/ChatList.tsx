"use client";
import { useState } from "react";

import { ChatMeta } from "@/lib/types";

export function ChatList({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  chats: ChatMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="flex h-full flex-col bg-panel-2">
      <div className="space-y-2 p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover"
        >
          + New chat
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className="w-full rounded-lg border border-border bg-input px-3 py-1.5 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-faint">
            {chats.length === 0 ? "No chats yet" : "No chats match your search"}
          </p>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center rounded-lg transition ${
              c.id === activeId ? "bg-card text-fg" : "text-muted hover:bg-card-hover hover:text-fg"
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                c.id === activeId ? "font-medium" : ""
              }`}
              title={c.title}
            >
              {c.title}
            </button>
            <button
              onClick={() => onDelete(c.id)}
              title="Delete chat and its sources"
              className="px-2 text-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
