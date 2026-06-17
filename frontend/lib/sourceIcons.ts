import { FileText, Globe, Presentation, Video, type LucideIcon } from "lucide-react";

import type { SourceType } from "./types";

// Single source of truth for how each source type is shown across the app
// (source cards, quiz tags, collapsed rail).
export const SOURCE_ICON: Record<SourceType, LucideIcon> = {
  pdf: FileText,
  pptx: Presentation,
  youtube: Video,
  webpage: Globe,
};

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  pdf: "PDF",
  pptx: "Slides",
  youtube: "YouTube",
  webpage: "Web page",
};
