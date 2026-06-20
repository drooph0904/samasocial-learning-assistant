import { FileText, type LucideIcon } from "lucide-react";

import type { SourceType } from "./types";

// Single source of truth for how each source type is shown across the app
// (source cards, collapsed rail).
export const SOURCE_ICON: Record<SourceType, LucideIcon> = {
  pdf: FileText,
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  pdf: "PDF",
};
