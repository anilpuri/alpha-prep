// ── Exam concept ──────────────────────────────────────────────────────────────

export interface Exam {
  id: string;
  name: string;         // "SSC Combined Graduate Level"
  shortName: string;    // "SSC CGL"
  color: string;
  totalQuestions: number;
}

export const EXAMS: Record<string, Exam> = {
  ssc_cgl: {
    id: "ssc_cgl",
    name: "SSC Combined Graduate Level",
    shortName: "SSC CGL",
    color: "#6C63FF",
    totalQuestions: 25932,
  },
};

export const DEFAULT_EXAM_ID = "ssc_cgl";

// ── Questions ─────────────────────────────────────────────────────────────────

export interface QuestionOption {
  id: number;
  value: string;
}

export interface Question {
  qid: number;
  question: string;
  options: QuestionOption[];
  answer: number[];
  explanation: string;
  marks: { positive: number; negative: number };
  is_math: boolean;
}

export interface TreeNode {
  name: string;
  topicId?: string;   // present only on leaves
  count?: number;     // questions in this leaf
  parts?: number;     // number of bank chunks
  leaf?: boolean;
  children?: TreeNode[];
}

export interface Tree {
  subjects: TreeNode[];
}

export type TestMode = "practice" | "exam" | "free";
export type QuestionPool = "unattempted" | "attempted" | "wrong" | "bookmarked" | "all";

export interface TestConfig {
  examId: string;       // e.g. "ssc_cgl"
  topicId: string;
  topicName: string;
  subject: string;
  nQuestions: number;
  mode: TestMode;
  pool: QuestionPool;
}

export interface PerQuestionResult {
  qid: number;
  selected: number | null;  // option id chosen, null = skipped
  correct: boolean;
  timeSec: number;
}

export interface Attempt {
  id?: string;
  examId?: string;      // optional for backward compat; defaults to "ssc_cgl"
  topicId: string;
  topicName: string;
  subject: string;
  mode: TestMode;
  nQuestions: number;
  timeAllowedSec: number;
  timeTakenSec: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;          // marks-based score
  maxScore: number;
  accuracy: number;       // correct / answered (%)
  speedSecPerQ: number;   // avg seconds per attempted question
  perQuestion: PerQuestionResult[];
  createdAt: number;      // epoch ms
}

export interface TopicStats {
  topicId: string;
  topicName: string;
  subject: string;
  attempts: number;
  totalQ: number;
  correct: number;
  wrong: number;
  skipped: number;
  totalTimeSec: number;
  accuracy: number;
  speedSecPerQ: number;
  lastAttempt: number;
}
