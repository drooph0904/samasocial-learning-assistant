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
    <div className="flex h-full flex-col bg-gray-50">
      <div className="space-y-2 p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + New chat
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-gray-400">
            {chats.length === 0 ? "No chats yet" : "No chats match your search"}
          </p>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center rounded-lg ${
              c.id === activeId ? "bg-indigo-100" : "hover:bg-gray-100"
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                c.id === activeId ? "font-medium text-indigo-800" : "text-gray-700"
              }`}
              title={c.title}
            >
              {c.title}
            </button>
            <button
              onClick={() => onDelete(c.id)}
              title="Delete chat and its sources"
              className="px-2 text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
