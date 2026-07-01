import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, FlatList, TextInput,
} from "react-native";
import { Spinner } from "../../components/Spinner";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { fetchAttempts, fetchAchievements } from "../../lib/db";
import { THEME_META, type ThemeName, type ThemeGroup } from "../../lib/theme";
import { ACHIEVEMENTS, SUBJECT_COLORS } from "../../lib/types";
import { GROQ_MODELS, type GroqModelId } from "../../lib/groq";
import {
  loadSettings, getActiveModel, setActiveModel,
  loadStudySettings, getStudyTargets, getStudySources,
  saveStudyTargets, saveStudySources, DEFAULT_SOURCES, DEFAULT_TARGETS,
} from "../../lib/settings";
import type { Attempt, UserAchievement, SubjectTarget, StudySource } from "../../lib/types";

const GROUPS: { group: ThemeGroup; label: string; emoji: string }[] = [
  { group: "default", label: "Default", emoji: "✦" },
  { group: "light",   label: "Light",   emoji: "☀️" },
  { group: "dark",    label: "Dark",    emoji: "🌙" },
];

export default function Profile() {
  const { user, logout }               = useAuth();
  const { theme, themeName, setTheme } = useTheme();
  const [attempts,      setAttempts]      = useState<Attempt[]>([]);
  const [achievements,  setAchievements]  = useState<UserAchievement[]>([]);
  const [loadingStats,  setLoadingStats]  = useState(true);
  const [achModal,      setAchModal]      = useState(false);
  const [selectedModel, setSelectedModel] = useState<GroqModelId>("meta-llama/llama-4-scout-17b-16e-instruct");

  // Study targets & sources
  const [targets,      setTargets]      = useState<SubjectTarget[]>(DEFAULT_TARGETS.map(t => ({ ...t })));
  const [sources,      setSources]      = useState<StudySource[]>(DEFAULT_SOURCES.map(s => ({ ...s })));
  const [editTarget,   setEditTarget]   = useState<SubjectTarget | null>(null);
  const [editMin,      setEditMin]      = useState("");
  const [editMcqs,     setEditMcqs]     = useState("");
  const [newSrcLabel,  setNewSrcLabel]  = useState("");

  useEffect(() => {
    loadSettings().then(() => setSelectedModel(getActiveModel()));
    loadStudySettings().then(() => {
      setTargets(getStudyTargets().map(t => ({ ...t })));
      setSources(getStudySources().map(s => ({ ...s })));
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetchAttempts(user.uid, 500),
      fetchAchievements(user.uid),
    ]).then(([a, ach]) => {
      setAttempts(a);
      setAchievements(ach);
      setLoadingStats(false);
    }).catch(() => setLoadingStats(false));
  }, [user]);

  const onLogout = () => {
    Alert.alert("Logout", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: logout },
    ]);
  };

  const totalTests     = attempts.length;
  const totalQuestions = attempts.reduce((s, a) => s + a.nQuestions, 0);
  const totalCorrect   = attempts.reduce((s, a) => s + a.correct, 0);
  const totalAnswered  = attempts.reduce((s, a) => s + a.correct + a.wrong, 0);
  const overallAcc     = totalAnswered > 0 ? ((totalCorrect / totalAnswered) * 100).toFixed(1) : "—";

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Avatar / user info */}
      <View style={[s.header, { backgroundColor: theme.primary + "18" }]}>
        <View style={[s.avatar, { backgroundColor: theme.primary }]}>
          <Text style={s.avatarText}>
            {(user?.displayName || user?.email || "U")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={[s.name,  { color: theme.text }]}>{user?.displayName || "Student"}</Text>
        <Text style={[s.email, { color: theme.sub  }]}>{user?.email}</Text>
      </View>

      <View style={{ padding: 16, gap: 14 }}>
        {/* Stats summary */}
        <Text style={[s.sectionTitle, { color: theme.sub }]}>YOUR STATS</Text>
        {loadingStats ? (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <Spinner size={52} label="Loading Stats" />
          </View>
        ) : (
          <View style={[s.statsRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <StatBox label="Tests"      value={String(totalTests)}          />
            <View style={[s.divider, { backgroundColor: theme.border }]} />
            <StatBox label="Questions"  value={totalQuestions.toLocaleString()} />
            <View style={[s.divider, { backgroundColor: theme.border }]} />
            <StatBox label="Accuracy"   value={`${overallAcc}%`} color={theme.green} />
          </View>
        )}

        {/* Achievements — compact row */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
          <Text style={[s.sectionTitle, { color: theme.sub, flex: 1 }]}>ACHIEVEMENTS</Text>
          <TouchableOpacity onPress={() => setAchModal(true)}>
            <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
              {achievements.length}/{ACHIEVEMENTS.length} · View All →
            </Text>
          </TouchableOpacity>
        </View>

        {/* Single horizontal strip */}
        <FlatList
          data={ACHIEVEMENTS}
          keyExtractor={a => a.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
          renderItem={({ item: ach }) => {
            const earned = achievements.some(a => a.id === ach.id);
            return (
              <View style={[s.achStrip, {
                backgroundColor: earned ? theme.primary + "18" : theme.card,
                borderColor:     earned ? theme.primary + "55" : theme.border,
                opacity: earned ? 1 : 0.45,
              }]}>
                <Text style={{ fontSize: 22 }}>{ach.emoji}</Text>
                {earned && (
                  <View style={[s.achStripDot, { backgroundColor: theme.green }]} />
                )}
              </View>
            );
          }}
        />

        {/* View All Modal */}
        <Modal visible={achModal} animationType="slide" transparent onRequestClose={() => setAchModal(false)}>
          <View style={{ flex: 1, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
            <View style={[s.achModalSheet, { backgroundColor: theme.bg }]}>
              <View style={[s.achModalHandle, { backgroundColor: theme.border }]} />
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16 }}>
                <Text style={{ flex: 1, fontSize: 18, fontWeight: "900", color: theme.text }}>
                  Achievements
                </Text>
                <Text style={{ color: theme.primary, fontWeight: "700" }}>
                  {achievements.length} / {ACHIEVEMENTS.length}
                </Text>
                <TouchableOpacity onPress={() => setAchModal(false)} style={{ marginLeft: 16 }}>
                  <Text style={{ color: theme.sub, fontSize: 22 }}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
                {/* Progress bar */}
                <View style={[s.progBg, { backgroundColor: theme.border, marginBottom: 16 }]}>
                  <View style={[s.progFill, {
                    backgroundColor: theme.primary,
                    width: `${Math.round((achievements.length / ACHIEVEMENTS.length) * 100)}%` as any,
                  }]} />
                </View>
                <View style={s.badgeGrid}>
                  {ACHIEVEMENTS.map(ach => {
                    const ua = achievements.find(u => u.id === ach.id);
                    return <BadgeCard key={ach.id} ach={ach} earned={!!ua} earnedAt={ua?.earnedAt} theme={theme} />;
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Theme picker — 3 groups */}
        <Text style={[s.sectionTitle, { color: theme.sub }]}>THEME</Text>
        <View style={[s.themeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {GROUPS.map(({ group, label, emoji }) => {
            const names = (Object.keys(THEME_META) as ThemeName[]).filter(n => THEME_META[n].group === group);
            return (
              <View key={group} style={{ marginBottom: 16 }}>
                {/* Group header */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>{emoji}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: theme.sub, letterSpacing: 0.5 }}>
                    {label.toUpperCase()}
                  </Text>
                </View>
                {/* Swatches */}
                <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                  {names.map(name => {
                    const meta = THEME_META[name];
                    const isActive = name === themeName;
                    return (
                      <TouchableOpacity
                        key={name}
                        onPress={() => setTheme(name)}
                        style={{ alignItems: "center", gap: 5 }}
                        activeOpacity={0.8}
                      >
                        <View style={[
                          s.themeSwatch,
                          {
                            backgroundColor: meta.swatch,
                            borderColor: isActive ? theme.text : meta.swatch + "40",
                            borderWidth: isActive ? 3 : 2,
                          },
                        ]}>
                          {isActive && (
                            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>✓</Text>
                          )}
                        </View>
                        <Text style={{
                          fontSize: 10, fontWeight: isActive ? "800" : "500",
                          color: isActive ? meta.swatch : theme.muted,
                        }}>
                          {meta.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        {/* AI Model selector */}
        <Text style={[s.sectionTitle, { color: theme.sub }]}>AI MODEL (GROQ)</Text>
        <View style={[s.themeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ fontSize: 12, color: theme.sub, marginBottom: 12, lineHeight: 18 }}>
            Used for Daily Content, GK, Vocab and AI Readiness.{"\n"}
            Concept Explainer always uses the 70B model.
          </Text>
          {(Object.entries(GROQ_MODELS) as [GroqModelId, { label: string; tpm: number }][]).map(([id, info]) => {
            const active = selectedModel === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={async () => {
                  setSelectedModel(id);
                  await setActiveModel(id);
                }}
                style={[s.modelRow, {
                  backgroundColor: active ? theme.primary + "15" : theme.bg2,
                  borderColor:     active ? theme.primary       : theme.border,
                }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "800", fontSize: 13, color: active ? theme.primary : theme.text }}>
                    {info.label}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>
                    {(info.tpm / 1000).toFixed(0)}K TPM free · {id}
                  </Text>
                </View>
                {active && (
                  <View style={[s.modelCheck, { backgroundColor: theme.primary }]}>
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Study Targets ───────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: theme.sub }]}>DAILY STUDY TARGETS</Text>
        <View style={[s.themeCard, { backgroundColor: theme.card, borderColor: theme.border, gap: 12 }]}>
          <Text style={{ fontSize: 12, color: theme.sub, lineHeight: 18 }}>
            Set daily goals per subject. Used to track your progress in Study Analytics.
          </Text>
          {targets.map(t => {
            const col = SUBJECT_COLORS[t.subject] ?? theme.primary;
            return (
              <TouchableOpacity
                key={t.subject}
                onPress={() => { setEditTarget(t); setEditMin(String(t.dailyMinutes)); setEditMcqs(String(t.dailyMcqs)); }}
                style={[s.targetRow, { borderColor: theme.border, backgroundColor: theme.bg2 }]}
                activeOpacity={0.8}
              >
                <View style={[s.subjectDot, { backgroundColor: col }]} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: theme.text }}>{t.subject}</Text>
                <Text style={{ fontSize: 12, color: theme.sub }}>{t.dailyMinutes}m · {t.dailyMcqs} MCQs</Text>
                <Text style={{ color: theme.muted, marginLeft: 8 }}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Study Sources ───────────────────────────────────────────────── */}
        <Text style={[s.sectionTitle, { color: theme.sub }]}>STUDY SOURCES</Text>
        <View style={[s.themeCard, { backgroundColor: theme.card, borderColor: theme.border, gap: 10 }]}>
          <Text style={{ fontSize: 12, color: theme.sub, lineHeight: 18, marginBottom: 4 }}>
            Toggle which sources appear when logging sessions. Swipe or tap ✕ to delete.
          </Text>
          {sources.map(src => (
            <View
              key={src.id}
              style={[s.sourceRow, {
                backgroundColor: src.enabled ? theme.primary + "12" : theme.bg2,
                borderColor: src.enabled ? theme.primary + "50" : theme.border,
              }]}
            >
              <TouchableOpacity
                onPress={async () => {
                  const updated = sources.map(s => s.id === src.id ? { ...s, enabled: !s.enabled } : s);
                  setSources(updated);
                  await saveStudySources(updated);
                }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                activeOpacity={0.8}
              >
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: src.enabled ? theme.primary : theme.sub }}>
                  {src.label}
                </Text>
                <View style={[s.togglePill, { backgroundColor: src.enabled ? theme.primary : theme.border }]}>
                  <View style={[s.toggleKnob, { alignSelf: src.enabled ? "flex-end" : "flex-start" }]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Delete Source", `Delete "${src.label}"?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: async () => {
                        const updated = sources.filter(s => s.id !== src.id);
                        setSources(updated);
                        await saveStudySources(updated);
                      },
                    },
                  ])
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 10 }}
              >
                <Text style={{ color: theme.muted, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add new source */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TextInput
              style={[s.editInput, { flex: 1, color: theme.text, borderColor: theme.border, backgroundColor: theme.bg2, marginBottom: 0, paddingVertical: 9, fontSize: 13 }]}
              placeholder="New source name…"
              placeholderTextColor={theme.muted}
              value={newSrcLabel}
              onChangeText={setNewSrcLabel}
              returnKeyType="done"
              onSubmitEditing={async () => {
                const label = newSrcLabel.trim();
                if (!label) return;
                const updated = [...sources, { id: Date.now().toString(), label, enabled: true }];
                setSources(updated);
                await saveStudySources(updated);
                setNewSrcLabel("");
              }}
            />
            <TouchableOpacity
              style={{ backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" }}
              onPress={async () => {
                const label = newSrcLabel.trim();
                if (!label) return;
                const updated = [...sources, { id: Date.now().toString(), label, enabled: true }];
                setSources(updated);
                await saveStudySources(updated);
                setNewSrcLabel("");
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* User info rows */}
        <Text style={[s.sectionTitle, { color: theme.sub }]}>ACCOUNT</Text>
        <Row icon="✅" label="Email verified" value={user?.emailVerified ? "Yes" : "No"} />
        <Row icon="🆔" label="User ID"        value={(user?.uid || "").slice(0, 14) + "..."} />

        <TouchableOpacity
          style={[s.logoutBtn, { backgroundColor: theme.redLt, borderColor: theme.red, borderWidth: 1 }]}
          onPress={onLogout}
          activeOpacity={0.8}
        >
          <Text style={[s.logoutText, { color: theme.red }]}>Logout</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Edit Target Modal */}
    {editTarget != null && (
      <Modal visible animationType="slide" transparent onRequestClose={() => setEditTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
          <View style={[s.achModalSheet, { backgroundColor: theme.bg, paddingHorizontal: 20, paddingBottom: 40 }]}>
            <View style={[s.achModalHandle, { backgroundColor: theme.border }]} />
            <Text style={{ fontSize: 18, fontWeight: "900", color: theme.text, marginBottom: 20 }}>
              {editTarget.subject} Target
            </Text>

            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.sub, marginBottom: 8, letterSpacing: 0.5 }}>
              DAILY STUDY TIME (MINUTES)
            </Text>
            <TextInput
              style={[s.editInput, { backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }]}
              keyboardType="number-pad"
              value={editMin}
              onChangeText={setEditMin}
              placeholder="60"
              placeholderTextColor={theme.muted}
            />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {[15, 30, 45, 60, 90, 120].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.quickChip, { backgroundColor: editMin === String(m) ? theme.primary : theme.bg2, borderColor: theme.border }]}
                  onPress={() => setEditMin(String(m))}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: editMin === String(m) ? "#fff" : theme.sub }}>{m}m</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.sub, marginBottom: 8, letterSpacing: 0.5 }}>
              DAILY MCQs TARGET
            </Text>
            <TextInput
              style={[s.editInput, { backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }]}
              keyboardType="number-pad"
              value={editMcqs}
              onChangeText={setEditMcqs}
              placeholder="20"
              placeholderTextColor={theme.muted}
            />
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
              {[10, 20, 25, 30, 50].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.quickChip, { backgroundColor: editMcqs === String(m) ? theme.primary : theme.bg2, borderColor: theme.border }]}
                  onPress={() => setEditMcqs(String(m))}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: editMcqs === String(m) ? "#fff" : theme.sub }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[s.logoutBtn, { backgroundColor: theme.primary, marginTop: 0 }]}
              onPress={async () => {
                if (!editTarget) return;
                const mins = parseInt(editMin, 10);
                const mcqsV = parseInt(editMcqs, 10);
                if (!mins || mins <= 0) { Alert.alert("Enter valid minutes"); return; }
                const updated = targets.map(t =>
                  t.subject === editTarget.subject
                    ? { ...t, dailyMinutes: mins, dailyMcqs: mcqsV || 0 }
                    : t
                );
                setTargets(updated);
                await saveStudyTargets(updated);
                setEditTarget(null);
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Save Target</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: "center", marginTop: 14 }} onPress={() => setEditTarget(null)}>
              <Text style={{ color: theme.sub, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    )}
    </>
  );
}

function BadgeCard({
  ach, earned, earnedAt, theme,
}: { ach: { emoji: string; title: string; desc: string; id: string }; earned: boolean; earnedAt?: number; theme: any }) {
  return (
    <View style={[
      s.badgeCard,
      {
        backgroundColor: earned ? theme.primary + "15" : theme.card,
        borderColor:     earned ? theme.primary + "55" : theme.border,
      },
    ]}>
      <View style={[s.badgeCircle, { backgroundColor: earned ? theme.primary + "25" : theme.bg2 }]}>
        <Text style={[s.badgeEmoji, { opacity: earned ? 1 : 0.3 }]}>{ach.emoji}</Text>
        {!earned && (
          <View style={s.lockBadge}>
            <Text style={{ fontSize: 9 }}>🔒</Text>
          </View>
        )}
        {earned && (
          <View style={[s.earnedBadge, { backgroundColor: theme.green }]}>
            <Text style={{ fontSize: 8, color: "#fff", fontWeight: "900" }}>✓</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 11, fontWeight: "900", color: earned ? theme.text : theme.muted, textAlign: "center", marginTop: 8 }} numberOfLines={1}>
        {ach.title}
      </Text>
      <Text style={{ fontSize: 10, color: earned ? theme.sub : theme.muted, textAlign: "center", marginTop: 3, lineHeight: 13 }} numberOfLines={2}>
        {ach.desc}
      </Text>
      {earned && earnedAt ? (
        <Text style={{ fontSize: 9, color: theme.primary, fontWeight: "800", marginTop: 5 }}>
          EARNED
        </Text>
      ) : null}
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: color ?? theme.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={{ fontSize: 20, marginRight: 12 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: theme.sub }}>{label}</Text>
        <Text style={{ fontSize: 15, color: theme.text, fontWeight: "600" }}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header:     { alignItems: "center", paddingTop: 60, paddingBottom: 28, gap: 6 },
  avatar:     { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 36, color: "#fff", fontWeight: "900" },
  name:       { fontSize: 22, fontWeight: "800" },
  email:      { fontSize: 14 },
  sectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  statsRow: {
    borderRadius: 16, borderWidth: 1, flexDirection: "row", alignItems: "center",
  },
  divider: { width: 1, height: 40, marginVertical: 8 },
  themeCard: { borderRadius: 16, borderWidth: 1, padding: 14 },
  themeSwatch: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    borderWidth: 3,
  },
  themeLabel: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
  },
  logoutBtn:  { borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8 },
  logoutText: { fontSize: 16, fontWeight: "800" },
  modelRow:   { borderRadius: 14, borderWidth: 1.5, padding: 12, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  modelCheck: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  // Achievements
  achProgress: { borderRadius: 18, borderWidth: 1, padding: 18, flexDirection: "row", alignItems: "center" },
  progBg:      { height: 6, borderRadius: 3, overflow: "hidden" },
  progFill:    { height: 6, borderRadius: 3 },
  achSubHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 10 },
  achDot:      { width: 6, height: 6, borderRadius: 3 },
  achSubLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  badgeGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  achStrip:    {
    width: 52, height: 52, borderRadius: 14, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  achStripDot: {
    position: "absolute", top: 4, right: 4,
    width: 8, height: 8, borderRadius: 4,
  },
  achModalSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "88%", paddingTop: 12,
  },
  achModalHandle: {
    width: 44, height: 5, borderRadius: 3,
    alignSelf: "center", marginBottom: 16,
  },
  badgeCard:   {
    width: "47%", borderRadius: 16, borderWidth: 1.5,
    padding: 14, alignItems: "center",
  },
  badgeCircle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  badgeEmoji:  { fontSize: 26 },
  lockBadge:   {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#33333388", alignItems: "center", justifyContent: "center",
  },
  earnedBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },

  // Study targets & sources
  subjectDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  targetRow:  { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12 },
  sourceRow:  { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 12 },
  togglePill: { width: 36, height: 20, borderRadius: 10, padding: 2, justifyContent: "center" },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff" },
  editInput:  { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 10 },
  quickChip:  { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center" },
});

const styles = StyleSheet.create({
  row: { borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", borderWidth: 1 },
});
