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

// AI Paper section — one per subject
export interface AiSection {
  subject:    string;
  topicIds:   string[];
  topicNames: string[];
  nQuestions: number;
  timeSec:    number;    // per-section time allowance
}

export interface TestConfig {
  examId: string;       // e.g. "ssc_cgl"
  topicId: string;      // primary topic (single-topic tests; use "ai_paper" for AI papers)
  topicName: string;
  subject: string;
  nQuestions: number;
  mode: TestMode;
  pool: QuestionPool;
  // AI Paper extension
  sections?: AiSection[];
  aiPaper?: boolean;
}

// ── Daily content (user-generated, stored in Firestore) ───────────────────────

export interface VocabWord {
  word: string;
  meaning: string;
  pos: string;           // part of speech
  synonym: string;
  antonym: string;
  example: string;
}

export interface OneWordSub {
  phrase: string;
  word: string;
  options: string[];     // 4 options, correct is `word`
  explanation: string;
}

export interface GkFact {
  category: string;
  headline: string;
  detail: string;
}

export interface DailyQuestion {
  question: string;
  options: string[];      // 4 options
  answer: number;         // 0-indexed correct option
  explanation: string;
}

export interface DailyQuestionSet {
  setId: string;
  subject: string;
  questions: DailyQuestion[];
}

export interface DailyContent {
  id?: string;            // Firestore doc id = dateStr "YYYY-MM-DD"
  createdAt: number;
  vocab: VocabWord[];
  oneWordSub: OneWordSub[];
  gkCapsule: GkFact[];
  questionSets: DailyQuestionSet[];
}

// ── Achievement ───────────────────────────────────────────────────────────────
export interface UserAchievement {
  id: string;
  earnedAt: number;
}

export const ACHIEVEMENTS = [
  // ── First steps ──────────────────────────────────────────────────────────────
  { id: "first_test",     emoji: "🎯", title: "First Step",       desc: "Complete your first test" },
  { id: "tests_10",       emoji: "📝", title: "Getting Started",  desc: "Complete 10 tests" },
  { id: "tests_50",       emoji: "🔥", title: "On Fire",          desc: "Complete 50 tests" },
  { id: "tests_100",      emoji: "💯", title: "Century",          desc: "Complete 100 tests" },
  { id: "tests_200",      emoji: "🌊", title: "Unstoppable",      desc: "Complete 200 tests" },
  { id: "tests_500",      emoji: "🚀", title: "Rocketeer",        desc: "Complete 500 tests" },
  // ── Questions ─────────────────────────────────────────────────────────────────
  { id: "questions_500",  emoji: "📚", title: "Question Crusher", desc: "Answer 500 questions" },
  { id: "questions_2000", emoji: "🏋️", title: "Grinder",         desc: "Answer 2,000 questions" },
  { id: "questions_5000", emoji: "🏔️", title: "Summit Seeker",   desc: "Answer 5,000 questions" },
  { id: "questions_10000",emoji: "🌍", title: "Global Scholar",   desc: "Answer 10,000 questions" },
  // ── Streaks ───────────────────────────────────────────────────────────────────
  { id: "streak_3",       emoji: "🗓️", title: "3-Day Streak",    desc: "Study 3 days in a row" },
  { id: "streak_7",       emoji: "⚡", title: "Week Warrior",     desc: "Study 7 days in a row" },
  { id: "streak_14",      emoji: "🌙", title: "Fortnight Fire",   desc: "Study 14 days in a row" },
  { id: "streak_30",      emoji: "🌟", title: "Iron Will",        desc: "Study 30 days in a row" },
  { id: "streak_60",      emoji: "💎", title: "Diamond Mind",     desc: "Study 60 days in a row" },
  // ── Accuracy ─────────────────────────────────────────────────────────────────
  { id: "accuracy_90",    emoji: "🎓", title: "Sharp Shooter",    desc: "Score 90%+ accuracy" },
  { id: "accuracy_95",    emoji: "🏹", title: "Sniper",           desc: "Score 95%+ accuracy" },
  { id: "perfect_score",  emoji: "✨", title: "Perfection",       desc: "Score 100% on any test" },
  // ── Speed ─────────────────────────────────────────────────────────────────────
  { id: "speed_demon",    emoji: "⏩", title: "Speed Demon",      desc: "Average under 45s/question" },
  { id: "speed_elite",    emoji: "💨", title: "Bullet Train",     desc: "Average under 20s/question" },
  // ── AI & Daily ───────────────────────────────────────────────────────────────
  { id: "ai_paper",       emoji: "🤖", title: "AI Challenger",    desc: "Complete your first AI paper" },
  { id: "ai_papers_5",    emoji: "🧠", title: "AI Master",        desc: "Complete 5 AI papers" },
  { id: "daily_content",  emoji: "📅", title: "Daily Learner",    desc: "Create your first daily set" },
  { id: "daily_7",        emoji: "📆", title: "Weekly Grind",     desc: "Create 7 days of content" },
  { id: "daily_30",       emoji: "🗒️", title: "Monthly Scholar",  desc: "Create 30 days of content" },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];

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
