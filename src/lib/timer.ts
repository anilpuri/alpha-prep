/**
 * Qdiquity pacing rule: 25 questions = 15 minutes → 36 seconds per question.
 * Time scales linearly with the number of questions (5–100 allowed).
 */
export const SEC_PER_QUESTION = 36;
export const MIN_QUESTIONS = 5;
export const MAX_QUESTIONS = 100;

export function allowedTimeSec(nQuestions: number): number {
  return nQuestions * SEC_PER_QUESTION;
}

export function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
