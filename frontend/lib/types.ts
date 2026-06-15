export type SourceStatus = "processing" | "ready" | "error";
export type SourceType = "pdf" | "pptx" | "youtube" | "webpage";

export interface Source {
  id: string;
  type: SourceType;
  title: string | null;
  summary: string | null;
  status: SourceStatus;
  error: string | null;
}

export interface Chip {
  label: string;
  icon: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  chips?: Chip[];
}

export interface QuizQuestion {
  question: string;
  answer: string;
}
