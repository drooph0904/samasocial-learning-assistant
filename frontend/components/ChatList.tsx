"use client";
import { Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { ChatMeta } from "@/lib/types";

export function ChatList({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onDeleteMany,
}: {
  chats: ChatMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(id: string) {
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

  async function deleteSelected() {
    if (selected.size === 0) return;
    await onDeleteMany([...selected]);
    exitSelect();
  }

  return (
    <div className="flex h-full flex-col bg-panel-2">
      <div className="space-y-2 p-3">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent shadow-sm transition hover:bg-accent-hover"
        >
          <Plus size={16} /> New chat
        </button>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="w-full rounded-lg border border-border bg-input py-1.5 pl-8 pr-3 text-sm text-fg placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="flex items-center justify-between px-1 text-xs">
          {selectMode ? (
            <>
              <button
                onClick={deleteSelected}
                disabled={selected.size === 0}
                className="flex items-center gap-1 font-medium text-danger disabled:opacity-40"
              >
                <Trash2 size={13} /> Delete {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
              <button onClick={exitSelect} className="text-faint hover:text-fg">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              disabled={chats.length === 0}
              className="ml-auto text-faint hover:text-fg disabled:opacity-40"
            >
              Select
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-faint">
            {chats.length === 0 ? "No chats yet" : "No chats match your search"}
          </p>
        )}
        {filtered.map((c) => {
          const isSel = selected.has(c.id);
          return (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg transition ${
                selectMode && isSel
                  ? "bg-accent/15"
                  : c.id === activeId && !selectMode
                    ? "bg-card text-fg"
                    : "text-muted hover:bg-card-hover hover:text-fg"
              }`}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggle(c.id)}
                  className="ml-3 h-4 w-4 flex-none accent-accent"
                />
              )}
              <button
                onClick={() => (selectMode ? toggle(c.id) : onSelect(c.id))}
                className={`min-w-0 flex-1 truncate px-3 py-2 text-left text-sm ${
                  c.id === activeId && !selectMode ? "font-medium" : ""
                }`}
                title={c.title}
              >
                {c.title}
              </button>
              {!selectMode && (
                <button
                  onClick={() => onDelete(c.id)}
                  title="Delete chat and its sources"
                  className="grid h-7 w-7 flex-none place-items-center text-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
