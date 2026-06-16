"use client";
import { useEffect, useRef, useState } from "react";

import { ChatMeta } from "@/lib/types";

export function ChatSwitcher({
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = chats.find((c) => c.id === activeId);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div ref={ref} className="relative flex-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded border border-gray-300 px-3 py-1.5 text-sm"
        >
          <span className="truncate">{active?.title || "Chat"}</span>
          <span className="ml-2 text-gray-400">▾</span>
        </button>
        {open && (
          <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {chats.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                }}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  c.id === activeId ? "bg-indigo-50 text-indigo-700" : "text-gray-700"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onNew}
        title="New chat"
        className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
      >
        + New
      </button>
    </div>
  );
}
