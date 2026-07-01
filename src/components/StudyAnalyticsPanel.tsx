import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../lib/auth-context";
import { useTheme } from "../lib/theme-context";
import { fetchStudyLog, fetchStudyLogs, fetchStudyLogRange, saveStudyLog } from "../lib/db";
import { getStudySources, getStudyTargets, loadStudySettings } from "../lib/settings";
import { STUDY_SUBJECTS, SUBJECT_COLORS } from "../lib/types";
import type { StudyLog, StudySession, StudySource, StudySubject, SubjectTarget } from "../lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr()     { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function fmtMin(min: number) {
  if (min === 0) return "0m";
  if (min < 60)  return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function shortDay(ds: string) {
  return new Date(ds + "T12:00:00").toLocaleDateString("en", { weekday: "short" });
}
function fmtViewDate(ds: string) {
  const today = todayStr();
  if (ds === today) return "Today";
  if (ds === yesterdayStr()) return "Yesterday";
  const d = new Date(ds + "T12:00:00");
  const now = new Date();
  return d.toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
function updateLogsArr(logs: StudyLog[], updated: StudyLog): StudyLog[] {
  const idx = logs.findIndex(l => l.date === updated.date);
  if (idx >= 0) { const n = [...logs]; n[idx] = updated; return n; }
  return [...logs, updated].sort((a, b) => a.date.localeCompare(b.date));
}
function logToSubjects(log: StudyLog | null): Partial<Record<StudySubject, number>> {
  const out: Partial<Record<StudySubject, number>> = {};
  if (!log) return out;
  for (const s of log.sessions) {
    out[s.subject as StudySubject] = (out[s.subject as StudySubject] ?? 0) + s.durationMin;
  }
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TrendPeriod = "week" | "month" | "4weeks" | "year";
type HeatPeriod  = "month" | "quarter" | "year";

interface TrendPoint {
  value: number;
  label: string;
  subjects: Partial<Record<StudySubject, number>>;
}

// ── Chart: Line + Area ────────────────────────────────────────────────────────

function LineAreaChart({ data, color, height = 120 }: {
  data: TrendPoint[]; color: string; height?: number;
}) {
  const { theme } = useTheme();
  const [w, setW] = useState(0);
  const n = data.length;
  const max = Math.max(...data.map(d => d.value), 1);
  const PAD = 8;

  const ptX = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const ptY = (v: number) => height - PAD - Math.round((v / max) * (height - PAD * 2));

  return (
    <View>
      <View
        style={{ height, position: "relative" }}
        onLayout={e => setW(e.nativeEvent.layout.width)}
      >
        {/* Horizontal grid */}
        {[0.25, 0.5, 0.75].map(f => (
          <View key={f} style={{
            position: "absolute", left: 0, right: 0,
            top: ptY(max * f), height: 1,
            backgroundColor: theme.border, opacity: 0.6,
          }} />
        ))}

        {/* Area fill – vertical curtain strips from each point to bottom */}
        {w > 0 && n > 1 && data.map((d, i) => {
          const x = ptX(i);
          const nextX = i < n - 1 ? ptX(i + 1) : w;
          const fillW = i === 0 ? nextX - x : nextX - x;
          const y = ptY(d.value);
          return (
            <View key={i} style={{
              position: "absolute",
              left: x, top: y,
              width: Math.max(1, fillW),
              height: height - y - 1,
              backgroundColor: color + "18",
            }} />
          );
        })}

        {/* Line segments */}
        {w > 0 && data.slice(0, -1).map((d, i) => {
          const x1 = ptX(i), y1 = ptY(d.value);
          const x2 = ptX(i + 1), y2 = ptY(data[i + 1].value);
          const dx = x2 - x1, dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <View key={i} style={{
              position: "absolute",
              left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 2,
              width: len, height: 4,
              backgroundColor: color, borderRadius: 2,
              transform: [{ rotate: `${angle}deg` }],
            }} />
          );
        })}

        {/* Dots */}
        {w > 0 && data.map((d, i) => (
          <View key={i} style={{
            position: "absolute",
            left: ptX(i) - 6, top: ptY(d.value) - 6,
            width: 12, height: 12, borderRadius: 6,
            backgroundColor: theme.card,
            borderWidth: 3, borderColor: d.value > 0 ? color : theme.border,
          }} />
        ))}

        {/* Top value label for max point */}
        {w > 0 && (() => {
          const maxIdx = data.reduce((best, d, i) => d.value > data[best].value ? i : best, 0);
          if (data[maxIdx].value === 0) return null;
          return (
            <View style={{ position: "absolute", left: ptX(maxIdx) - 20, top: ptY(data[maxIdx].value) - 20, width: 40 }}>
              <Text style={{ textAlign: "center", fontSize: 9, fontWeight: "800", color }}>{fmtMin(data[maxIdx].value)}</Text>
            </View>
          );
        })()}
      </View>

      {/* X labels */}
      <View style={{ height: 20, position: "relative" }}>
        {w > 0 && data.map((d, i) => {
          if (n > 15 && i % Math.ceil(n / 10) !== 0) return null;
          return (
            <Text key={i} style={{
              position: "absolute", left: ptX(i) - 14, width: 28,
              textAlign: "center", fontSize: 9, color: theme.sub, top: 4,
            }}>
              {d.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ── Chart: Stacked Subject Bars ───────────────────────────────────────────────

function SubjectStackBar({ data, height = 100 }: { data: TrendPoint[]; height?: number }) {
  const { theme } = useTheme();
  const max = Math.max(...data.map(d => d.value), 1);
  const n = data.length;
  const many = n > 20;

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: many ? 1 : 3, height: height + 22 }}>
      {data.map((item, i) => {
        const total = item.value;
        const barH = Math.max(total > 0 ? 6 : 0, Math.round((total / max) * height));
        return (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
            {/* value label for small sets */}
            {!many && total > 0 && (
              <Text style={{ fontSize: 7, color: theme.muted, marginBottom: 2, fontWeight: "700" }}>
                {Math.round(total / 60)}h
              </Text>
            )}
            <View style={{ width: "100%", height: barH, borderTopLeftRadius: 5, borderTopRightRadius: 5, overflow: "hidden" }}>
              {STUDY_SUBJECTS.map(sub => {
                const mins = item.subjects[sub] ?? 0;
                if (mins === 0 || total === 0) return null;
                const segH = Math.round((mins / total) * barH);
                if (segH < 1) return null;
                return <View key={sub} style={{ height: segH, backgroundColor: SUBJECT_COLORS[sub] }} />;
              })}
            </View>
            {(!many || i % Math.ceil(n / 8) === 0) && (
              <Text style={{ fontSize: many ? 6 : 8, color: theme.sub, marginTop: 4 }}>{item.label}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 16, overflow: "hidden" }}>
      <LinearGradient colors={[color + "22", color + "08"]} style={{ padding: 14 }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color }}>{value}</Text>
        {sub ? <Text style={{ fontSize: 10, color, fontWeight: "700", opacity: 0.8, marginTop: 1 }}>{sub}</Text> : null}
        <Text style={{ fontSize: 11, color: theme.sub, marginTop: 4 }}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function StudyAnalyticsPanel() {
  const { user }  = useAuth();
  const { theme } = useTheme();

  const [loading,       setLoading]       = useState(true);
  const [weekLogs,      setWeekLogs]      = useState<StudyLog[]>([]);
  const [monthLogs,     setMonthLogs]     = useState<StudyLog[]>([]);
  const [quarterLogs,   setQuarterLogs]   = useState<StudyLog[]>([]);
  const [yearLogs,      setYearLogs]      = useState<StudyLog[]>([]);
  const [targets,       setTargets]       = useState<SubjectTarget[]>([]);
  const [sources,       setSources]       = useState<StudySource[]>([]);
  const [quarterLoaded, setQuarterLoaded] = useState(false);
  const [yearLoaded,    setYearLoaded]    = useState(false);

  const dateStr = todayStr();
  const [viewDate,    setViewDate]    = useState(yesterdayStr());
  const [viewLog,     setViewLog]     = useState<StudyLog | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("week");
  const [heatPeriod,  setHeatPeriod]  = useState<HeatPeriod>("month");

  const [modalOpen,  setModalOpen]  = useState(false);
  const [selSubject, setSelSubject] = useState<StudySubject>("Maths");
  const [selSource,  setSelSource]  = useState("");
  const [duration,   setDuration]   = useState("");
  const [mcqInput,   setMcqInput]   = useState("");
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    await loadStudySettings();
    setTargets(getStudyTargets());
    setSources(getStudySources());
    const [wl, ml] = await Promise.all([fetchStudyLogs(user.uid, 7), fetchStudyLogs(user.uid, 30)]);
    setWeekLogs(wl); setMonthLogs(ml);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    setViewLoading(true);
    fetchStudyLog(user.uid, viewDate)
      .then(log => setViewLog(log))
      .finally(() => setViewLoading(false));
  }, [user, viewDate]);

  const loadQuarter = useCallback(async () => {
    if (!user || quarterLoaded) return;
    setQuarterLoaded(true);
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89).toISOString().slice(0, 10);
    const logs = await fetchStudyLogRange(user.uid, from, dateStr).catch(() => [] as StudyLog[]);
    setQuarterLogs(logs);
  }, [user, quarterLoaded, dateStr]);

  const loadYear = useCallback(async () => {
    if (!user || yearLoaded) return;
    setYearLoaded(true);
    const now  = new Date();
    const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10);
    const logs = await fetchStudyLogRange(user.uid, from, dateStr).catch(() => [] as StudyLog[]);
    setYearLogs(logs);
  }, [user, yearLoaded, dateStr]);

  useEffect(() => {
    if (trendPeriod === "year" || heatPeriod === "year") loadYear();
    if (heatPeriod === "quarter") loadQuarter();
  }, [trendPeriod, heatPeriod, loadYear, loadQuarter]);

  // ── Day derived ────────────────────────────────────────────────────────────
  const sessions     = viewLog?.sessions ?? [];
  const totalMinutes = sessions.reduce((a, s) => a + s.durationMin, 0);
  const totalMcqs    = sessions.reduce((a, s) => a + s.mcqs, 0);
  const totalTgtMin  = targets.reduce((a, t) => a + t.dailyMinutes, 0);
  const totalTgtMcqs = targets.reduce((a, t) => a + t.dailyMcqs, 0);
  const focusScore   = totalTgtMin  > 0 ? Math.min(100, Math.round(totalMinutes / totalTgtMin  * 100)) : 0;
  const mcqScore     = totalTgtMcqs > 0 ? Math.min(100, Math.round(totalMcqs   / totalTgtMcqs * 100)) : 0;
  const prepIndex    = Math.min(100, Math.round(focusScore * 0.6 + mcqScore * 0.4));
  const isViewingToday = viewDate === dateStr;

  const subjectTotals = STUDY_SUBJECTS.map(sub => {
    const ss = sessions.filter(s => s.subject === sub);
    return { subject: sub, minutes: ss.reduce((a, s) => a + s.durationMin, 0), mcqs: ss.reduce((a, s) => a + s.mcqs, 0) };
  });
  const scoreColor = (v: number) =>
    v >= 100 ? theme.green : v >= 70 ? theme.amber : v > 0 ? theme.red : theme.muted;

  const shiftDay = (delta: number) => {
    const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next <= dateStr) setViewDate(next);
  };

  // ── Trend data ─────────────────────────────────────────────────────────────
  const trendData = useMemo((): TrendPoint[] => {
    if (trendPeriod === "week") {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        const ds  = d.toISOString().slice(0, 10);
        const log = weekLogs.find(l => l.date === ds) ?? null;
        const subjects = logToSubjects(log);
        return { value: Object.values(subjects).reduce((a, b) => a + b, 0), label: shortDay(ds), subjects };
      });
    }
    if (trendPeriod === "month") {
      const now = new Date(), days = now.getDate();
      return Array.from({ length: days }, (_, i) => {
        const d  = new Date(now.getFullYear(), now.getMonth(), i + 1);
        const ds = d.toISOString().slice(0, 10);
        const log = monthLogs.find(l => l.date === ds) ?? null;
        const subjects = logToSubjects(log);
        return { value: Object.values(subjects).reduce((a, b) => a + b, 0), label: String(i + 1), subjects };
      });
    }
    if (trendPeriod === "4weeks") {
      return [0, 1, 2, 3].map(wk => {
        const subjects: Partial<Record<StudySubject, number>> = {};
        let total = 0;
        for (let d = 0; d < 7; d++) {
          const offset = (3 - wk) * 7 + (6 - d);
          const dt = new Date(); dt.setDate(dt.getDate() - offset);
          const log = monthLogs.find(l => l.date === dt.toISOString().slice(0, 10));
          if (log) for (const s of log.sessions) {
            subjects[s.subject as StudySubject] = (subjects[s.subject as StudySubject] ?? 0) + s.durationMin;
            total += s.durationMin;
          }
        }
        return { value: total, label: `W${wk + 1}`, subjects };
      });
    }
    if (!yearLoaded) return [];
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d  = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const yr = d.getFullYear(), mo = d.getMonth();
      const from = `${yr}-${String(mo + 1).padStart(2, "0")}-01`;
      const to   = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(new Date(yr, mo + 1, 0).getDate()).padStart(2, "0")}`;
      const subjects: Partial<Record<StudySubject, number>> = {};
      let total = 0;
      for (const log of yearLogs) {
        if (log.date < from || log.date > to) continue;
        for (const s of log.sessions) {
          subjects[s.subject as StudySubject] = (subjects[s.subject as StudySubject] ?? 0) + s.durationMin;
          total += s.durationMin;
        }
      }
      return { value: total, label: d.toLocaleDateString("en", { month: "short" }), subjects };
    });
  }, [trendPeriod, weekLogs, monthLogs, yearLogs, yearLoaded]);

  // ── Heatmap ────────────────────────────────────────────────────────────────
  const heatmapData = useMemo(() => {
    const days     = heatPeriod === "month" ? 30 : heatPeriod === "quarter" ? 90 : 365;
    const logsPool = heatPeriod === "month" ? monthLogs : heatPeriod === "quarter" ? quarterLogs : yearLogs;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
      const ds = d.toISOString().slice(0, 10);
      const log = logsPool.find(l => l.date === ds);
      const mins  = log ? log.sessions.reduce((a, s) => a + s.durationMin, 0) : 0;
      return { ds, mins, isToday: ds === dateStr, level: Math.min(12, Math.floor(mins / 60)) };
    });
  }, [heatPeriod, monthLogs, quarterLogs, yearLogs, dateStr]);

  // 3-band heat colors: red 1-4h, amber 5-8h, green 9-12h
  const heatColor = (level: number): string => {
    if (level === 0) return theme.border;
    if (level <= 4) return (["#FCA5A5","#F87171","#EF4444","#DC2626"] as const)[level - 1];
    if (level <= 8) return (["#FDE68A","#FCD34D","#F59E0B","#D97706"] as const)[level - 5];
    return (["#86EFAC","#4ADE80","#22C55E","#16A34A"] as const)[Math.min(3, level - 9)];
  };
  const cellSize = heatPeriod === "month" ? 20 : heatPeriod === "quarter" ? 14 : 9;
  const cellGap  = heatPeriod === "month" ? 4  : heatPeriod === "quarter" ? 3  : 2;

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const openModal = () => {
    setSelSubject("Maths");
    setSelSource(sources.find(s => s.enabled)?.id ?? "book");
    setDuration(""); setMcqInput(""); setModalOpen(true);
  };

  const saveSession = async () => {
    if (!user) return;
    const dMin = parseInt(duration, 10);
    if (!dMin || dMin <= 0) { Alert.alert("Enter a valid duration"); return; }
    if (!selSource)          { Alert.alert("Select a study source");  return; }
    setSaving(true);
    try {
      const session: StudySession = {
        id: Date.now().toString(), subject: selSubject, sourceId: selSource,
        durationMin: dMin, mcqs: parseInt(mcqInput, 10) || 0, timestamp: Date.now(),
      };
      const updated: StudyLog = { date: viewDate, sessions: [...sessions, session], updatedAt: Date.now() };
      await saveStudyLog(user.uid, updated);
      setViewLog(updated);
      [setWeekLogs, setMonthLogs, setQuarterLogs, setYearLogs].forEach(set =>
        set(p => updateLogsArr(p, updated)));
      setModalOpen(false);
    } finally { setSaving(false); }
  };

  const deleteSession = async (id: string) => {
    if (!user) return;
    Alert.alert("Delete Session", "Remove this session?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const updated: StudyLog = { date: viewDate, sessions: sessions.filter(s => s.id !== id), updatedAt: Date.now() };
        await saveStudyLog(user.uid, updated);
        setViewLog(updated);
        [setWeekLogs, setMonthLogs, setQuarterLogs, setYearLogs].forEach(set =>
          set(p => updateLogsArr(p, updated)));
      }},
    ]);
  };

  if (!user) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: theme.sub }}>Please log in.</Text>
    </View>
  );

  const trendLoading = trendPeriod === "year" && !yearLoaded;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* ── Date nav ──────────────────────────────────────────────────── */}
        <View style={sa.dateRow}>
          <TouchableOpacity onPress={() => shiftDay(-1)} style={[sa.navBtn, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
            <Text style={{ color: theme.text, fontSize: 20 }}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontWeight: "800", fontSize: 16, color: theme.text }}>{fmtViewDate(viewDate)}</Text>
            {!isViewingToday && (
              <TouchableOpacity onPress={() => setViewDate(dateStr)}>
                <Text style={{ fontSize: 11, color: theme.primary, fontWeight: "700", marginTop: 2 }}>Jump to Today →</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => shiftDay(1)} disabled={isViewingToday}
            style={[sa.navBtn, { backgroundColor: theme.bg2, borderColor: theme.border, opacity: isViewingToday ? 0.25 : 1 }]}
          >
            <Text style={{ color: theme.text, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Metric cards ──────────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <MetricCard label="Study Time"  value={fmtMin(totalMinutes)}    color={theme.primary} />
          <MetricCard label="MCQs Solved" value={String(totalMcqs)}        color={theme.blue}    />
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <MetricCard label="Focus Score" value={`${focusScore}%`}         color={scoreColor(focusScore)} />
          <MetricCard label="Prep Index"  value={`${prepIndex}%`}          color={scoreColor(prepIndex)}  />
        </View>

        {/* ── Log button ────────────────────────────────────────────────── */}
        <TouchableOpacity style={[sa.addBtn, { backgroundColor: theme.primary }]} onPress={openModal} activeOpacity={0.8}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
            {isViewingToday ? "+ Log Study Session" : `+ Log for ${fmtViewDate(viewDate)}`}
          </Text>
        </TouchableOpacity>

        {/* ── Sessions ──────────────────────────────────────────────────── */}
        {sessions.length > 0 ? (
          <>
            <Text style={[sa.section, { color: theme.sub }]}>
              {fmtViewDate(viewDate).toUpperCase()}'S SESSIONS
            </Text>
            {sessions.map(session => {
              const src = sources.find(sc => sc.id === session.sourceId);
              const col = SUBJECT_COLORS[session.subject] ?? theme.primary;
              return (
                <View key={session.id} style={[sa.sessionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={[sa.subjectDot, { backgroundColor: col }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", fontSize: 13, color: theme.text }}>{session.subject}</Text>
                    <Text style={{ fontSize: 11, color: theme.sub, marginTop: 1 }}>
                      {src?.label ?? session.sourceId} · {fmtMin(session.durationMin)}
                      {session.mcqs > 0 ? ` · ${session.mcqs} MCQs` : ""}
                    </Text>
                  </View>
                  {isViewingToday && (
                    <TouchableOpacity onPress={() => deleteSession(session.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ color: theme.red, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        ) : !loading && !viewLoading && (
          <View style={[sa.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ fontSize: 36, marginBottom: 6 }}>📚</Text>
            <Text style={{ color: theme.sub, fontWeight: "700" }}>No sessions logged</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>Tap "+" above to add one</Text>
          </View>
        )}

        {/* ── Subject progress ──────────────────────────────────────────── */}
        <Text style={[sa.section, { color: theme.sub }]}>SUBJECT PROGRESS</Text>
        <View style={[sa.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {subjectTotals.map(st => {
            const tgt     = targets.find(t => t.subject === st.subject);
            const tMin    = tgt?.dailyMinutes ?? 60;
            const tMcqs   = tgt?.dailyMcqs    ?? 20;
            const timePct = tMin  > 0 ? Math.min(100, Math.round(st.minutes / tMin  * 100)) : 0;
            const mcqPct  = tMcqs > 0 ? Math.min(100, Math.round(st.mcqs   / tMcqs * 100)) : 0;
            const col     = SUBJECT_COLORS[st.subject] ?? theme.primary;
            const statCol = scoreColor(timePct);
            return (
              <View key={st.subject} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <View style={[sa.subjectDot, { backgroundColor: col }]} />
                  <Text style={{ flex: 1, fontWeight: "700", fontSize: 13, color: theme.text }}>{st.subject}</Text>
                  <View style={{ backgroundColor: statCol + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: "900", color: statCol }}>{timePct}%</Text>
                  </View>
                </View>
                <View style={[sa.barTrack, { backgroundColor: theme.border }]}>
                  <View style={{ width: `${timePct}%` as any, height: "100%", borderRadius: 4 }}>
                    <LinearGradient colors={[col, col + "CC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 4 }} />
                  </View>
                </View>
                <Text style={{ fontSize: 10, color: theme.muted, marginTop: 3, textAlign: "right" }}>
                  {fmtMin(st.minutes)} / {fmtMin(tMin)} time · {st.mcqs}/{tMcqs} MCQs
                </Text>
              </View>
            );
          })}
        </View>

        {/* ── Study Trend ───────────────────────────────────────────────── */}
        <Text style={[sa.section, { color: theme.sub }]}>STUDY TREND</Text>
        <View style={[sa.toggleRow, { backgroundColor: theme.bg2 }]}>
          {(["week", "month", "4weeks", "year"] as const).map(p => (
            <TouchableOpacity
              key={p} onPress={() => setTrendPeriod(p)}
              style={[sa.togglePill, trendPeriod === p && { backgroundColor: theme.card, elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3 }]}
            >
              <Text style={{ fontSize: 12, fontWeight: trendPeriod === p ? "800" : "400", color: trendPeriod === p ? theme.primary : theme.sub }}>
                {p === "week" ? "Week" : p === "month" ? "Month" : p === "4weeks" ? "4 Weeks" : "Year"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {trendLoading ? (
          <View style={[sa.card, { backgroundColor: theme.card, borderColor: theme.border, alignItems: "center", paddingVertical: 40 }]}>
            <Text style={{ color: theme.muted }}>Loading year…</Text>
          </View>
        ) : trendData.length === 0 ? (
          <View style={[sa.card, { backgroundColor: theme.card, borderColor: theme.border, alignItems: "center", paddingVertical: 40 }]}>
            <Text style={{ color: theme.muted }}>No data for this period</Text>
          </View>
        ) : (
          <>
            {/* Line chart */}
            <View style={[sa.card, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 10 }]}>
              <Text style={[sa.chartTitle, { color: theme.sub }]}>TOTAL HOURS</Text>
              <LineAreaChart data={trendData} color={theme.primary} height={110} />
            </View>

            {/* Stacked subject bars */}
            <View style={[sa.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[sa.chartTitle, { color: theme.sub }]}>BY SUBJECT</Text>
              <SubjectStackBar data={trendData} height={96} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
                {STUDY_SUBJECTS.filter(sub => trendData.some(d => (d.subjects[sub] ?? 0) > 0)).map(sub => (
                  <View key={sub} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: SUBJECT_COLORS[sub] }} />
                    <Text style={{ fontSize: 10, color: theme.sub }}>{sub}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── Day breakdown ─────────────────────────────────────────────── */}
        {sessions.length > 0 && (
          <>
            <Text style={[sa.section, { color: theme.sub }]}>DAY BREAKDOWN</Text>
            <View style={[sa.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {subjectTotals.filter(st => st.minutes > 0).map(st => {
                const pct = totalMinutes > 0 ? (st.minutes / totalMinutes) * 100 : 0;
                const col = SUBJECT_COLORS[st.subject] ?? theme.primary;
                return (
                  <View key={st.subject} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <View style={[sa.subjectDot, { backgroundColor: col }]} />
                    <Text style={{ fontSize: 11, color: theme.text, width: 96 }} numberOfLines={1}>{st.subject}</Text>
                    <View style={[sa.barTrack, { backgroundColor: theme.border }]}>
                      <View style={{ width: `${pct}%` as any, height: "100%", backgroundColor: col, borderRadius: 4 }} />
                    </View>
                    <Text style={{ fontSize: 11, color: theme.sub, width: 38, textAlign: "right" }}>{fmtMin(st.minutes)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Heatmap ───────────────────────────────────────────────────── */}
        <Text style={[sa.section, { color: theme.sub }]}>CONSISTENCY HEATMAP</Text>
        <View style={[sa.toggleRow, { backgroundColor: theme.bg2 }]}>
          {(["month", "quarter", "year"] as const).map(p => (
            <TouchableOpacity
              key={p} onPress={() => setHeatPeriod(p)}
              style={[sa.togglePill, heatPeriod === p && { backgroundColor: theme.card, elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3 }]}
            >
              <Text style={{ fontSize: 12, fontWeight: heatPeriod === p ? "800" : "400", color: heatPeriod === p ? theme.primary : theme.sub }}>
                {p === "month" ? "Month" : p === "quarter" ? "Quarter" : "Year"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[sa.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {(heatPeriod === "quarter" && !quarterLoaded) || (heatPeriod === "year" && !yearLoaded) ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Text style={{ color: theme.muted }}>Loading…</Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: cellGap }}>
                {heatmapData.map((cell, i) => (
                  <View key={i} style={{
                    width: cellSize, height: cellSize,
                    borderRadius: Math.max(2, Math.floor(cellSize / 4)),
                    backgroundColor: heatColor(cell.level),
                    borderWidth: cell.isToday ? 2 : 0,
                    borderColor: theme.primary,
                  }} />
                ))}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12, flexWrap: "wrap" }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: theme.border }} />
                <Text style={{ fontSize: 8, color: theme.muted, marginRight: 6 }}>0h</Text>
                <Text style={{ fontSize: 8, color: theme.muted }}>1–4h</Text>
                {[1,2,3,4].map(l => <View key={l} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: heatColor(l) }} />)}
                <Text style={{ fontSize: 8, color: theme.muted, marginLeft: 4 }}>5–8h</Text>
                {[5,6,7,8].map(l => <View key={l} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: heatColor(l) }} />)}
                <Text style={{ fontSize: 8, color: theme.muted, marginLeft: 4 }}>9h+</Text>
                {[9,10,11,12].map(l => <View key={l} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: heatColor(l) }} />)}
              </View>
            </>
          )}
        </View>

      </ScrollView>

      {/* ── Log Modal ─────────────────────────────────────────────────────── */}
      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setModalOpen(false)} />
          <View style={[sa.sheet, { backgroundColor: theme.card }]}>
            <View style={[sa.handle, { backgroundColor: theme.border }]} />
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 18, fontWeight: "900", color: theme.text, marginBottom: 20 }}>
                Log Session{!isViewingToday ? ` — ${fmtViewDate(viewDate)}` : ""}
              </Text>

              <Text style={[sa.label, { color: theme.sub }]}>SUBJECT</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {STUDY_SUBJECTS.map(sub => {
                  const active = selSubject === sub;
                  const col = SUBJECT_COLORS[sub] ?? theme.primary;
                  return (
                    <TouchableOpacity key={sub} onPress={() => setSelSubject(sub)}
                      style={[sa.pill, { backgroundColor: active ? col : col + "18", borderColor: col }]}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : col }}>{sub}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[sa.label, { color: theme.sub }]}>SOURCE</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {sources.filter(s => s.enabled).map(src => {
                  const active = selSource === src.id;
                  return (
                    <TouchableOpacity key={src.id} onPress={() => setSelSource(src.id)}
                      style={[sa.pill, { backgroundColor: active ? theme.primary : theme.bg2, borderColor: active ? theme.primary : theme.border }]}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: active ? "#fff" : theme.sub }}>{src.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[sa.label, { color: theme.sub }]}>DURATION (MINUTES)</Text>
              <TextInput
                style={[sa.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                keyboardType="number-pad" placeholder="e.g. 45" placeholderTextColor={theme.muted}
                value={duration} onChangeText={setDuration}
              />
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                {[15, 30, 45, 60, 90].map(m => (
                  <TouchableOpacity key={m} onPress={() => setDuration(String(m))}
                    style={[sa.quickBtn, { backgroundColor: duration === String(m) ? theme.primary : theme.bg2, borderColor: duration === String(m) ? theme.primary : theme.border }]}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: duration === String(m) ? "#fff" : theme.sub }}>{m}m</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[sa.label, { color: theme.sub }]}>MCQs (OPTIONAL)</Text>
              <TextInput
                style={[sa.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                keyboardType="number-pad" placeholder="e.g. 30" placeholderTextColor={theme.muted}
                value={mcqInput} onChangeText={setMcqInput}
              />

              <TouchableOpacity style={[sa.saveBtn, { backgroundColor: saving ? theme.muted : theme.primary }]}
                onPress={saveSession} disabled={saving}>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{saving ? "Saving…" : "Save Session"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ alignItems: "center", marginTop: 12 }} onPress={() => setModalOpen(false)}>
                <Text style={{ color: theme.sub }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const sa = StyleSheet.create({
  dateRow:    { flexDirection: "row", alignItems: "center", marginTop: 8 },
  navBtn:     { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  section:    { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginTop: 22, marginBottom: 10 },
  chartTitle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 10 },
  card:       { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 0 },
  sessionCard:{ borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  emptyCard:  { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center", marginTop: 12 },
  addBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 14, elevation: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8 },
  subjectDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  barTrack:   { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  toggleRow:  { flexDirection: "row", borderRadius: 14, padding: 3, marginBottom: 12 },
  togglePill: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 11, shadowOffset: { width: 0, height: 1 } },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", paddingTop: 10 },
  handle:     { width: 44, height: 5, borderRadius: 3, alignSelf: "center" },
  label:      { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 10 },
  pill:       { borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 8 },
  input:      { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  quickBtn:   { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 8, alignItems: "center" },
  saveBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 16 },
});
