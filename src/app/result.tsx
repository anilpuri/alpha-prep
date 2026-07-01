import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated,
} from "react-native";
import { Spinner } from "../components/Spinner";
import { ConceptModal } from "../components/ConceptModal";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useTheme } from "../lib/theme-context";
import { subjectAccent, accuracyColor, pctStr } from "../lib/theme";
import { formatDuration } from "../lib/timer";
import { stripHtml, extractImages } from "../lib/utils";
import { QuestionImage } from "../components/QuestionImage";
import { MathRenderer } from "../components/MathRenderer";
import type { Attempt, Question } from "../lib/types";

type Review = "all" | "wrong" | "correct" | "skipped";

export default function ResultScreen() {
  const { attempt: aStr, questions: qStr, reviewMode } =
    useLocalSearchParams<{ attempt: string; questions: string; reviewMode?: string }>();

  const attempt: Attempt   = JSON.parse(aStr || "{}");
  const router   = useRouter();
  const { theme } = useTheme();

  // Questions may be empty when navigating from History tab
  const isHistoryReview = reviewMode === "1";
  const [questions,   setQuestions]   = useState<Question[]>(JSON.parse(qStr || "[]"));
  const [loadingQs,   setLoadingQs]   = useState(false);

  const [review,      setReview]      = useState<Review | null>(null);
  const [expandedQid, setExpandedQid] = useState<number | null>(null);
  const [conceptQ,    setConceptQ]    = useState<typeof questions[0] | null>(null);

  // Animated score counter
  const scoreAnim    = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  const accentColor = subjectAccent(attempt.subject || "", theme);
  const accColor    = accuracyColor(attempt.accuracy, theme);
  const scorePct    = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0;
  const timeEfficiency = attempt.timeAllowedSec > 0
    ? Math.min(100, (attempt.timeTakenSec / attempt.timeAllowedSec) * 100)
    : 0;
  const timeSaved = attempt.timeAllowedSec - attempt.timeTakenSec;

  // Load questions from Firestore banks when coming from history
  useEffect(() => {
    if (isHistoryReview && questions.length === 0 && attempt.topicId) {
      setLoadingQs(true);
      (async () => {
        try {
          const all: Question[] = [];
          for (let p = 1; p <= 10; p++) {
            const snap = await getDoc(doc(db, "banks", `${attempt.topicId}_p${p}`));
            if (!snap.exists()) break;
            all.push(...(snap.data().questions as Question[]));
          }
          // Keep only questions that were in this attempt, in the original order
          const qidOrder = attempt.perQuestion.map(r => r.qid);
          const attemptQids = new Set(qidOrder);
          const filtered = all.filter(q => attemptQids.has(q.qid));
          filtered.sort((a, b) => qidOrder.indexOf(a.qid) - qidOrder.indexOf(b.qid));
          setQuestions(filtered);
        } catch {
          // Silent — review section just stays hidden
        } finally {
          setLoadingQs(false);
        }
      })();
    }
  }, []);

  // Score count-up animation
  useEffect(() => {
    scoreAnim.addListener(({ value }) => setDisplayScore(parseFloat(value.toFixed(1))));
    Animated.timing(scoreAnim, { toValue: attempt.score, duration: 1000, useNativeDriver: false }).start();
    return () => scoreAnim.removeAllListeners();
  }, []);

  const filteredQ = review
    ? questions.filter((q, i) => {
        const r = attempt.perQuestion[i];
        if (review === "wrong")   return r && !r.correct && r.selected !== null;
        if (review === "correct") return r && r.correct;
        if (review === "skipped") return r && r.selected === null;
        return true;
      })
    : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Hero */}
      <View style={[s.hero, { backgroundColor: accentColor }]}>
        <Text style={s.heroEmoji}>
          {attempt.accuracy >= 80 ? "🏆" : attempt.accuracy >= 60 ? "👍" : "💪"}
        </Text>
        <Text style={s.heroTitle}>Test Complete!</Text>
        <Text style={s.heroSub}>{attempt.topicName}</Text>
      </View>

      <View style={{ padding: 16, marginTop: -24, gap: 12 }}>
        {/* Score circle with count-up */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, alignItems: "center", paddingVertical: 24 }]}>
          <View style={[s.scoreCircle, {
            borderColor: accColor, shadowColor: accColor, shadowOpacity: 0.3,
            shadowRadius: 16, elevation: 8,
          }]}>
            <Text style={[s.scorePctText, { color: accColor }]}>{Math.max(0, Math.round(scorePct))}%</Text>
            <Text style={{ fontSize: 12, color: theme.sub, fontWeight: "600" }}>score</Text>
          </View>
          <Text style={{ fontSize: 36, fontWeight: "900", color: accentColor, marginTop: 16 }}>
            {displayScore % 1 === 0 ? displayScore.toFixed(0) : displayScore.toFixed(1)}
            <Text style={{ fontSize: 18, color: theme.sub }}>
              /{attempt.maxScore % 1 === 0 ? attempt.maxScore : attempt.maxScore.toFixed(1)}
            </Text>
          </Text>
          <Text style={{ fontSize: 13, color: theme.sub, marginTop: 4 }}>
            Accuracy: <Text style={{ fontWeight: "800", color: accColor }}>{pctStr(attempt.accuracy, 0)}</Text>
          </Text>
          <ProgressBar value={scorePct} color={accentColor} theme={theme} />
        </View>

        {/* Correct / Wrong / Skipped */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: "row" }]}>
          <StatBox label="Correct"  value={String(attempt.correct)}  color={theme.green} />
          <Div theme={theme} />
          <StatBox label="Wrong"    value={String(attempt.wrong)}    color={theme.red} />
          <Div theme={theme} />
          <StatBox label="Skipped"  value={String(attempt.skipped)}  color={theme.amber} />
        </View>

        {/* Speed / Time / Mode */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: "row" }]}>
          <StatBox label="Time taken" value={formatDuration(attempt.timeTakenSec)} />
          <Div theme={theme} />
          <StatBox label="Speed"      value={`${Math.round(attempt.speedSecPerQ)}s/Q`} />
          <Div theme={theme} />
          <StatBox label="Mode"       value={attempt.mode.charAt(0).toUpperCase() + attempt.mode.slice(1)} />
        </View>

        {/* Time efficiency */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.sub, fontSize: 12, fontWeight: "700", marginBottom: 10 }}>TIME EFFICIENCY</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: theme.text, fontSize: 13 }}>
              Used: <Text style={{ fontWeight: "700" }}>{formatDuration(attempt.timeTakenSec)}</Text>
            </Text>
            <Text style={{ color: theme.text, fontSize: 13 }}>
              Allowed: <Text style={{ fontWeight: "700" }}>{formatDuration(attempt.timeAllowedSec)}</Text>
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: "hidden" }}>
            <View style={{
              width: `${Math.min(100, timeEfficiency)}%`, height: "100%", borderRadius: 4,
              backgroundColor: timeEfficiency > 90 ? theme.red : timeEfficiency > 70 ? theme.amber : theme.green,
            }} />
          </View>
          {timeSaved > 0 && (
            <Text style={{ color: theme.green, fontSize: 12, fontWeight: "700", marginTop: 6 }}>
              ⏱ {formatDuration(timeSaved)} remaining
            </Text>
          )}
        </View>

        {/* Marking scheme */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.sub, fontSize: 12, fontWeight: "700" }}>MARKING SCHEME</Text>
          <View style={{ flexDirection: "row", marginTop: 8, gap: 16 }}>
            <Text style={{ color: theme.green, fontWeight: "700" }}>
              ✓ +{questions[0]?.marks?.positive ?? 2} per correct
            </Text>
            <Text style={{ color: theme.red, fontWeight: "700" }}>
              ✗ −{questions[0]?.marks?.negative ?? 0.5} per wrong
            </Text>
          </View>
        </View>

        {/* Review answers section */}
        {loadingQs ? (
          <View style={{ alignItems: "center", paddingVertical: 28 }}>
            <Spinner size={64} icon="📝" label="Loading Review" />
          </View>
        ) : questions.length > 0 ? (
          <>
            <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12, letterSpacing: 1 }}>
              REVIEW ANSWERS
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["all", "wrong", "correct", "skipped"] as Review[]).map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setReview(r => r === f ? null : f)}
                  style={[s.filterBtn, {
                    backgroundColor: review === f ? accentColor : theme.bg2,
                    borderColor: review === f ? accentColor : theme.border,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: review === f ? "#fff" : theme.sub }}>
                    {f === "all" ? `All (${questions.length})`
                      : f === "wrong"   ? `Wrong (${attempt.wrong})`
                      : f === "correct" ? `Correct (${attempt.correct})`
                      : `Skipped (${attempt.skipped})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {review && filteredQ.map((q, _i) => {
              const ri  = questions.indexOf(q);
              const r   = attempt.perQuestion[ri];
              const isExpanded = expandedQid === q.qid;
              return (
                <TouchableOpacity
                  key={q.qid}
                  onPress={() => setExpandedQid(e => e === q.qid ? null : q.qid)}
                  activeOpacity={0.9}
                >
                  <View style={[s.card, {
                    backgroundColor: theme.card, borderColor: theme.border,
                    borderLeftWidth: 4,
                    borderLeftColor: r?.correct ? theme.green : r?.selected === null ? theme.amber : theme.red,
                  }]}>
                    <Text style={{ color: theme.sub, fontSize: 11 }}>
                      {r?.correct ? "✅ Correct" : r?.selected === null ? "⏭ Skipped" : "❌ Wrong"}
                      <Text style={{ color: theme.muted }}>  ·  Q{ri + 1}</Text>
                    </Text>
                    {isExpanded && !q.is_math && extractImages(q.question).map((url, i) => (
                      <QuestionImage key={i} uri={url} />
                    ))}
                    {q.is_math && isExpanded
                      ? <MathRenderer html={q.question} textColor={theme.text} fontSize={14} backgroundColor={theme.card} containerStyle={{ marginTop: 4 }} />
                      : <Text
                          style={{ color: theme.text, fontWeight: "600", marginTop: 4, lineHeight: 20 }}
                          numberOfLines={isExpanded ? undefined : 2}
                        >
                          {stripHtml(q.question)}
                        </Text>
                    }
                    {isExpanded && (
                      <>
                        <View style={{ marginTop: 12, gap: 6 }}>
                          {q.options.map(opt => {
                            const isCorrect  = q.answer.includes(opt.id);
                            const isSelected = r?.selected === opt.id;
                            const optBg = isCorrect ? theme.greenLt : isSelected && !isCorrect ? theme.redLt : theme.bg2;
                            const optTextColor = theme.text;
                            const optHasMath = /\\\(|\\\[|\$/.test(opt.value);
                            const optHasImg  = /<img/i.test(opt.value);
                            return (
                              <View key={opt.id} style={[s.reviewOpt, {
                                backgroundColor: optBg,
                                borderColor: isCorrect ? theme.green : isSelected ? theme.red : theme.border,
                              }]}>
                                <Text style={{ fontSize: 12, fontWeight: "700", color: theme.sub, marginRight: 8 }}>
                                  {String.fromCharCode(65 + opt.id)}
                                </Text>
                                {optHasMath || optHasImg
                                  ? <MathRenderer html={opt.value} textColor={optTextColor} fontSize={13} backgroundColor={optBg} containerStyle={{ flex: 1 }} />
                                  : <Text style={{ flex: 1, fontSize: 13, color: optTextColor, lineHeight: 18 }}>
                                      {stripHtml(opt.value)}
                                    </Text>
                                }
                                {isCorrect   && <Text style={{ color: theme.green, fontSize: 16 }}>✓</Text>}
                                {isSelected && !isCorrect && <Text style={{ color: theme.red, fontSize: 16 }}>✗</Text>}
                              </View>
                            );
                          })}
                        </View>
                        {q.explanation ? (
                          <View style={[s.explain, { backgroundColor: theme.blueLt, borderColor: theme.blue }]}>
                            <Text style={{ color: theme.blue, fontWeight: "800", marginBottom: 4 }}>💡 Explanation</Text>
                            {/\\\(|\\\[|\$/.test(q.explanation)
                              ? <MathRenderer html={q.explanation} textColor={theme.text} fontSize={13} backgroundColor={theme.blueLt} />
                              : <Text style={{ color: theme.text, fontSize: 13, lineHeight: 20 }}>
                                  {stripHtml(q.explanation)}
                                </Text>
                            }
                          </View>
                        ) : null}
                        {/* AI Concept button */}
                        <TouchableOpacity
                          onPress={() => setConceptQ(q)}
                          style={[{
                            marginTop: 8, borderRadius: 10, borderWidth: 1,
                            paddingHorizontal: 12, paddingVertical: 8,
                            flexDirection: "row", alignItems: "center", gap: 8,
                            backgroundColor: theme.primary + "12",
                            borderColor: theme.primary + "40",
                          }]}
                        >
                          <Text style={{ fontSize: 14 }}>🧠</Text>
                          <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}>
                            Understand concept (AI)
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}

        {/* Concept Modal */}
        <ConceptModal
          visible={conceptQ !== null}
          question={conceptQ}
          onClose={() => setConceptQ(null)}
        />

        {/* Actions */}
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: accentColor }]}
          onPress={() => router.back()}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
            {isHistoryReview ? "← Back to History" : "Practice Again ↩"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border }]}
          onPress={() => router.replace("/(tabs)")}
        >
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 16 }}>View Report Card 📊</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ProgressBar({ value, color, theme }: { value: number; color: string; theme: any }) {
  return (
    <View style={{ width: "100%", height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: "hidden", marginTop: 14 }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
      <Text style={{ fontSize: 22, fontWeight: "900", color: color || theme.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Div({ theme }: { theme: any }) {
  return <View style={{ width: 1, backgroundColor: theme.border, marginVertical: 6 }} />;
}

const s = StyleSheet.create({
  hero:        { paddingTop: 56, paddingBottom: 48, alignItems: "center", gap: 6 },
  heroEmoji:   { fontSize: 48 },
  heroTitle:   { fontSize: 28, fontWeight: "900", color: "#fff" },
  heroSub:     { fontSize: 14, color: "#ffffffCC" },
  card:        { borderRadius: 20, padding: 16, borderWidth: 1 },
  scoreCircle: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 6,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
  },
  scorePctText: { fontSize: 28, fontWeight: "900" },
  filterBtn:    { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  reviewOpt:    { flexDirection: "row", alignItems: "center", borderRadius: 10, padding: 10, borderWidth: 1 },
  explain:      { borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1 },
  actionBtn:    { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
});
