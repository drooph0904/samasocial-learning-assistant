import { Message } from "@/lib/types";

export function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isUser ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        <p className="whitespace-pre-wrap">{msg.content || "…"}</p>
        {msg.chips && msg.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {msg.chips.map((c, i) => (
              <span
                key={i}
                className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-gray-700 ring-1 ring-gray-300"
              >
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
