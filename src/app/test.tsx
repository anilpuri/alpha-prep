import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, BackHandler, FlatList, PanResponder, Animated,
} from "react-native";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { Spinner } from "../components/Spinner";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useTheme } from "../lib/theme-context";
import { useAuth } from "../lib/auth-context";
import {
  fetchSeenQids, fetchWrongQids, fetchBookmarkedQids,
  filterPool, pickRandom, saveAttempt, markSeen, markWrong, toggleBookmark,
} from "../lib/db";
import { allowedTimeSec, formatTime } from "../lib/timer";
import { subjectAccent, subjectEmoji } from "../lib/theme";
import { stripHtml } from "../lib/utils";
import type { TestConfig, Question, Attempt, PerQuestionResult } from "../lib/types";

type QState = "unanswered" | "answered" | "review";

export default function TestScreen() {
  const { config: configStr } = useLocalSearchParams<{ config: string }>();
  const config: TestConfig = JSON.parse(configStr || "{}");
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState<string | null>(null);

  const [selected, setSelected] = useState<(number | null)[]>([]);
  const [qState, setQState]     = useState<QState[]>([]);
  const [current, setCurrent]   = useState(0);
  const [showPalette, setShowPalette] = useState(false);

  // Bookmarks — optimistic local set, synced to Firestore in background
  const [localBookmarks, setLocalBookmarks] = useState<Set<number>>(new Set());

  const timeAllowed  = allowedTimeSec(config.nQuestions);
  const [timeLeft, setTimeLeft] = useState(timeAllowed);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime  = useRef(Date.now());
  const elapsedRef = useRef(0);

  const accentColor = subjectAccent(config.subject || "", theme);
  const isFree  = config.mode === "free";
  const isExam  = config.mode === "exam";

  // Confirm sheet state
  const [leaveVisible,  setLeaveVisible]  = useState(false);
  const [submitVisible, setSubmitVisible] = useState(false);


  // Refs needed inside PanResponder closure (created once, must read latest state)
  const currentRef      = useRef(0);
  const questionsLenRef = useRef(0);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { questionsLenRef.current = questions.length; }, [questions]);

  // Swipe left/right → next/prev question
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 20,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -50 && currentRef.current < questionsLenRef.current - 1) {
          setCurrent(c => c + 1);
        } else if (gs.dx > 50 && currentRef.current > 0) {
          setCurrent(c => c - 1);
        }
      },
    })
  ).current;

  // ── Load questions ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Load all bank parts for this topic
        const all: Question[] = [];
        for (let p = 1; p <= 10; p++) {
          const snap = await getDoc(doc(db, "banks", `${config.topicId}_p${p}`));
          if (!snap.exists()) break;
          all.push(...(snap.data().questions as Question[]));
        }

        // Load user pool-related data in parallel
        const [seen, wrong, bookmarked] = user
          ? await Promise.all([
              fetchSeenQids(user.uid, config.topicId),
              fetchWrongQids(user.uid, config.topicId),
              fetchBookmarkedQids(user.uid, config.topicId),
            ])
          : [new Set<number>(), new Set<number>(), new Set<number>()];

        // Init local bookmark display
        setLocalBookmarks(new Set(bookmarked));

        // Filter by pool, then pick randomly — this ensures questions are
        // always a different random sample when there are more available
        const pool   = filterPool(all, seen, config.pool, wrong, bookmarked);
        const chosen = pickRandom(pool, Math.min(config.nQuestions, pool.length));

        setQuestions(chosen);
        setSelected(new Array(chosen.length).fill(null));
        setQState(new Array(chosen.length).fill("unanswered" as QState));
        setLoading(false);
      } catch (e: any) {
        setLoadErr(e.message || "Failed to load questions");
        setLoading(false);
      }
    })();
  }, []);

  // ── Timer ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || isFree) return;
    startTime.current = Date.now();
    timerRef.current  = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
      elapsedRef.current = elapsed;
      const left = timeAllowed - elapsed;
      setTimeLeft(left);
      if (left <= 0 && isExam) {
        clearInterval(timerRef.current!);
        performSubmit();
      }
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  // ── Block back on practice/exam ──────────────────────────────────────────────
  useEffect(() => {
    if (isFree) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setLeaveVisible(true);
      return true;
    });
    return () => sub.remove();
  }, [isFree]);


  // ── Running score ────────────────────────────────────────────────────────────
  const runningScore = useMemo(() => {
    if (questions.length === 0) return 0;
    let score = 0;
    questions.forEach((q, i) => {
      const sel = selected[i];
      if (sel === null) return;
      const posM = q.marks?.positive ?? 2;
      const negM = q.marks?.negative ?? 0.5;
      score += q.answer.includes(sel) ? posM : -negM;
    });
    return score;
  }, [selected, questions]);

  // ── Select option (locked after first selection in any mode) ─────────────────
  const selectOption = useCallback((optId: number) => {
    if (selected[current] !== null) return; // locked
    setSelected(s => { const n = [...s]; n[current] = optId; return n; });
    setQState(q  => { const n = [...q]; n[current] = "answered"; return n; });
  }, [current, selected]);

  const toggleReview = useCallback(() => {
    setQState(q => {
      const n = [...q];
      n[current] = n[current] === "review"
        ? (selected[current] !== null ? "answered" : "unanswered")
        : "review";
      return n;
    });
  }, [current, selected]);

  // ── Bookmark toggle (optimistic) ─────────────────────────────────────────────
  const onBookmark = useCallback((qid: number) => {
    setLocalBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
    if (user) toggleBookmark(user.uid, config.topicId, qid).catch(() => {});
  }, [user, config.topicId]);

  // ── Submit ───────────────────────────────────────────────────────────────────
  // performSubmit — actual work, no confirmation dialog
  const performSubmit = useCallback(async () => {
    setSubmitVisible(false);
    if (timerRef.current) clearInterval(timerRef.current);
    const elapsed = isFree
      ? Math.floor((Date.now() - startTime.current) / 1000)
      : elapsedRef.current;

    const perQuestion: PerQuestionResult[] = questions.map((q, i) => {
      const sel     = selected[i];
      const correct = sel !== null && q.answer.includes(sel);
      return { qid: q.qid, selected: sel, correct, timeSec: 0 };
    });

    const correct  = perQuestion.filter(r => r.correct).length;
    const wrong    = perQuestion.filter(r => !r.correct && r.selected !== null).length;
    const skipped  = perQuestion.filter(r => r.selected === null).length;
    const posM     = questions[0]?.marks?.positive ?? 2;
    const negM     = questions[0]?.marks?.negative ?? 0.5;
    const score    = correct * posM - wrong * negM;
    const maxScore = questions.length * posM;
    const answered = correct + wrong;
    const accuracy = answered > 0 ? (correct / answered) * 100 : 0;
    const speed    = questions.length > 0 ? elapsed / questions.length : 0;

    const attempt: Attempt = {
      topicId: config.topicId, topicName: config.topicName, subject: config.subject,
      mode: config.mode, nQuestions: questions.length,
      timeAllowedSec: timeAllowed, timeTakenSec: elapsed,
      correct, wrong, skipped, score, maxScore, accuracy, speedSecPerQ: speed,
      perQuestion, createdAt: Date.now(),
    };

    let attemptId = "";
    if (user) {
      attemptId = await saveAttempt(user.uid, attempt).catch(() => "");
      // Mark seen and wrong in parallel (best-effort)
      const wrongQids = perQuestion.filter(r => !r.correct && r.selected !== null).map(r => r.qid);
      await Promise.all([
        markSeen(user.uid, config.topicId, questions.map(q => q.qid)).catch(() => {}),
        markWrong(user.uid, config.topicId, wrongQids).catch(() => {}),
      ]);
    }

    router.replace({
      pathname: "/result",
      params: { attempt: JSON.stringify(attempt), questions: JSON.stringify(questions), attemptId },
    });
  }, [questions, selected, user, config, isFree, timeAllowed]);

  // submitTest — shows ConfirmSheet if unanswered, otherwise goes straight
  const submitTest = useCallback((autoSubmit = false) => {
    if (!autoSubmit) {
      const unanswered = qState.filter(s => s === "unanswered").length;
      if (unanswered > 0) { setSubmitVisible(true); return; }
    }
    performSubmit();
  }, [qState, performSubmit]);

  // ── Render states ────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <Spinner color={accentColor} size={108} icon={subjectEmoji(config.subject || "")} />
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: "900", marginTop: 26, letterSpacing: 0.3 }}>
        Fetching Questions
      </Text>
      <Text style={{ color: accentColor, fontSize: 13, fontWeight: "700", marginTop: 5 }} numberOfLines={1}>
        {config.topicName}
      </Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginTop: 16 }}>
        Preparing your {config.mode} session…
      </Text>
    </View>
  );

  if (loadErr || questions.length === 0) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 32 }}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>😕</Text>
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>No questions found</Text>
      <Text style={{ color: theme.sub, fontSize: 14, textAlign: "center", lineHeight: 22 }}>
        {loadErr || `The "${config.pool}" pool is empty for this topic.\nTry selecting "All" questions.`}
      </Text>
      <TouchableOpacity
        onPress={() => router.back()}
        style={[s.goBackBtn, { backgroundColor: accentColor }]}
      >
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>← Go back</Text>
      </TouchableOpacity>
    </View>
  );

  const q            = questions[current];
  const urgentTime   = timeLeft < 60 && !isFree;
  const hasAnswer    = selected[current] !== null;
  const answeredCount = selected.filter(s => s !== null).length;
  const scoreColor   = runningScore >= 0 ? "#4ADE80" : "#F87171";
  const scoreStr     = runningScore >= 0 ? `+${runningScore.toFixed(1)}` : `${runningScore.toFixed(1)}`;
  const isBookmarked = localBookmarks.has(q.qid);
  const posM         = q.marks?.positive ?? 2;
  const negM         = q.marks?.negative ?? 0.5;
  const progressPct  = ((current + 1) / questions.length) * 100;

  const modeLabel = config.mode === "practice" ? "Practice" : config.mode === "exam" ? "Exam" : "Free";
  const modeColor = config.mode === "exam" ? theme.red : config.mode === "practice" ? theme.amber : theme.green;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }} {...swipePan.panHandlers}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <View style={[s.header, { backgroundColor: accentColor }]}>
        {/* Row 1: back arrow + topic + controls */}
        <View style={s.headerRow}>
          <TouchableOpacity style={s.iconBtn} onPress={() => {
            if (isFree) { router.back(); return; }
            setLeaveVisible(true);
          }}>
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>‹</Text>
          </TouchableOpacity>

          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={s.headerTopic} numberOfLines={1}>{config.topicName}</Text>
            <Text style={s.headerCounter}>{current + 1} of {questions.length}</Text>
          </View>

          {/* Score pill */}
          <View style={[s.scorePill, { backgroundColor: "#00000025" }]}>
            <Text style={{ fontSize: 10, color: "#ffffffAA", fontWeight: "700" }}>SCORE</Text>
            <Text style={[s.scoreNum, { color: scoreColor }]}>{scoreStr}</Text>
          </View>

          {/* Timer */}
          {!isFree && (
            <View style={[s.timerPill, urgentTime && { backgroundColor: "#CC000080" }]}>
              <Text style={{ fontSize: 9, color: "#ffffffAA", fontWeight: "700" }}>TIME</Text>
              <Text style={[s.timerNum, urgentTime && { color: "#FFD0D0" }]}>
                {formatTime(Math.max(0, timeLeft))}
              </Text>
            </View>
          )}

          {/* Palette — dot grid icon, extra left margin for breathing room */}
          <TouchableOpacity
            style={[s.iconBtn, { marginLeft: 12 }]}
            onPress={() => setShowPalette(p => !p)}
          >
            <View style={{ gap: 3 }}>
              {[0, 1, 2].map(row => (
                <View key={row} style={{ flexDirection: "row", gap: 3 }}>
                  {[0, 1, 2].map(col => (
                    <View key={col} style={{ width: 3.5, height: 3.5, borderRadius: 1, backgroundColor: "#fff" }} />
                  ))}
                </View>
              ))}
            </View>
          </TouchableOpacity>
        </View>

        {/* Row 2: progress bar */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progressPct}%`, backgroundColor: "#ffffff50" }]} />
          {/* answered dots overlay */}
          <View style={[s.progressFill, {
            width: `${(answeredCount / questions.length) * 100}%`,
            backgroundColor: "#ffffffCC",
          }]} />
        </View>

        {/* Row 3: answered count */}
        <View style={s.headerMeta}>
          <Text style={{ color: "#ffffffCC", fontSize: 11 }}>
            {answeredCount} answered · {questions.length - answeredCount} remaining
          </Text>
          <View style={[s.modePill, { backgroundColor: "#00000030" }]}>
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{modeLabel.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* ── Question palette (overlay) ────────────────────────────────────────── */}
      {showPalette && (
        <View style={[s.palette, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: theme.text }}>Question Navigator</Text>
            <TouchableOpacity onPress={() => setShowPalette(false)}>
              <Text style={{ color: theme.sub, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={questions}
            keyExtractor={(_, i) => String(i)}
            numColumns={7}
            scrollEnabled={false}
            renderItem={({ index }) => {
              const st  = qState[index];
              const isCur = index === current;
              const isAns = st === "answered";
              const isRev = st === "review";
              const correct = isAns && selected[index] !== null && questions[index].answer.includes(selected[index]!);
              const bg = isAns
                ? (correct ? theme.green : theme.red)
                : isRev ? theme.amber
                : isCur ? accentColor
                : theme.bg2;
              return (
                <TouchableOpacity
                  onPress={() => { setCurrent(index); setShowPalette(false); }}
                  style={[s.palChip, {
                    backgroundColor: bg,
                    borderWidth: isCur ? 2.5 : 0,
                    borderColor: "#fff",
                  }]}
                >
                  <Text style={{
                    fontSize: 12, fontWeight: "800",
                    color: (isAns || isRev || isCur) ? "#fff" : theme.text,
                  }}>
                    {index + 1}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          {/* Legend */}
          <View style={{ flexDirection: "row", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            {[
              { color: theme.green,  label: "Correct"  },
              { color: theme.red,    label: "Wrong"     },
              { color: theme.amber,  label: "Marked"    },
              { color: accentColor,  label: "Current"   },
              { color: theme.bg2,    label: "Pending", border: theme.border },
            ].map(l => (
              <View key={l.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{
                  width: 12, height: 12, borderRadius: 3,
                  backgroundColor: l.color,
                  borderWidth: l.border ? 1 : 0, borderColor: l.border,
                }} />
                <Text style={{ fontSize: 11, color: theme.sub }}>{l.label}</Text>
              </View>
            ))}
          </View>

          {/* End Test — submit early, unanswered get 0 marks */}
          <TouchableOpacity
            style={[s.endTestBtn, { backgroundColor: theme.green + "18", borderColor: theme.green }]}
            onPress={() => { setShowPalette(false); submitTest(false); }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 14, fontWeight: "900", color: theme.green }}>
              ✓  Submit Test  ({answeredCount}/{questions.length} answered)
            </Text>
            <Text style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>
              Unanswered questions get 0 marks
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Main scroll area ─────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Question card */}
        <View style={[s.qCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Card top row: Q number + marks + bookmark */}
          <View style={s.qCardHeader}>
            <View style={[s.qNumTag, { backgroundColor: accentColor + "18", borderColor: accentColor + "50" }]}>
              <Text style={{ fontSize: 11, fontWeight: "900", color: accentColor, letterSpacing: 0.5 }}>
                Q {current + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={[s.marksPill, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
              <Text style={{ fontSize: 10, color: theme.green, fontWeight: "800" }}>+{posM}</Text>
              <Text style={{ fontSize: 10, color: theme.muted }}>  /  </Text>
              <Text style={{ fontSize: 10, color: theme.red, fontWeight: "800" }}>−{negM}</Text>
            </View>
            <TouchableOpacity
              onPress={() => onBookmark(q.qid)}
              activeOpacity={0.7}
              style={[s.bookmarkBtn, { backgroundColor: isBookmarked ? "#F59E0B18" : theme.bg2 }]}
            >
              <Text style={{ fontSize: 18 }}>{isBookmarked ? "⭐" : "☆"}</Text>
            </TouchableOpacity>
          </View>

          {/* Question text */}
          <Text style={[s.qText, { color: theme.text }]}>{stripHtml(q.question)}</Text>
        </View>

        {/* Options */}
        <View style={{ gap: 10, marginBottom: 4 }}>
          {q.options.map((opt, idx) => {
            const isSel     = selected[current] === opt.id;
            const isCorrect = q.answer.includes(opt.id);
            const letter    = String.fromCharCode(65 + idx);

            let bg          = theme.card;
            let borderColor = theme.border;
            let letterBg    = theme.bg2;
            let letterColor = theme.sub;
            let textColor   = theme.text;

            if (!hasAnswer && isSel) {
              // pre-answer selected (shouldn't happen since we lock immediately, but just in case)
              bg = accentColor + "15"; borderColor = accentColor;
              letterBg = accentColor; letterColor = "#fff";
            }
            if (hasAnswer && isCorrect) {
              bg = theme.greenLt; borderColor = theme.green;
              letterBg = theme.green; letterColor = "#fff"; textColor = theme.text;
            }
            if (hasAnswer && isSel && !isCorrect) {
              bg = theme.redLt; borderColor = theme.red;
              letterBg = theme.red; letterColor = "#fff"; textColor = theme.text;
            }
            if (hasAnswer && !isCorrect && !isSel) {
              // dim other wrong options after answer
              textColor = theme.muted;
            }

            return (
              <TouchableOpacity
                key={opt.id}
                style={[s.option, { backgroundColor: bg, borderColor }]}
                onPress={() => selectOption(opt.id)}
                activeOpacity={selected[current] !== null ? 1 : 0.75}
              >
                {/* Letter badge */}
                <View style={[s.optLetter, { backgroundColor: letterBg }]}>
                  <Text style={{ fontSize: 13, fontWeight: "900", color: letterColor }}>{letter}</Text>
                </View>

                {/* Option text */}
                <Text style={[s.optText, { color: textColor }]} numberOfLines={6}>
                  {stripHtml(opt.value)}
                </Text>

                {/* Result icon */}
                {hasAnswer && isCorrect && (
                  <View style={[s.resultIcon, { backgroundColor: theme.green }]}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900" }}>✓</Text>
                  </View>
                )}
                {hasAnswer && isSel && !isCorrect && (
                  <View style={[s.resultIcon, { backgroundColor: theme.red }]}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900" }}>✗</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Explanation */}
        {hasAnswer && q.explanation ? (
          <View style={[s.explain, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[s.explainAccent, { backgroundColor: theme.blue }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Text style={{ fontSize: 14 }}>💡</Text>
                <Text style={{ fontSize: 13, fontWeight: "900", color: theme.blue, letterSpacing: 0.3 }}>
                  EXPLANATION
                </Text>
              </View>
              <Text style={{ color: theme.text, lineHeight: 23, fontSize: 14 }}>
                {stripHtml(q.explanation)}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Bottom Navigation ─────────────────────────────────────────────────── */}
      <View style={[s.nav, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {/* Prev */}
        <TouchableOpacity
          disabled={current === 0}
          style={[s.navSide, { opacity: current === 0 ? 0.35 : 1, backgroundColor: theme.bg2, borderColor: theme.border }]}
          onPress={() => setCurrent(c => Math.max(0, c - 1))}
        >
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>‹</Text>
          <Text style={{ color: theme.sub, fontSize: 12, fontWeight: "600" }}>Prev</Text>
        </TouchableOpacity>

        {/* Centre: Mark for review OR submit */}
        <View style={{ flex: 1, paddingHorizontal: 6 }}>
          {current < questions.length - 1 ? (
            !isFree ? (
              <TouchableOpacity
                style={[s.navMark, {
                  backgroundColor: qState[current] === "review" ? theme.amber + "25" : theme.bg2,
                  borderColor: qState[current] === "review" ? theme.amber : theme.border,
                }]}
                onPress={toggleReview}
              >
                <Text style={{ fontSize: 14 }}>
                  {qState[current] === "review" ? "🚩" : "⚑"}
                </Text>
                <Text style={{
                  fontSize: 12, fontWeight: "800",
                  color: qState[current] === "review" ? theme.amber : theme.sub,
                }}>
                  {qState[current] === "review" ? "Marked" : "Mark"}
                </Text>
              </TouchableOpacity>
            ) : null
          ) : (
            <TouchableOpacity
              style={[s.submitBtn, { backgroundColor: theme.green }]}
              onPress={() => submitTest(false)}
              activeOpacity={0.85}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>Submit Test ✓</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Next */}
        {current < questions.length - 1 && (
          <TouchableOpacity
            style={[s.navSide, { backgroundColor: accentColor, borderColor: accentColor }]}
            onPress={() => setCurrent(c => c + 1)}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Next</Text>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>›</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Confirm sheets ────────────────────────────────────────────────────── */}
      <ConfirmSheet
        visible={leaveVisible}
        icon="🚪"
        title="Leave test?"
        message="Your progress will be lost and this session won't be saved."
        confirmLabel="Leave"
        cancelLabel="Stay"
        danger
        onConfirm={() => { setLeaveVisible(false); router.back(); }}
        onCancel={() => setLeaveVisible(false)}
      />
      <ConfirmSheet
        visible={submitVisible}
        icon="📝"
        title="Submit test?"
        message={`${qState.filter(s => s === "unanswered").length} questions are unanswered and will get 0 marks.`}
        confirmLabel="Submit"
        cancelLabel="Review"
        onConfirm={() => performSubmit()}
        onCancel={() => setSubmitVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  // Loading
  loadIconCircle: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: "center", justifyContent: "center", borderWidth: 1.5,
  },
  goBackBtn:   { marginTop: 24, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },

  // Header
  header: { paddingTop: 50, paddingBottom: 10, paddingHorizontal: 14, gap: 10 },
  headerRow:    { flexDirection: "row", alignItems: "center" },
  headerTopic:  { fontSize: 13, color: "#ffffffDD", fontWeight: "700" },
  headerCounter:{ fontSize: 20, color: "#fff", fontWeight: "900", marginTop: 1 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#00000020",
    alignItems: "center", justifyContent: "center",
  },
  scorePill: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
    alignItems: "center", minWidth: 56,
  },
  scoreNum:   { fontSize: 15, fontWeight: "900", marginTop: 1 },
  timerPill: {
    backgroundColor: "#00000025", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
    alignItems: "center", minWidth: 56, marginLeft: 6,
  },
  timerNum:   { fontSize: 14, fontWeight: "900", color: "#fff", marginTop: 1 },
  modePill:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  progressTrack: {
    height: 4, backgroundColor: "#ffffff25", borderRadius: 2, overflow: "hidden",
    position: "relative",
  },
  progressFill:  { position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 2 },
  headerMeta: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },

  // Palette
  palette: {
    margin: 12, borderRadius: 18, padding: 14, borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, elevation: 6,
  },
  palChip: {
    width: 40, height: 40, borderRadius: 10, margin: 3,
    alignItems: "center", justifyContent: "center",
  },
  endTestBtn: {
    marginTop: 14, borderRadius: 12, borderWidth: 1.5,
    padding: 12, alignItems: "center",
  },

  // Question card
  qCard: {
    borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  qCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  qNumTag: {
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
  },
  marksPill: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4,
  },
  bookmarkBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  qText: { fontSize: 16, lineHeight: 26, fontWeight: "500", letterSpacing: 0.1 },

  // Options
  option: {
    borderRadius: 16, borderWidth: 1.5, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  optLetter: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  optText: { fontSize: 15, flex: 1, lineHeight: 22 },
  resultIcon: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },

  // Explanation
  explain: {
    borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 6,
    flexDirection: "row", gap: 12,
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  explainAccent: { width: 3, borderRadius: 2, alignSelf: "stretch" },

  // Nav
  nav: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10,
    paddingBottom: 18, gap: 8, borderTopWidth: 1,
    alignItems: "center",
  },
  navSide: {
    width: 72, height: 52, borderRadius: 14, borderWidth: 1.5,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2,
  },
  navMark: {
    flex: 1, height: 52, borderRadius: 14, borderWidth: 1.5,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  submitBtn: {
    flex: 1, height: 52, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#22C55E", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
});
