/**
 * Firestore data layer — all reads/writes go through here.
 */
import {
  doc, getDoc, setDoc, addDoc, collection, query, orderBy, getDocs,
  getCountFromServer, where, limit as qLimit, deleteDoc, updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Tree, Question, Attempt, TopicStats, QuestionPool, DailyContent, UserAchievement } from "./types";

// ── Topic tree ────────────────────────────────────────────────────────────────

let treeCache: Tree | null = null;

export async function fetchTree(): Promise<Tree> {
  if (treeCache) return treeCache;
  const snap = await getDoc(doc(db, "meta", "tree"));
  if (!snap.exists()) throw new Error("Question data not uploaded yet (meta/tree missing)");
  treeCache = snap.data() as Tree;
  return treeCache;
}

// ── Question banks ────────────────────────────────────────────────────────────

const bankCache = new Map<string, Question[]>();

export async function fetchTopicQuestions(topicId: string, parts: number): Promise<Question[]> {
  const key = `${topicId}`;
  if (bankCache.has(key)) return bankCache.get(key)!;

  const all: Question[] = [];
  for (let p = 1; p <= parts; p++) {
    const snap = await getDoc(doc(db, "banks", `${topicId}_p${p}`));
    if (snap.exists()) all.push(...(snap.data().questions as Question[]));
  }
  bankCache.set(key, all);
  return all;
}

// ── Seen questions (attempted/unattempted filter) ─────────────────────────────

export async function fetchSeenQids(uid: string, topicId: string): Promise<Set<number>> {
  const snap = await getDoc(doc(db, "users", uid, "seen", topicId));
  return new Set(snap.exists() ? (snap.data().qids as number[]) : []);
}

export async function markSeen(uid: string, topicId: string, qids: number[]) {
  const existing = await fetchSeenQids(uid, topicId);
  qids.forEach(q => existing.add(q));
  await setDoc(doc(db, "users", uid, "seen", topicId), { qids: [...existing] });
}

export function filterPool(
  questions: Question[],
  seen: Set<number>,
  pool: QuestionPool,
  wrong?: Set<number>,
  bookmarked?: Set<number>,
): Question[] {
  if (pool === "unattempted") return questions.filter(q => !seen.has(q.qid));
  if (pool === "attempted")   return questions.filter(q => seen.has(q.qid));
  if (pool === "wrong")       return questions.filter(q => (wrong ?? new Set<number>()).has(q.qid));
  if (pool === "bookmarked")  return questions.filter(q => (bookmarked ?? new Set<number>()).has(q.qid));
  return questions;
}

export function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ── Attempts & stats ──────────────────────────────────────────────────────────

export async function saveAttempt(uid: string, attempt: Attempt): Promise<string> {
  const ref = await addDoc(collection(db, "users", uid, "attempts"), attempt);

  // update aggregated per-topic stats (client-side aggregation)
  const statsRef = doc(db, "users", uid, "topicStats", attempt.topicId);
  const snap = await getDoc(statsRef);
  const prev: TopicStats = snap.exists()
    ? (snap.data() as TopicStats)
    : {
        topicId: attempt.topicId, topicName: attempt.topicName, subject: attempt.subject,
        attempts: 0, totalQ: 0, correct: 0, wrong: 0, skipped: 0,
        totalTimeSec: 0, accuracy: 0, speedSecPerQ: 0, lastAttempt: 0,
      };

  const next: TopicStats = {
    ...prev,
    attempts:     prev.attempts + 1,
    totalQ:       prev.totalQ + attempt.nQuestions,
    correct:      prev.correct + attempt.correct,
    wrong:        prev.wrong + attempt.wrong,
    skipped:      prev.skipped + attempt.skipped,
    totalTimeSec: prev.totalTimeSec + attempt.timeTakenSec,
    lastAttempt:  attempt.createdAt,
  };
  const answered = next.correct + next.wrong;
  next.accuracy     = answered > 0 ? (next.correct / answered) * 100 : 0;
  next.speedSecPerQ = answered > 0 ? next.totalTimeSec / (answered + next.skipped) : 0;
  await setDoc(statsRef, next);

  // leaderboard entry for percentile/rank (best score per user per topic)
  const lbRef  = doc(db, "leaderboard", attempt.topicId, "scores", uid);
  const lbSnap = await getDoc(lbRef);
  const scorePct = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
  if (!lbSnap.exists() || (lbSnap.data().scorePct ?? -1) < scorePct) {
    await setDoc(lbRef, {
      scorePct,
      accuracy: attempt.accuracy,
      speedSecPerQ: attempt.speedSecPerQ,
      updatedAt: Date.now(),
    });
  }

  return ref.id;
}

