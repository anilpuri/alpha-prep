import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ScrollView, Animated, Dimensions, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "../lib/theme-context";
import { useAuth } from "../lib/auth-context";
import { subjectAccent, subjectEmoji, pctStr } from "../lib/theme";
import { allowedTimeSec, formatTime, MIN_QUESTIONS, MAX_QUESTIONS } from "../lib/timer";
import { Chip } from "../components/kit";
import type { TreeNode, TestMode, QuestionPool, TestConfig } from "../lib/types";
import { DEFAULT_EXAM_ID } from "../lib/types";

const { height: SCREEN_H } = Dimensions.get("window");

export default function TopicScreen() {
  const { node: nodeStr, subject } = useLocalSearchParams<{ node: string; subject: string }>();
  const node: TreeNode = JSON.parse(nodeStr || "{}");
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();

  const [history, setHistory] = useState<TreeNode[]>([]);
  const [current, setCurrent] = useState(node);

  // Modal state
  const [modalLeaf, setModalLeaf] = useState<TreeNode | null>(null);
  const [nQ, setNQ] = useState(25);
  const [mode, setMode] = useState<TestMode>("practice");
  const [pool, setPool] = useState<QuestionPool>("unattempted");
  const [trackWidth, setTrackWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const accentColor = subjectAccent(subject || "", theme);

  const openModal = useCallback((leaf: TreeNode) => {
    setModalLeaf(leaf);
    const maxQ = Math.min(leaf.count || 25, MAX_QUESTIONS);
    setNQ(Math.min(25, maxQ));
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
  }, [slideAnim]);

  const closeModal = useCallback(() => {
    Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }).start(() => setModalLeaf(null));
  }, [slideAnim]);

  const startTest = useCallback(() => {
    if (!modalLeaf || !user) return;
    const config: TestConfig = {
      examId:    DEFAULT_EXAM_ID,
      topicId:   modalLeaf.topicId!,
      topicName: modalLeaf.name,
      subject:   subject || "",
      nQuestions: nQ,
      mode,
      pool,
    };
    closeModal();
    router.push({ pathname: "/test", params: { config: JSON.stringify(config) } });
  }, [modalLeaf, nQ, mode, pool, user]);

  const goInto = (child: TreeNode) => {
    if (child.leaf) { openModal(child); return; }
    setHistory(h => [...h, current]);
    setCurrent(child);
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    if (!prev) { router.back(); return; }
    setHistory(h => h.slice(0, -1));
    setCurrent(prev);
  };

  const maxQ = Math.min(modalLeaf?.count || 100, MAX_QUESTIONS);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: accentColor }]}>
        <TouchableOpacity onPress={goBack} style={s.backBtn}>
          <Text style={{ color: "#fff", fontSize: 22 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.headerTitle} numberOfLines={1}>
            {current.name?.replace(/_/g, " ") || subject}
          </Text>
          {history.length > 0 && (
            <Text style={s.breadcrumb} numberOfLines={1}>
              {history.map(h => h.name?.replace(/_/g, " ")).join(" › ")}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: 28 }}>{subjectEmoji(subject || "")}</Text>
      </View>

      {/* Topic list */}
      <FlatList
        data={current.children || []}
        keyExtractor={i => i.name}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => {
          const isLeaf = item.leaf || !item.children?.length;
          const qCount = isLeaf ? (item.count || 0) : countQ(item);
          const topics = isLeaf ? 0 : countLeaves(item);
          return (
            <TouchableOpacity
              style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => goInto(item)}
              activeOpacity={0.82}
            >
              <View style={[s.leafDot, {
                backgroundColor: isLeaf ? accentColor + "22" : theme.bg2,
              }]}>
                <Text style={{ fontSize: 16 }}>{isLeaf ? "📝" : "📂"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardTitle, { color: theme.text }]} numberOfLines={2}>
                  {item.name?.replace(/_/g, " ")}
                </Text>
                <Text style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}>
                  {isLeaf
                    ? `${qCount} questions`
                    : `${topics} topics · ${qCount} questions`}
                </Text>
              </View>
              <Text style={{ color: isLeaf ? accentColor : theme.sub, fontSize: 18, fontWeight: "700" }}>
                {isLeaf ? "▶" : "›"}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Test config bottom sheet */}
      {modalLeaf && (
        <Modal transparent animationType="none" visible onRequestClose={closeModal}>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={closeModal} />
          <Animated.View style={[s.sheet, { backgroundColor: theme.card, transform: [{ translateY: slideAnim }] }]}>
            <View style={[s.sheetHandle, { backgroundColor: theme.border }]} />

            <Text style={[s.sheetTitle, { color: theme.text }]} numberOfLines={2}>
              {modalLeaf.name?.replace(/_/g, " ")}
            </Text>
            <Text style={{ color: theme.sub, marginBottom: 20, fontSize: 13 }}>
              {modalLeaf.count} questions available
            </Text>

            {/* Questions slider */}
            <Text style={[s.sectionLabel, { color: theme.sub }]}>NUMBER OF QUESTIONS</Text>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: "900", marginBottom: 12 }}>
              {nQ}{"  "}<Text style={{ fontSize: 14, color: theme.sub, fontWeight: "400" }}>
                questions · {formatTime(allowedTimeSec(nQ))} time
              </Text>
            </Text>
            {/* Tappable slider track */}
            {(() => {
              const allowed = [5, 10, 25, 50, 75, 100].filter(v => v <= maxQ);
              const pct = maxQ > 5 ? ((nQ - 5) / (maxQ - 5)) : 0;
              const thumbPct = Math.max(0, Math.min(1, pct));

              const onTrackPress = (evt: any) => {
                if (!trackWidth) return;
                const x    = evt.nativeEvent.locationX;
                const ratio = Math.max(0, Math.min(1, x / trackWidth));
                const raw  = 5 + ratio * (maxQ - 5);
                const snap = allowed.reduce((prev, curr) =>
                  Math.abs(curr - raw) < Math.abs(prev - raw) ? curr : prev
                );
                setNQ(snap);
              };

              return (
                <View style={{ marginBottom: 20 }}>
                  {/* Track — tap anywhere. All layers are absolutely positioned
                      at consistent top offsets so fill, thumb and track align. */}
                  <View
                    style={{ height: 36 }}
                    onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
                    onStartShouldSetResponder={() => true}
                    onResponderGrant={onTrackPress}
                    onResponderMove={onTrackPress}
                  >
                    {/* Background track   top=(36-8)/2=14 */}
                    <View style={{
                      position: "absolute", left: 0, right: 0,
                      top: 14, height: 8,
                      backgroundColor: theme.border, borderRadius: 4,
                    }} />
                    {/* Filled portion */}
                    <View style={{
                      position: "absolute", left: 0, top: 14, height: 8,
                      width: `${thumbPct * 100}%`,
                      backgroundColor: accentColor, borderRadius: 4,
                    }} />
                    {/* Thumb circle      top=(36-22)/2=7 */}
                    <View style={{
                      position: "absolute",
                      left: `${thumbPct * 100}%`,
                      top: 7,
                      width: 22, height: 22,
                      borderRadius: 11,
                      backgroundColor: accentColor,
                      borderWidth: 3, borderColor: "#fff",
                      marginLeft: -11,
                      shadowColor: accentColor, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
                    }} />
                  </View>
                  {/* Tick labels */}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                    {allowed.map(v => {
                      const active = nQ === v;
                      return (
                        <TouchableOpacity key={v} onPress={() => setNQ(v)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                          <Text style={{
                            fontSize: 12, fontWeight: active ? "900" : "500",
                            color: active ? accentColor : theme.muted,
                          }}>{v}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            {/* Mode */}
            <Text style={[s.sectionLabel, { color: theme.sub }]}>MODE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
              {([
                { id: "practice", icon: "🟡", label: "Practice", desc: "Timed, can't leave" },
                { id: "exam",     icon: "🔴", label: "Exam",     desc: "Countdown, auto-submit" },
                { id: "free",     icon: "🟢", label: "Free",     desc: "No timer, instant answers" },
              ] as { id: TestMode; icon: string; label: string; desc: string }[]).map(m => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setMode(m.id)}
                  style={[s.modeCard, {
                    borderColor: mode === m.id ? accentColor : theme.border,
                    backgroundColor: mode === m.id ? accentColor + "15" : theme.bg2,
                  }]}
                >
                  <Text style={{ fontSize: 20 }}>{m.icon}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: theme.text, marginTop: 4 }}>{m.label}</Text>
                  <Text style={{ fontSize: 11, color: theme.sub, textAlign: "center", marginTop: 2 }}>{m.desc}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Pool */}
            <Text style={[s.sectionLabel, { color: theme.sub }]}>QUESTION POOL</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
              {([
                { id: "unattempted", label: "New"      },
                { id: "wrong",       label: "Wrong ❌"  },
                { id: "bookmarked",  label: "Saved ⭐"  },
                { id: "attempted",   label: "Seen"     },
                { id: "all",         label: "All"      },
              ] as { id: QuestionPool; label: string }[]).map(p => (
                <Chip key={p.id} label={p.label} active={pool === p.id}
                  onPress={() => setPool(p.id)} color={accentColor} />
              ))}
            </ScrollView>

            {(modalLeaf?.count ?? 0) === 0 ? (
              <View style={[s.startBtn, { backgroundColor: theme.border, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ fontSize: 20, marginBottom: 4 }}>📭</Text>
                <Text style={{ color: theme.sub, fontSize: 15, fontWeight: "700" }}>No questions available</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>This topic has no questions yet</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={startTest}
                style={[s.startBtn, { backgroundColor: accentColor }]}
                activeOpacity={0.85}
              >
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900" }}>
                  Start {mode.charAt(0).toUpperCase() + mode.slice(1)} · {nQ} Qs
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </Modal>
      )}
    </View>
  );
}

function countLeaves(n: TreeNode): number {
  if (n.leaf) return 1;
  return (n.children || []).reduce((s, c) => s + countLeaves(c), 0);
}
function countQ(n: TreeNode): number {
  if (n.leaf) return n.count || 0;
  return (n.children || []).reduce((s, c) => s + countQ(c), 0);
}

const s = StyleSheet.create({
  header: { paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20, flexDirection: "row", alignItems: "center" },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ffffff30", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "900", color: "#fff" },
  breadcrumb: { fontSize: 11, color: "#ffffff99", marginTop: 2 },
  card: {
    borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1,
    shadowColor: "#00000010", shadowOpacity: 1, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  leafDot: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#00000060" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    maxHeight: SCREEN_H * 0.85,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: "900", lineHeight: 26 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: 10 },
  modeCard: {
    width: 100, borderRadius: 16, borderWidth: 2, padding: 12,
    alignItems: "center", marginRight: 10,
  },
  startBtn: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
});
