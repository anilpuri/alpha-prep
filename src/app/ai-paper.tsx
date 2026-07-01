import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useAuth } from "../lib/auth-context";
import { fetchTree, fetchAllTopicStats } from "../lib/db";
import { subjectAccent, subjectEmoji } from "../lib/theme";
import type { TreeNode, AiSection, TestConfig, TestMode, TopicStats } from "../lib/types";

function getAllLeaves(node: TreeNode): TreeNode[] {
  if (node.leaf) return [node];
  return (node.children || []).flatMap(getAllLeaves);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Chapter {
  id: string;
  name: string;
  subject: string;
  subjectIdx: number;
  node: TreeNode;
}

export default function AiPaperScreen() {
  const router    = useRouter();
  const { theme } = useTheme();
  const { user }  = useAuth();

  const [paperType, setPaperType]         = useState<"full" | "subject">("full");
  const [mode, setMode]                   = useState<TestMode>("practice");
  const [qPerSubject, setQPerSubject]     = useState(25);
  const [topicCount, setTopicCount]       = useState(10);
  const [generating, setGenerating]       = useState(false);
  const [preview, setPreview]             = useState<AiSection[] | null>(null);
  const [tree, setTree]                   = useState<TreeNode[]>([]);
  const [stats, setStats]                 = useState<TopicStats[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects]     = useState<Set<string>>(new Set());

  const allChapters = useMemo<Chapter[]>(() =>
    tree.flatMap((subj, si) =>
      (subj.children || []).map((ch, ci) => ({
        id:         `${si}:${ci}`,
        name:       ch.name.replace(/_/g, " "),
        subject:    subj.name.replace(/_/g, " "),
        subjectIdx: si,
        node:       ch,
      }))
    ), [tree]);

  useEffect(() => {
    fetchTree().then(t => {
      setTree(t.subjects);
      const all = new Set<string>();
      t.subjects.forEach((_, si) =>
        (t.subjects[si].children || []).forEach((_, ci) => all.add(`${si}:${ci}`))
      );
      setSelectedChapterIds(all);
      if (t.subjects[0]) setExpandedSubjects(new Set([t.subjects[0].name]));
    }).catch(() => {});
    if (user) fetchAllTopicStats(user.uid).then(setStats).catch(() => {});
  }, []);

  const toggleChapter = (id: string) =>
    setSelectedChapterIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleSubjectAll = (subjectName: string) => {
    const chs  = allChapters.filter(c => c.subject === subjectName);
    const allOn = chs.every(c => selectedChapterIds.has(c.id));
    setSelectedChapterIds(prev => {
      const n = new Set(prev);
      allOn ? chs.forEach(c => n.delete(c.id)) : chs.forEach(c => n.add(c.id));
      return n;
    });
  };

  const toggleExpand = (name: string) =>
    setExpandedSubjects(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  // ── Preview section reorder / delete ─────────────────────────────────────────

  const moveSection = (i: number, dir: -1 | 1) => {
    if (!preview) return;
    const ni = i + dir;
    if (ni < 0 || ni >= preview.length) return;
    const next = [...preview];
    [next[i], next[ni]] = [next[ni], next[i]];
    setPreview(next);
  };

  const removeSection = (i: number) =>
    setPreview(prev => prev?.filter((_, idx) => idx !== i) ?? null);

  // ── Generate ──────────────────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!tree.length) { Alert.alert("Loading", "Question bank loading, try again."); return; }
    setGenerating(true); setPreview(null);

    try {
      const statMap = new Map(stats.map(s => [s.topicId, s]));
      const sections: AiSection[] = [];

      if (paperType === "full") {
        // Flatten all leaf nodes from all subjects
        const allLeaves: Array<{ leaf: TreeNode; subjectNode: TreeNode }> = tree.flatMap(
          subjectNode => getAllLeaves(subjectNode).map(leaf => ({ leaf, subjectNode }))
        );

        // Sort by weakness (lowest accuracy first) — unknown accuracy = 50%
        const sorted = [...allLeaves].sort((a, b) => {
          const sa = statMap.get(a.leaf.topicId || "")?.accuracy ?? 50;
          const sb = statMap.get(b.leaf.topicId || "")?.accuracy ?? 50;
          return sa - sb;
        });

        // Pick top 70% from weakest + 30% randomly from rest (for variety)
        const weakN = Math.max(1, Math.ceil(topicCount * 0.7));
        const randN = topicCount - weakN;
        const weak  = sorted.slice(0, Math.min(weakN, sorted.length));
        const rest  = sorted.slice(weak.length);
        const randPick = shuffle(rest).slice(0, Math.min(randN, rest.length));
        const chosen = shuffle([...weak, ...randPick]);

        // Group by subject
        const bySubject = new Map<string, TreeNode[]>();
        for (const { leaf, subjectNode } of chosen) {
          if (!bySubject.has(subjectNode.name)) bySubject.set(subjectNode.name, []);
          bySubject.get(subjectNode.name)!.push(leaf);
        }
        for (const [subjectName, leaves] of bySubject) {
          sections.push({
            subject:    subjectName,
            topicIds:   leaves.map(l => l.topicId!).filter(Boolean),
            topicNames: leaves.map(l => l.name.replace(/_/g, " ")),
            nQuestions: qPerSubject,
            timeSec:    qPerSubject * 60,
          });
        }
      } else {
        // Custom chapters — group selected chapters by subject
        const bySubjectIdx = new Map<number, Chapter[]>();
        for (const ch of allChapters) {
          if (!selectedChapterIds.has(ch.id)) continue;
          if (!bySubjectIdx.has(ch.subjectIdx)) bySubjectIdx.set(ch.subjectIdx, []);
          bySubjectIdx.get(ch.subjectIdx)!.push(ch);
        }
        if (!bySubjectIdx.size) {
          Alert.alert("No chapters selected", "Please select at least one chapter.");
          setGenerating(false);
          return;
        }
        for (const [si, chapters] of bySubjectIdx) {
          const subjectNode = tree[si];
          const topicIds = chapters.flatMap(ch => getAllLeaves(ch.node).map(l => l.topicId!).filter(Boolean));
          sections.push({
            subject:    subjectNode.name,
            topicIds:   shuffle(topicIds),
            topicNames: chapters.map(c => c.name),
            nQuestions: qPerSubject,
            timeSec:    qPerSubject * 60,
          });
        }
      }

      setPreview(sections);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setGenerating(false);
    }
  }, [tree, stats, paperType, selectedChapterIds, allChapters, qPerSubject, topicCount]);

  const startTest = useCallback(() => {
    if (!preview?.length) return;
    const total = preview.reduce((s, sec) => s + sec.nQuestions, 0);
    const config: TestConfig = {
      examId:     "ssc_cgl",
      topicId:    "ai_paper",
      topicName:  paperType === "full" ? "AI Full Paper" : "AI Chapter Paper",
      subject:    "Mixed",
      nQuestions: total,
      mode,
      pool:       "all",
      sections:   preview,
      aiPaper:    true,
    };
    router.push({ pathname: "/test", params: { config: JSON.stringify(config) } });
  }, [preview, mode, paperType]);

  const ac = "#8880D5";

  const subjectCount = paperType === "full"
    ? new Set(tree.map((_, i) => i)).size
    : new Set(allChapters.filter(c => selectedChapterIds.has(c.id)).map(c => c.subjectIdx)).size;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: ac }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>🤖 AI Mock Paper</Text>
          <Text style={s.headerSub}>Personalised from your weak chapters</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>

        {/* Paper Type */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionLabel, { color: theme.sub }]}>PAPER TYPE</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {(["full", "subject"] as const).map(type => (
              <TouchableOpacity
                key={type}
                onPress={() => setPaperType(type)}
                style={[s.pill, {
                  flex: 1,
                  backgroundColor: paperType === type ? ac : theme.bg2,
                  borderColor: paperType === type ? ac : theme.border,
                }]}
              >
                <Text style={{ fontSize: 18 }}>{type === "full" ? "🎲" : "🎯"}</Text>
                <Text style={{ fontSize: 13, fontWeight: "800", color: paperType === type ? "#fff" : theme.text }}>
                  {type === "full" ? "AI Random Pick" : "Custom Chapters"}
                </Text>
                <Text style={{ fontSize: 11, color: paperType === type ? "#ffffffCC" : theme.sub, marginTop: 2 }}>
                  {type === "full" ? "Auto from weak topics" : "You choose chapters"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Topic count — only for full paper */}
        {paperType === "full" && (
          <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.sectionLabel, { color: theme.sub }]}>HOW MANY TOPICS TO PICK</Text>
            <Text style={{ color: theme.sub, fontSize: 12, marginTop: 4 }}>
              AI picks your weakest topics randomly from the entire question bank
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {[5, 8, 10, 15, 20].map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setTopicCount(n)}
                  style={[s.chip, {
                    backgroundColor: topicCount === n ? ac : theme.bg2,
                    borderColor: topicCount === n ? ac : theme.border,
                  }]}
                >
                  <Text style={{ fontWeight: "800", color: topicCount === n ? "#fff" : theme.text }}>{n}</Text>
                  <Text style={{ fontSize: 10, color: topicCount === n ? "#ffffffCC" : theme.sub }}>topics</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Mode */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionLabel, { color: theme.sub }]}>MODE</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            {(["practice", "exam"] as const).map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[s.pill, {
                  flex: 1,
                  backgroundColor: mode === m ? (m === "exam" ? theme.red : theme.green) : theme.bg2,
                  borderColor: mode === m ? (m === "exam" ? theme.red : theme.green) : theme.border,
                }]}
              >
                <Text style={{ fontSize: 18 }}>{m === "exam" ? "⏱️" : "📚"}</Text>
                <Text style={{ fontSize: 13, fontWeight: "800", color: mode === m ? "#fff" : theme.text }}>
                  {m === "exam" ? "Exam Mode" : "Practice Mode"}
                </Text>
                <Text style={{ fontSize: 11, color: mode === m ? "#ffffffCC" : theme.sub, marginTop: 2 }}>
                  {m === "exam" ? "Sectional timer" : "No time pressure"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Questions per subject */}
        <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionLabel, { color: theme.sub }]}>QUESTIONS PER SUBJECT</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {[5, 10, 15, 20, 25, 30, 50].map(n => (
              <TouchableOpacity
                key={n}
                onPress={() => setQPerSubject(n)}
                style={[s.chip, {
                  backgroundColor: qPerSubject === n ? ac : theme.bg2,
                  borderColor: qPerSubject === n ? ac : theme.border,
                }]}
              >
                <Text style={{ fontWeight: "800", color: qPerSubject === n ? "#fff" : theme.text }}>{n}Q</Text>
                <Text style={{ fontSize: 11, color: qPerSubject === n ? "#ffffffCC" : theme.sub }}>{n} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Chapter selection — only for custom */}
        {paperType === "subject" && (
          <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[s.sectionLabel, { color: theme.sub }]}>SELECT CHAPTERS</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>
                {selectedChapterIds.size}/{allChapters.length} selected
              </Text>
            </View>

            {tree.map((subj, si) => {
              const subjName    = subj.name.replace(/_/g, " ");
              const color       = subjectAccent(subj.name, theme);
              const chapters    = allChapters.filter(c => c.subjectIdx === si);
              const selCnt      = chapters.filter(c => selectedChapterIds.has(c.id)).length;
              const expanded    = expandedSubjects.has(subj.name);
              const allOn       = selCnt === chapters.length;

              return (
                <View key={si} style={{ marginTop: 12 }}>
                  <View style={[s.subjHeader, { borderColor: color + "60", backgroundColor: color + "10" }]}>
                    <TouchableOpacity
                      onPress={() => toggleSubjectAll(subjName)}
                      style={[s.check, { backgroundColor: allOn ? color : theme.bg2, borderColor: color }]}
                    >
                      {allOn && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
                    </TouchableOpacity>
                    <Text style={{ fontSize: 18 }}>{subjectEmoji(subj.name)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "800", color: theme.text, fontSize: 14 }}>{subjName}</Text>
                      <Text style={{ color: theme.sub, fontSize: 11 }}>{selCnt}/{chapters.length} chapters</Text>
                    </View>
                    <TouchableOpacity onPress={() => toggleExpand(subj.name)} style={{ padding: 6 }}>
                      <Text style={{ color, fontSize: 18, fontWeight: "700" }}>{expanded ? "∧" : "∨"}</Text>
                    </TouchableOpacity>
                  </View>

                  {expanded && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8, paddingLeft: 4 }}>
                      {chapters.map(ch => {
                        const on = selectedChapterIds.has(ch.id);
                        return (
                          <TouchableOpacity
                            key={ch.id}
                            onPress={() => toggleChapter(ch.id)}
                            style={[s.chapterChip, {
                              backgroundColor: on ? color + "22" : theme.bg2,
                              borderColor: on ? color : theme.border,
                            }]}
                          >
                            <Text style={{ fontSize: 12, fontWeight: on ? "700" : "500", color: on ? color : theme.sub }}>
                              {ch.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Summary */}
        <View style={[s.summaryCard, { backgroundColor: ac + "18", borderColor: ac + "40" }]}>
          <Text style={{ color: ac, fontWeight: "800", fontSize: 13 }}>📊 PAPER SUMMARY</Text>
          <Text style={{ color: theme.text, marginTop: 6 }}>
            {paperType === "full"
              ? `${topicCount} random topics × ${qPerSubject}Q = ~${topicCount * qPerSubject} questions`
              : `${subjectCount} subject${subjectCount !== 1 ? "s" : ""} × ${qPerSubject}Q = ${subjectCount * qPerSubject} questions`
            }
          </Text>
          <Text style={{ color: theme.sub, fontSize: 12, marginTop: 2 }}>
            {paperType === "full"
              ? "Picks weakest topics with random variety • Questions shuffled"
              : `${selectedChapterIds.size} chapter${selectedChapterIds.size !== 1 ? "s" : ""} selected • Questions shuffled`
            }
            {" · "}
            {mode === "exam" ? `Sectional timer: ${qPerSubject} min/subject` : "Practice mode — no time limit"}
          </Text>
        </View>

        {/* Generate */}
        <TouchableOpacity
          onPress={generate}
          disabled={generating}
          style={[s.generateBtn, { backgroundColor: ac, opacity: generating ? 0.7 : 1 }]}
        >
          {generating
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>🎲 Generate Paper</Text>
          }
        </TouchableOpacity>

        {/* Preview with section reorder */}
        {preview && (
          <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={[s.sectionLabel, { color: theme.sub }]}>SECTIONS — DRAG TO REORDER</Text>
              <TouchableOpacity
                onPress={generate}
                disabled={generating}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ color: ac, fontSize: 12, fontWeight: "700" }}>↺ Regenerate</Text>
              </TouchableOpacity>
            </View>

            {preview.map((sec, i) => {
              const color = subjectAccent(sec.subject, theme);
              return (
                <View
                  key={i}
                  style={[s.secRow, { borderLeftColor: color, backgroundColor: color + "08", borderColor: color + "30" }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color, fontWeight: "800", fontSize: 13 }}>
                      {subjectEmoji(sec.subject)} {sec.subject.replace(/_/g, " ")} — {sec.nQuestions}Q
                    </Text>
                    <Text style={{ color: theme.sub, fontSize: 11, marginTop: 3 }}>
                      {sec.topicNames.slice(0, 3).join(", ")}{sec.topicNames.length > 3 ? ` +${sec.topicNames.length - 3} more` : ""}
                    </Text>
                  </View>
                  {/* Reorder + delete controls */}
                  <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                    <TouchableOpacity
                      onPress={() => moveSection(i, -1)}
                      disabled={i === 0}
                      style={[s.secBtn, { opacity: i === 0 ? 0.3 : 1 }]}
                    >
                      <Text style={{ color, fontSize: 14, fontWeight: "900" }}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveSection(i, 1)}
                      disabled={i === preview.length - 1}
                      style={[s.secBtn, { opacity: i === preview.length - 1 ? 0.3 : 1 }]}
                    >
                      <Text style={{ color, fontSize: 14, fontWeight: "900" }}>↓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => removeSection(i)}
                      style={[s.secBtn]}
                    >
                      <Text style={{ color: theme.red, fontSize: 13 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              onPress={startTest}
              disabled={!preview.length}
              style={[s.startBtn, { backgroundColor: preview.length ? theme.green : theme.border }]}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>
                ▶  Start Test ({preview.reduce((s, sec) => s + sec.nQuestions, 0)}Q)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  back:         { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle:  { fontSize: 20, fontWeight: "900", color: "#fff" },
  headerSub:    { fontSize: 12, color: "#ffffffCC", marginTop: 2 },
  card: {
    borderRadius: 20, borderWidth: 1, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  pill: {
    borderRadius: 14, borderWidth: 1.5, padding: 12,
    alignItems: "center", gap: 4, flex: 1,
  },
  chip: {
    borderRadius: 12, borderWidth: 1.5, padding: 10,
    alignItems: "center", minWidth: 68,
  },
  subjHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12,
  },
  check: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  chapterChip: {
    borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6,
  },
  summaryCard:  { borderRadius: 16, borderWidth: 1, padding: 14 },
  generateBtn: {
    borderRadius: 16, paddingVertical: 16, alignItems: "center",
    shadowColor: "#8880D5", shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  secRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderLeftWidth: 3, borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 10,
  },
  secBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#00000010",
  },
  startBtn: {
    marginTop: 16, borderRadius: 14, paddingVertical: 14, alignItems: "center",
    shadowColor: "#22C55E", shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
});
