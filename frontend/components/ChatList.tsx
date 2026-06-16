"use client";
import { useState } from "react";

import { ChatMeta } from "@/lib/types";

export function ChatList({
  chats,
  activeId,
  onSelect,
  onNew,
}: {
  chats: ChatMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
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
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
              c.id === activeId
                ? "bg-indigo-100 font-medium text-indigo-800"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            title={c.title}
          >
            {c.title}
          </button>
        ))}
      </div>
    </div>
  );
}
