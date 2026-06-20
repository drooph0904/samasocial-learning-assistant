export type SourceStatus = "processing" | "ready" | "error";
export type SourceType = "pdf";

export interface Source {
  id: string;
  type: SourceType;
  title: string | null;
  summary: string | null;
  status: SourceStatus;
  error: string | null;
  created_at?: string | null;
}

export interface Chip {
  label: string;
  icon: string;
  snippet?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  chips?: Chip[];
}

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: number;
  // sorted set of ready source ids the title was generated for; lets us avoid
  // regenerating the title unless the chat's sources actually changed
  titleKey?: string;
}