export async function fetchAttempts(uid: string, max = 200): Promise<Attempt[]> {
  const q = query(collection(db, "users", uid, "attempts"), orderBy("createdAt", "desc"), qLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Attempt) }));
}

export async function fetchAttempt(uid: string, attemptId: string): Promise<Attempt | null> {
  const snap = await getDoc(doc(db, "users", uid, "attempts", attemptId));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Attempt) }) : null;
}

export async function fetchAllTopicStats(uid: string): Promise<TopicStats[]> {
  const snap = await getDocs(collection(db, "users", uid, "topicStats"));
  return snap.docs.map(d => d.data() as TopicStats);
}

// ── Percentile / rank (aggregate count queries — cheap) ───────────────────────

export async function fetchPercentileAndRank(
  topicId: string, uid: string
): Promise<{ percentile: number; rank: number; total: number } | null> {
  const scores = collection(db, "leaderboard", topicId, "scores");
  const mine = await getDoc(doc(scores, uid));
  if (!mine.exists()) return null;
  const myScore = mine.data().scorePct as number;

  const totalSnap = await getCountFromServer(scores);
  const belowSnap = await getCountFromServer(query(scores, where("scorePct", "<", myScore)));
  const total = totalSnap.data().count;
  const below = belowSnap.data().count;

  const percentile = total > 0 ? (below / total) * 100 : 0;
  const rank = total - below;
  return { percentile, rank, total };
}

export async function ensureUserDoc(uid: string, email: string, name: string) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { email, name, createdAt: Date.now() });
  }
}

// ── Wrong-answer tracking (for "Wrong" pool) ─────────────────────────────────

export async function fetchWrongQids(uid: string, topicId: string): Promise<Set<number>> {
  const snap = await getDoc(doc(db, "users", uid, "wrong", topicId));
  return new Set(snap.exists() ? (snap.data().qids as number[]) : []);
}

export async function markWrong(uid: string, topicId: string, wrongQids: number[]): Promise<void> {
  if (wrongQids.length === 0) return;
  const existing = await fetchWrongQids(uid, topicId);
  wrongQids.forEach(q => existing.add(q));
  await setDoc(doc(db, "users", uid, "wrong", topicId), { qids: [...existing] });
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export async function fetchBookmarkedQids(uid: string, topicId: string): Promise<Set<number>> {
  const snap = await getDoc(doc(db, "users", uid, "bookmarks", topicId));
  return new Set(snap.exists() ? (snap.data().qids as number[]) : []);
}

export async function toggleBookmark(uid: string, topicId: string, qid: number): Promise<boolean> {
  const ref  = doc(db, "users", uid, "bookmarks", topicId);
  const snap = await getDoc(ref);
  const qids: number[] = snap.exists() ? (snap.data().qids as number[]) : [];
  const idx  = qids.indexOf(qid);
  let bookmarked: boolean;
  if (idx !== -1) { qids.splice(idx, 1); bookmarked = false; }
  else            { qids.push(qid);      bookmarked = true;  }
  await setDoc(ref, { qids });
  return bookmarked;
}

// ── Attempt deletion ──────────────────────────────────────────────────────────

export async function deleteAttempt(uid: string, attemptId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "attempts", attemptId));
}

// ── Theme persistence ─────────────────────────────────────────────────────────

