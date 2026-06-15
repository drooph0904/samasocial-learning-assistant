import { Source } from "@/lib/types";

const ICON: Record<string, string> = {
  pdf: "📄",
  pptx: "▭",
  youtube: "▶",
  webpage: "🌐",
};

export function SourceCard({ source }: { source: Source }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <span>{ICON[source.type]}</span>
        <span className="truncate">{source.title || source.type}</span>
        {source.status === "processing" && (
          <span className="ml-auto animate-pulse whitespace-nowrap text-amber-500">processing…</span>
        )}
        {source.status === "ready" && (
          <span className="ml-auto whitespace-nowrap text-green-600">ready</span>
        )}
        {source.status === "error" && (
          <span className="ml-auto whitespace-nowrap text-red-600">error</span>
        )}
      </div>
      {source.summary && <p className="mt-2 text-gray-600">{source.summary}</p>}
      {source.error && <p className="mt-2 text-red-600">{source.error}</p>}
    </div>
  );
}
