import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { fetchAttempts } from "../../lib/db";
import { useTheme } from "../../lib/theme-context";
import { subjectAccent, accuracyColor, pctStr } from "../../lib/theme";
import { formatDuration } from "../../lib/timer";
import type { Attempt, TopicStats } from "../../lib/types";

type Tab = "overall" | "subject" | "topic";
const TABS: Tab[] = ["overall", "subject", "topic"];

// ── Streak ─────────────────────────────────────────────────────────────────────
function computeStreak(attempts: Attempt[]): number {
  if (!attempts.length) return 0;
  const daySet = new Set<string>();
  attempts.forEach(a => {
    const d = new Date(a.createdAt);
    daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  });
  let streak = 0;
  let check = new Date();
  check.setHours(0, 0, 0, 0);
  while (true) {
    const key = `${check.getFullYear()}-${check.getMonth()}-${check.getDate()}`;
    if (!daySet.has(key)) break;
    streak++;
    check = new Date(check.getTime() - 86400000);
  }
  return streak;
}

// ── Compute topic stats from raw attempts (always accurate) ────────────────────
function buildTopicStats(attempts: Attempt[]): TopicStats[] {
  const map = new Map<string, TopicStats>();
  for (const a of attempts) {
    const prev = map.get(a.topicId) ?? {
      topicId: a.topicId, topicName: a.topicName, subject: a.subject,
      attempts: 0, totalQ: 0, correct: 0, wrong: 0, skipped: 0,
      totalTimeSec: 0, accuracy: 0, speedSecPerQ: 0, lastAttempt: 0,
    };
    const next: TopicStats = {
      ...prev,
      attempts:     prev.attempts + 1,
      totalQ:       prev.totalQ + a.nQuestions,
      correct:      prev.correct + a.correct,
      wrong:        prev.wrong + a.wrong,
      skipped:      prev.skipped + a.skipped,
      totalTimeSec: prev.totalTimeSec + a.timeTakenSec,
      lastAttempt:  Math.max(prev.lastAttempt, a.createdAt),
    };
    const ans = next.correct + next.wrong;
    next.accuracy     = ans > 0 ? (next.correct / ans) * 100 : 0;
    next.speedSecPerQ = next.totalQ > 0 ? next.totalTimeSec / next.totalQ : 0;
    map.set(a.topicId, next);
  }
  return [...map.values()];
}

// ── Subject aggregation ────────────────────────────────────────────────────────
interface SubjectSummary {
  subject: string;
  correct: number; wrong: number; skipped: number;
  totalQ: number; totalTimeSec: number;
  topicCount: number;
}

