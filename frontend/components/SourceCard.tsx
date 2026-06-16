import { Source } from "@/lib/types";

const ICON: Record<string, string> = {
  pdf: "📄",
  pptx: "▭",
  youtube: "▶",
  webpage: "🌐",
};

export function SourceCard({ source, onDelete }: { source: Source; onDelete: (id: string) => void }) {
  return (
    <div className="group rounded-lg border border-gray-200 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <span>{ICON[source.type]}</span>
        <span className="min-w-0 flex-1 truncate">{source.title || source.type}</span>
        {source.status === "processing" && (
          <span className="animate-pulse whitespace-nowrap text-amber-500">processing…</span>
        )}
        {source.status === "ready" && (
          <span className="whitespace-nowrap text-green-600">ready</span>
        )}
        {source.status === "error" && (
          <span className="whitespace-nowrap text-red-600">error</span>
        )}
        <button
          onClick={() => onDelete(source.id)}
          title="Remove this source"
          className="text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
        >
          ✕
        </button>
      </div>
      {source.summary && <p className="mt-2 text-gray-600">{source.summary}</p>}
      {source.error && <p className="mt-2 text-red-600">{source.error}</p>}
    </div>
  );
}
