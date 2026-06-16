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
  snippet?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  chips?: Chip[];
}

export interface QuizQuestionPublic {
  id: string;
  type: "mcq" | "written";
  question: string;
  source?: string;
  options?: string[];
}

export interface GeneratedQuiz {
  quiz_id: string;
  hints_total: number;
  questions: QuizQuestionPublic[];
}

export interface QuizResult {
  id: string;
  type: "mcq" | "written";
  verdict: "correct" | "partial" | "incorrect";
  your_answer: string;
  correct_answer: string;
  feedback?: string;
  explanation?: string;
}

export interface GradeResponse {
  results: QuizResult[];
  score: { correct: number; partial: number; total: number; points: number };
}

export interface AnswerKeyItem {
  id: string;
  type: "mcq" | "written";
  question: string;
  correct_answer: string;
  explanation?: string;
  source?: string;
}

export interface QuizSelection {
  source_id: string;
  mcq_count: number;
  written_count: number;
}

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: number;
  // sorted set of ready source ids the title was generated for; lets us avoid
  // regenerating the title unless the chat's sources actually changed
  titleKey?: string;
}