function buildSubjectStats(attempts: Attempt[]): SubjectSummary[] {
  const map = new Map<string, SubjectSummary>();
  const topicSets = new Map<string, Set<string>>();
  for (const a of attempts) {
    const prev = map.get(a.subject) ?? {
      subject: a.subject, correct: 0, wrong: 0, skipped: 0,
      totalQ: 0, totalTimeSec: 0, topicCount: 0,
    };
    map.set(a.subject, {
      ...prev,
      correct:      prev.correct + a.correct,
      wrong:        prev.wrong + a.wrong,
      skipped:      prev.skipped + a.skipped,
      totalQ:       prev.totalQ + a.nQuestions,
      totalTimeSec: prev.totalTimeSec + a.timeTakenSec,
    });
    const ts = topicSets.get(a.subject) ?? new Set<string>();
    ts.add(a.topicId);
    topicSets.set(a.subject, ts);
  }
  return [...map.entries()].map(([subj, s]) => ({
    ...s,
    topicCount: topicSets.get(subj)?.size ?? 0,
  }));
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ReportCard() {
  const { user }  = useAuth();
  const router    = useRouter();
  const { theme } = useTheme();

  const [tab,      setTab]      = useState<Tab>("overall");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Animated underline for tab switcher
  const tabAnim = useRef(new Animated.Value(0)).current;

  const onTabPress = (t: Tab) => {
    Animated.spring(tabAnim, { toValue: TABS.indexOf(t), useNativeDriver: false, friction: 7 }).start();
    setTab(t);
  };

  const load = useCallback(async (isRefresh = false) => {
    if (!user) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    const a = await fetchAttempts(user.uid, 500).catch(() => [] as Attempt[]);
    setAttempts(a);
    isRefresh ? setRefreshing(false) : setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats (computed from raw attempts — always accurate) ─────────────
  const topicStats    = useMemo(() => buildTopicStats(attempts), [attempts]);
  const subjectStats  = useMemo(() => buildSubjectStats(attempts), [attempts]);

  const totalAttempts = attempts.length;
  const totalQ        = attempts.reduce((s, a) => s + a.nQuestions, 0);
  const totalCorrect  = attempts.reduce((s, a) => s + a.correct, 0);
  const totalWrong    = attempts.reduce((s, a) => s + a.wrong, 0);
  const totalSkipped  = attempts.reduce((s, a) => s + a.skipped, 0);
  const totalTimeSec  = attempts.reduce((s, a) => s + a.timeTakenSec, 0);
  const answered      = totalCorrect + totalWrong;
  const accuracy      = answered > 0 ? (totalCorrect / answered) * 100 : 0;
  const speed         = totalQ > 0 ? totalTimeSec / totalQ : 0;
  const streak        = useMemo(() => computeStreak(attempts), [attempts]);

  // Weak: accuracy < 60% (clearly needs work)
  const weakTopics   = topicStats.filter(t => t.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  // Strong: accuracy >= 75% (proven strength)
  const strongTopics = topicStats.filter(t => t.accuracy >= 75).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
  // Practice Next: 60–74% accuracy (medium — close to strong, need a push) + not practiced in 7 days
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const practiceNext = useMemo(() => {
    const mediumAcc   = topicStats.filter(t => t.accuracy >= 60 && t.accuracy < 75);
    const dueReview   = topicStats.filter(t => t.lastAttempt < sevenDaysAgo && t.accuracy < 75);
    const combined    = new Map([...mediumAcc, ...dueReview].map(t => [t.topicId, t]));
    return [...combined.values()]
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3);
  }, [topicStats]);

  const bestTopic     = [...topicStats].sort((a, b) => b.accuracy - a.accuracy)[0] ?? null;
  const recentAttempts = attempts.slice(0, 5);

  // Tab indicator position
  const underlineLeft = tabAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ["0%", `${100 / 3}%`, `${200 / 3}%`],
  });

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: theme.text }]}>Report Card</Text>
          <Text style={[s.sub,   { color: theme.sub  }]}>SSC CGL · {totalAttempts} sessions</Text>
        </View>
        {streak > 0 && (
          <View style={[s.streakBadge, { backgroundColor: theme.amber + "22", borderColor: theme.amber }]}>
            <Text style={{ fontSize: 16 }}>🔥</Text>
            <Text style={{ fontSize: 15, fontWeight: "900", color: theme.amber }}>{streak}</Text>
          </View>
        )}
      </View>

      {totalAttempts === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 52 }}>📝</Text>
          <Text style={[s.emptyTitle, { color: theme.text }]}>No tests yet</Text>
          <Text style={{ color: theme.sub, textAlign: "center", fontSize: 14, lineHeight: 20 }}>
            Complete a test and your stats will appear here
          </Text>
          <TouchableOpacity
            style={[s.goBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push("/(tabs)/subjects")}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Start practicing →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* ── Tab bar ─────────────────────────────────────────────────────── */}
          <View style={[s.tabsWrap, { backgroundColor: theme.bg2 }]}>
            {TABS.map(t => (
              <TouchableOpacity key={t} style={s.tabBtn} onPress={() => onTabPress(t)} activeOpacity={0.7}>
                <Text style={[s.tabLabel, { color: tab === t ? theme.primary : theme.sub }]}>
                  {t === "overall" ? "Overall" : t === "subject" ? "Subject" : "Topic"}
                </Text>
              </TouchableOpacity>
            ))}
            {/* Animated underline */}
            <Animated.View style={[s.tabIndicator, { left: underlineLeft, backgroundColor: theme.primary }]} />
          </View>

          {/* ── OVERALL tab ─────────────────────────────────────────────────── */}
          {tab === "overall" && (
            <View style={{ padding: 16, gap: 12 }}>
              {/* Hero: streak + best topic */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={[s.heroCard, { backgroundColor: theme.amber + "18", borderColor: theme.amber + "60", flex: 1 }]}>
                  <Text style={{ fontSize: 28 }}>🔥</Text>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: theme.amber }}>{streak}</Text>
                  <Text style={{ fontSize: 11, color: theme.sub, marginTop: 1 }}>Day streak</Text>
                </View>
                {bestTopic ? (
                  <View style={[s.heroCard, { backgroundColor: theme.green + "18", borderColor: theme.green + "60", flex: 2 }]}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.sub, letterSpacing: 0.5 }}>BEST TOPIC</Text>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: theme.text, marginTop: 3 }} numberOfLines={1}>
                      {bestTopic.topicName}
                    </Text>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: theme.green, marginTop: 2 }}>
                      {pctStr(bestTopic.accuracy, 0)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Stats row 1 */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: "row" }]}>
                <Stat label="Tests"      value={String(totalAttempts)} />
                <Div theme={theme} />
                <Stat label="Questions"  value={totalQ.toLocaleString()} />
                <Div theme={theme} />
                <Stat label="Time spent" value={formatDuration(totalTimeSec)} />
              </View>

              {/* Stats row 2 */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: "row" }]}>
                <Stat label="Accuracy" value={pctStr(accuracy, 0)} color={accuracyColor(accuracy, theme)} />
                <Div theme={theme} />
                <Stat label="Correct"  value={String(totalCorrect)} color={theme.green} />
                <Div theme={theme} />
                <Stat label="Wrong"    value={String(totalWrong)}   color={theme.red} />
              </View>

              {/* Stats row 3 */}
              <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: "row" }]}>
                <Stat label="Skipped"     value={String(totalSkipped)} color={theme.amber} />
                <Div theme={theme} />
                <Stat label="Speed"       value={`${Math.round(speed)}s/Q`} />
                <Div theme={theme} />
                <Stat label="Topics done" value={String(topicStats.length)} />
              </View>

              {/* Accuracy trend */}
              {attempts.length >= 2 && (
                <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <Text style={{ color: theme.sub, fontSize: 12, fontWeight: "800" }}>
                      ACCURACY TREND · LAST {Math.min(10, attempts.length)} SESSIONS
                    </Text>
                    {attempts.length >= 2 && (() => {
                      const delta = attempts[0].accuracy - attempts[Math.min(4, attempts.length - 1)].accuracy;
                      return (
                        <Text style={{ fontSize: 11, fontWeight: "700", color: delta >= 0 ? theme.green : theme.red }}>
                          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}%
                        </Text>
                      );
                    })()}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 52 }}>
                    {[...attempts].slice(0, 10).reverse().map((a, i) => {
                      const barH = Math.max(6, (a.accuracy / 100) * 52);
                      return (
                        <View key={i} style={{ flex: 1, justifyContent: "flex-end", alignItems: "center" }}>
                          <View style={{ width: "100%", height: barH, backgroundColor: accuracyColor(a.accuracy, theme), borderRadius: 3 }} />
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 5 }}>
                    <Text style={{ fontSize: 10, color: theme.muted }}>Oldest</Text>
                    <Text style={{ fontSize: 10, color: theme.muted }}>Latest</Text>
                  </View>
                </View>
              )}

              {/* Recent sessions */}
              {recentAttempts.length > 0 && (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: theme.text }}>Recent Sessions</Text>
                    <TouchableOpacity onPress={() => router.push("/(tabs)/history")}>
                      <Text style={{ fontSize: 12, color: theme.primary, fontWeight: "700" }}>See all →</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {recentAttempts.map((a, i) => {
                      const col = accuracyColor(a.accuracy, theme);
                      return (
                        <View key={a.id ?? i} style={[s.sessionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: theme.text }} numberOfLines={1}>{a.topicName}</Text>
                          <Text style={{ fontSize: 20, fontWeight: "900", color: col, marginTop: 6 }}>
                            {pctStr(a.accuracy, 0)}
                          </Text>
                          <Text style={{ fontSize: 10, color: theme.sub, marginTop: 2 }}>
                            {a.correct}✓ {a.wrong}✗ {a.skipped}—
                          </Text>
                          <View style={[s.modePill, { backgroundColor: col + "20" }]}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: col }}>{a.mode.toUpperCase()}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Practice Next — medium accuracy topics, no overlap with weak/strong */}
              {practiceNext.length > 0 && (
                <>
                  <SectionHeader title="📌 Practice Next" />
                  {practiceNext.map(t => (
                    <View key={t.topicId} style={[s.card, {
                      backgroundColor: theme.card, borderColor: theme.border,
                      flexDirection: "row", alignItems: "center",
                    }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }} numberOfLines={1}>
                          {t.topicName}
                        </Text>
                        <Text style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>
                          {t.subject.replace(/_/g, " ")}
                          {t.lastAttempt < sevenDaysAgo ? " · 7+ days ago" : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 17, fontWeight: "900", color: accuracyColor(t.accuracy, theme) }}>
                          {pctStr(t.accuracy, 0)}
                        </Text>
                        <Text style={{ fontSize: 10, color: theme.sub }}>{t.attempts} sessions</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Weak topics (< 60%) */}
              {weakTopics.length > 0 && (
                <>
                  <SectionHeader title="🔴 Needs work  (<60% accuracy)" />
                  {weakTopics.map(t => <TopicRow key={t.topicId} t={t} />)}
                </>
              )}

              {/* Strong topics (≥ 75%) */}
              {strongTopics.length > 0 && (
                <>
                  <SectionHeader title="🟢 Strong topics  (≥75% accuracy)" />
                  {strongTopics.map(t => <TopicRow key={t.topicId} t={t} />)}
                </>
              )}

              {/* If no categorized topics yet */}
              {weakTopics.length === 0 && strongTopics.length === 0 && practiceNext.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <Text style={{ color: theme.sub, fontSize: 13 }}>Take more tests to see detailed insights</Text>
                </View>
              )}
            </View>
          )}

          {/* ── SUBJECT tab ─────────────────────────────────────────────────── */}
          {tab === "subject" && (
            <View style={{ padding: 16, gap: 12 }}>
              {subjectStats.length === 0 ? (
                <Text style={{ color: theme.sub, textAlign: "center", marginTop: 24 }}>No data yet</Text>
              ) : (
                subjectStats.map(s => {
                  const answered = s.correct + s.wrong;
                  const acc = answered > 0 ? (s.correct / answered) * 100 : 0;
                  const col = subjectAccent(s.subject.replace(/_/g, " "), theme);
                  return (
                    <View key={s.subject} style={[styles.card, {
                      backgroundColor: theme.card, borderColor: theme.border,
                      borderLeftColor: col, borderLeftWidth: 4,
                    }]}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: col }}>
                        {s.subject.replace(/_/g, " ")}
                      </Text>

                      <View style={{ flexDirection: "row", marginTop: 14 }}>
                        <Stat label="Topics"    value={String(s.topicCount)} />
                        <Stat label="Questions" value={s.totalQ.toLocaleString()} />
                        <Stat label="Accuracy"  value={pctStr(acc, 0)} color={accuracyColor(acc, theme)} />
                        <Stat label="Time"      value={formatDuration(s.totalTimeSec)} />
                      </View>

                      {/* Bar: correct / wrong / skipped */}
                      <AccBar correct={s.correct} wrong={s.wrong} skipped={s.skipped} theme={theme} />

                      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                        <Text style={{ fontSize: 12, color: theme.sub }}>
                          <Text style={{ color: theme.green, fontWeight: "700" }}>✓ {s.correct}</Text>
                          {"  "}
                          <Text style={{ color: theme.red, fontWeight: "700" }}>✗ {s.wrong}</Text>
                          {"  "}
                          <Text style={{ color: theme.muted }}>— {s.skipped}</Text>
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ── TOPIC tab ───────────────────────────────────────────────────── */}
          {tab === "topic" && (
            <View style={{ padding: 16, gap: 8 }}>
              {topicStats.length === 0 ? (
                <Text style={{ color: theme.sub, textAlign: "center", marginTop: 24 }}>No topics practiced yet</Text>
              ) : (
                [...topicStats]
                  .sort((a, b) => b.lastAttempt - a.lastAttempt)
                  .map(t => <TopicRow key={t.topicId} t={t} showSubject />)
              )}
            </View>
          )}
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color: color ?? theme.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Div({ theme }: { theme: any }) {
  return <View style={{ width: 1, backgroundColor: theme.border, marginVertical: 6 }} />;
}

function SectionHeader({ title }: { title: string }) {
  const { theme } = useTheme();
  return <Text style={{ fontSize: 14, fontWeight: "800", color: theme.text, marginTop: 4 }}>{title}</Text>;
}

function TopicRow({ t, showSubject }: { t: TopicStats; showSubject?: boolean }) {
  const { theme } = useTheme();
  const col = accuracyColor(t.accuracy, theme);
  return (
    <View style={[styles.card, {
      backgroundColor: theme.card, borderColor: theme.border,
      flexDirection: "row", alignItems: "center", gap: 12,
    }]}>
      <View style={{ flex: 1 }}>
        {showSubject && (
          <Text style={{ fontSize: 10, color: theme.sub, marginBottom: 1, fontWeight: "600" }}>
            {t.subject.replace(/_/g, " ")}
          </Text>
        )}
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text }} numberOfLines={1}>
          {t.topicName}
        </Text>
        <Text style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>
          {t.attempts} sessions · {t.totalQ} Qs · {Math.round(t.speedSecPerQ)}s/Q
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 17, fontWeight: "800", color: col }}>{pctStr(t.accuracy, 0)}</Text>
        <Text style={{ fontSize: 10, color: theme.sub, marginTop: 1 }}>
          {t.correct}✓ {t.wrong}✗
        </Text>
      </View>
    </View>
  );
}

function AccBar({ correct, wrong, skipped, theme }: { correct: number; wrong: number; skipped: number; theme: any }) {
  const total = correct + wrong + skipped;
  if (total === 0) return null;
  return (
    <View style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
      <View style={{ flex: correct,  backgroundColor: theme.green  }} />
      <View style={{ flex: wrong,    backgroundColor: theme.red    }} />
      <View style={{ flex: skipped,  backgroundColor: theme.border }} />
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 16, borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
});

const s = StyleSheet.create({
  header:    { padding: 20, paddingTop: 56, flexDirection: "row", alignItems: "center" },
  title:     { fontSize: 26, fontWeight: "900" },
  sub:       { fontSize: 13, marginTop: 2 },
  streakBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
  },
  tabsWrap: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 4,
    borderRadius: 12, padding: 3, position: "relative",
  },
  tabBtn:   { flex: 1, paddingVertical: 9, alignItems: "center" },
  tabLabel: { fontSize: 13, fontWeight: "700" },
  tabIndicator: {
    position: "absolute", bottom: 3, height: 3, width: `${100 / 3}%`,
    borderRadius: 2,
  },
  heroCard: {
    borderRadius: 16, borderWidth: 1.5, padding: 14,
    alignItems: "center", justifyContent: "center", gap: 2,
  },
  sessionCard: {
    borderRadius: 14, borderWidth: 1, padding: 12, width: 128,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  modePill: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start" },
  card: {
    borderRadius: 16, padding: 16, borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  empty:     { alignItems: "center", marginTop: 80, gap: 12, padding: 24 },
  emptyTitle: { fontSize: 22, fontWeight: "800" },
  goBtn:     { borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
});