export async function saveUserTheme(uid: string, themeName: string): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), { themeName });
  } catch {
    await setDoc(doc(db, "users", uid), { themeName }, { merge: true });
  }
}

export async function loadUserTheme(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data().themeName ?? null) : null;
}

// ── Daily content ─────────────────────────────────────────────────────────────

export async function saveDailyContent(uid: string, dateStr: string, content: DailyContent): Promise<void> {
  await setDoc(doc(db, "users", uid, "daily", dateStr), content);
}

export async function fetchDailyContent(uid: string, dateStr: string): Promise<DailyContent | null> {
  const snap = await getDoc(doc(db, "users", uid, "daily", dateStr));
  return snap.exists() ? (snap.data() as DailyContent) : null;
}

export async function fetchAllDailyContent(uid: string): Promise<(DailyContent & { id: string })[]> {
  const snap = await getDocs(query(collection(db, "users", uid, "daily"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as DailyContent) }));
}

export async function deleteDailyContent(uid: string, dateStr: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "daily", dateStr));
}

// ── Achievements ─────────────────────────────────────────────────────────────

export async function fetchAchievements(uid: string): Promise<UserAchievement[]> {
  const snap = await getDocs(collection(db, "users", uid, "achievements"));
  return snap.docs.map(d => d.data() as UserAchievement);
}

export async function awardAchievement(uid: string, id: string): Promise<boolean> {
  const ref  = doc(db, "users", uid, "achievements", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return false; // already earned
  await setDoc(ref, { id, earnedAt: Date.now() } satisfies UserAchievement);
  return true;
}

export async function checkAndAwardAchievements(
  uid: string,
  stats: {
    totalTests:       number;
    totalQ:           number;
    streak:           number;
    maxAccuracy:      number;
    avgSpeed:         number;
    aiPaper?:         boolean;
    aiPaperCount?:    number;
    dailyContent?:    boolean;
    dailyCount?:      number;
  }
): Promise<string[]> {
  const newly: string[] = [];
  const award = async (id: string) => { if (await awardAchievement(uid, id)) newly.push(id); };

  // Tests
  if (stats.totalTests >= 1)   await award("first_test");
  if (stats.totalTests >= 10)  await award("tests_10");
  if (stats.totalTests >= 50)  await award("tests_50");
  if (stats.totalTests >= 100) await award("tests_100");
  if (stats.totalTests >= 200) await award("tests_200");
  if (stats.totalTests >= 500) await award("tests_500");

  // Questions
  if (stats.totalQ >= 500)     await award("questions_500");
  if (stats.totalQ >= 2000)    await award("questions_2000");
  if (stats.totalQ >= 5000)    await award("questions_5000");
  if (stats.totalQ >= 10000)   await award("questions_10000");

  // Streak
  if (stats.streak >= 3)       await award("streak_3");
  if (stats.streak >= 7)       await award("streak_7");
  if (stats.streak >= 14)      await award("streak_14");
  if (stats.streak >= 30)      await award("streak_30");
  if (stats.streak >= 60)      await award("streak_60");

  // Accuracy
  if (stats.maxAccuracy >= 90)  await award("accuracy_90");
  if (stats.maxAccuracy >= 95)  await award("accuracy_95");
  if (stats.maxAccuracy >= 100) await award("perfect_score");

  // Speed (only meaningful if avgSpeed > 0)
  if (stats.avgSpeed > 0 && stats.avgSpeed <= 45) await award("speed_demon");
  if (stats.avgSpeed > 0 && stats.avgSpeed <= 20) await award("speed_elite");

  // AI papers
  if (stats.aiPaper)                       await award("ai_paper");
  if ((stats.aiPaperCount ?? 0) >= 5)      await award("ai_papers_5");

  // Daily content
  if (stats.dailyContent)                  await award("daily_content");
  if ((stats.dailyCount ?? 0) >= 7)        await award("daily_7");
  if ((stats.dailyCount ?? 0) >= 30)       await award("daily_30");

  return newly;
}
