import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, BackHandler, FlatList, PanResponder, Animated, Image,
} from "react-native";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { Spinner } from "../components/Spinner";
import { ConceptModal } from "../components/ConceptModal";
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
import { stripHtml, extractImages } from "../lib/utils";
import { QuestionImage } from "../components/QuestionImage";
import { MathRenderer } from "../components/MathRenderer";
import { checkAndAwardAchievements, fetchAttempts } from "../lib/db";
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

  // AI concept modal
  const [conceptVisible, setConceptVisible] = useState(false);

  // Sectional support for AI papers
  const [sectionBoundaries, setSectionBoundaries] = useState<number[]>([]);
  const sectionOf = (idx: number) =>
    sectionBoundaries.slice().reverse().findIndex(b => idx >= b);
  const currentSectionLabel = () => {
    if (!config.sections?.length || !sectionBoundaries.length) return null;
    const si = sectionBoundaries.reduce((acc, b, i) => b <= current ? i : acc, 0);
    return config.sections[si]?.subject ?? null;
  };


  // Refs needed inside PanResponder closure (created once, must read latest state)
  const currentRef      = useRef(0);
  const questionsLenRef = useRef(0);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { questionsLenRef.current = questions.length; }, [questions]);

  // Slide animation for question transitions
  const slideX   = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback((dir: 1 | -1, nextIdx: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(slideX,    { toValue: dir * -30, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setCurrent(nextIdx);
      slideX.setValue(dir * 30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(slideX,   { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideX]);

  // Swipe left/right → next/prev question
  const swipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 20,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -50 && currentRef.current < questionsLenRef.current - 1) {
          animateTo(1, currentRef.current + 1);
        } else if (gs.dx > 50 && currentRef.current > 0) {
          animateTo(-1, currentRef.current - 1);
        }
      },
    })
  ).current;

  // ── Load questions (single-topic or multi-section AI paper) ─────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        let chosen: Question[] = [];

        if (config.sections?.length) {
          // ── AI Paper: load from multiple topics per section ──────────────
          const boundaries: number[] = [];
          for (const section of config.sections) {
            boundaries.push(chosen.length);
            const sectionQs: Question[] = [];
            const perTopic = Math.ceil(section.nQuestions / Math.max(1, section.topicIds.length));

            for (const topicId of section.topicIds) {
              const topicQs: Question[] = [];
              for (let p = 1; p <= 10; p++) {
                const snap = await getDoc(doc(db, "banks", `${topicId}_p${p}`));
                if (!snap.exists()) break;
                topicQs.push(...(snap.data().questions as Question[]));
              }
              sectionQs.push(...pickRandom(topicQs, Math.min(perTopic, topicQs.length)));
            }
            chosen.push(...pickRandom(sectionQs, Math.min(section.nQuestions, sectionQs.length)));
          }
          setSectionBoundaries(boundaries);
        } else {
          // ── Single topic ─────────────────────────────────────────────────
          const all: Question[] = [];
          for (let p = 1; p <= 10; p++) {
            const snap = await getDoc(doc(db, "banks", `${config.topicId}_p${p}`));
            if (!snap.exists()) break;
            all.push(...(snap.data().questions as Question[]));
          }

          const [seen, wrong, bookmarked] = user
            ? await Promise.all([
                fetchSeenQids(user.uid, config.topicId),
                fetchWrongQids(user.uid, config.topicId),
                fetchBookmarkedQids(user.uid, config.topicId),
              ])
            : [new Set<number>(), new Set<number>(), new Set<number>()];

          setLocalBookmarks(new Set(bookmarked));
          const pool = filterPool(all, seen, config.pool, wrong, bookmarked);
          chosen = pickRandom(pool, Math.min(config.nQuestions, pool.length));
        }

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
    // Per-question scoring — each question may have different marks
    let score = 0, maxScore = 0;
    questions.forEach((q, i) => {
      const posM = q.marks?.positive ?? 2;
      const negM = q.marks?.negative ?? 0.5;
      maxScore += posM;
      const r = perQuestion[i];
      if (r.correct) score += posM;
      else if (r.selected !== null) score -= negM;
    });
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
      const wrongQids = perQuestion.filter(r => !r.correct && r.selected !== null).map(r => r.qid);
      const topicForMark = config.topicId !== "ai_paper" ? config.topicId : (config.sections?.[0]?.topicIds[0] ?? "");
      await Promise.all([
        topicForMark ? markSeen(user.uid, topicForMark, questions.map(q => q.qid)).catch(() => {}) : Promise.resolve(),
        topicForMark ? markWrong(user.uid, topicForMark, wrongQids).catch(() => {}) : Promise.resolve(),
      ]);
      // Check achievements in background
      fetchAttempts(user.uid, 500).then(all => {
        const totalQ = all.reduce((s, a) => s + a.nQuestions, 0);
        const streak = (() => {
          const days = new Set(all.map(a => new Date(a.createdAt).toDateString()));
          let n = 0, d = new Date();
          while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
          return n;
        })();
        const aiPaperCount = all.filter(a => a.topicId === "ai_paper").length;
        checkAndAwardAchievements(user.uid, {
          totalTests:   all.length,
          totalQ,
          streak,
          maxAccuracy:  Math.max(...all.map(a => a.accuracy), 0),
          avgSpeed:     attempt.speedSecPerQ,
          aiPaper:      config.aiPaper,
          aiPaperCount,
        }).catch(() => {});
      }).catch(() => {});
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
  const fmtNum = (n: number) => n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
  const scoreStr     = runningScore >= 0 ? `+${fmtNum(runningScore)}` : fmtNum(runningScore);
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
          {/* Scrollable grid so Submit is always reachable */}
          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
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
          </ScrollView>

          {/* End Test — always visible, outside scroll */}
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
        {/* Section label for AI papers */}
        {currentSectionLabel() && (
          <View style={[s.sectionBanner, { backgroundColor: accentColor + "18", borderColor: accentColor + "40" }]}>
            <Text style={{ color: accentColor, fontWeight: "800", fontSize: 12 }}>
              📂 {currentSectionLabel()}
            </Text>
          </View>
        )}

        {/* Question card + options wrapped for slide animation */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateX: slideX }] }}>
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

          {/* Question images — skip for is_math since MathRenderer renders them inline */}
          {!q.is_math && extractImages(q.question).map((url, i) => (
            <QuestionImage key={i} uri={url} />
          ))}
          {/* Question text — math questions use KaTeX WebView renderer */}
          {q.is_math
            ? <MathRenderer html={q.question} textColor={theme.text} fontSize={15} backgroundColor={theme.card} />
            : <Text style={[s.qText, { color: theme.text }]}>{stripHtml(q.question)}</Text>
          }
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
              textColor = theme.muted;
            }

            const optHasMath = /\\\(|\\\[|\$/.test(opt.value);
            const optHasImg  = /<img/i.test(opt.value);

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

                {/* Option text — use WebView for math or image options */}
                {optHasMath || optHasImg
                  ? <MathRenderer html={opt.value} textColor={textColor} fontSize={14} backgroundColor={bg} containerStyle={{ flex: 1 }} />
                  : <Text style={[s.optText, { color: textColor }]} numberOfLines={6}>{stripHtml(opt.value)}</Text>
                }

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

        {/* AI Concept button — always visible after answering, or tap anytime */}
        <TouchableOpacity
          onPress={() => setConceptVisible(true)}
          style={[s.conceptBtn, {
            backgroundColor: theme.primary + "15",
            borderColor: theme.primary + "50",
          }]}
        >
          <Text style={{ fontSize: 16 }}>🧠</Text>
          <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 13 }}>
            Understand this concept
          </Text>
        </TouchableOpacity>
        </Animated.View>

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
              {/\\\(|\\\[|\$/.test(q.explanation)
                ? <MathRenderer html={q.explanation} textColor={theme.text} fontSize={14} backgroundColor={theme.card} />
                : <Text style={{ color: theme.text, lineHeight: 23, fontSize: 14 }}>{stripHtml(q.explanation)}</Text>
              }
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
          onPress={() => { if (current > 0) animateTo(-1, current - 1); }}
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
            onPress={() => { if (current < questions.length - 1) animateTo(1, current + 1); }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Next</Text>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>›</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Confirm sheets ────────────────────────────────────────────────────── */}
      {/* AI Concept Modal */}
      <ConceptModal
        visible={conceptVisible}
        question={questions[current] ?? null}
        onClose={() => setConceptVisible(false)}
      />

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
  qText:  { fontSize: 16, lineHeight: 26, fontWeight: "500", letterSpacing: 0.1 },

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

  // Section banner (AI paper)
  sectionBanner: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7,
    marginBottom: 10, flexDirection: "row",
  },
  // Concept button
  conceptBtn: {
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10,
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
