import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator,
} from "react-native";
import { Spinner } from "../../components/Spinner";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { fetchAttempts, deleteAttempt } from "../../lib/db";
import { accuracyColor, pctStr } from "../../lib/theme";
import { formatDuration } from "../../lib/timer";
import type { Attempt } from "../../lib/types";

// ── Date grouping helpers ─────────────────────────────────────────────────────

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupLabel(ts: number): string {
  const now      = Date.now();
  const todayMs  = startOfDay(now);
  const ams      = startOfDay(ts);
  const diffDays = Math.round((todayMs - ams) / 86400000);
  if (diffDays === 0)       return "Today";
  if (diffDays === 1)       return "Yesterday";
  if (diffDays <= 7)        return "This Week";
  return "Older";
}

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "Older"];

type Group = { label: string; data: Attempt[] };

function buildGroups(attempts: Attempt[]): Group[] {
  const map: Record<string, Attempt[]> = {};
  for (const a of attempts) {
    const lbl = groupLabel(a.createdAt);
    (map[lbl] = map[lbl] || []).push(a);
  }
  return GROUP_ORDER.filter(l => map[l]).map(l => ({ label: l, data: map[l] }));
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    + " · "
    + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ── Flattened list item type ──────────────────────────────────────────────────

type ListItem =
  | { type: "header"; label: string }
  | { type: "attempt"; attempt: Attempt };

function flatten(groups: Group[]): ListItem[] {
  const items: ListItem[] = [];
  for (const g of groups) {
    items.push({ type: "header", label: g.label });
    for (const a of g.data) {
      items.push({ type: "attempt", attempt: a });
    }
  }
  return items;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { user }  = useAuth();
  const { theme } = useTheme();
  const router    = useRouter();

  const [attempts,  setAttempts]  = useState<Attempt[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await fetchAttempts(user.uid, 500);
      setAttempts(data);
    } catch {
      Alert.alert("Error", "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (attempt: Attempt) => {
    Alert.alert(
      "Delete attempt?",
      `Remove "${attempt.topicName}" from history? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            if (!user || !attempt.id) return;
            setDeleting(attempt.id);
            try {
              await deleteAttempt(user.uid, attempt.id);
              setAttempts(prev => prev.filter(a => a.id !== attempt.id));
            } catch {
              Alert.alert("Error", "Could not delete attempt.");
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
  };

  const groups = buildGroups(attempts);
  const items  = flatten(groups);

  const modeBadgeColor = (mode: string) => {
    if (mode === "exam")     return theme.red;
    if (mode === "practice") return theme.blue;
    return theme.muted;
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return (
        <View style={[s.groupHeader]}>
          <Text style={[s.groupLabel, { color: theme.primary }]}>{item.label}</Text>
        </View>
      );
    }

    const a        = item.attempt;
    const accColor = accuracyColor(a.accuracy, theme);
    const isDeleting = deleting === a.id;

    return (
      <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {/* Top row */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.topicName, { color: theme.text }]} numberOfLines={1}>
              {a.topicName}
            </Text>
            <Text style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}>
              {a.subject?.replace(/_/g, " ")} · {formatDate(a.createdAt)}
            </Text>
          </View>
          {/* Mode badge */}
          <View style={[s.modeBadge, { backgroundColor: modeBadgeColor(a.mode) + "20", borderColor: modeBadgeColor(a.mode) }]}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: modeBadgeColor(a.mode) }}>
              {a.mode.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: "row", marginTop: 10, gap: 0 }}>
          <MiniStat label="Score"   value={`${a.score.toFixed(1)}/${a.maxScore}`} color={theme.primary} />
          <MiniStat label="Accuracy" value={pctStr(a.accuracy, 0)} color={accColor} />
          <MiniStat label="Time"    value={formatDuration(a.timeTakenSec)} />
          <MiniStat label="Qs"      value={String(a.nQuestions)} />
        </View>

        {/* Action row */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: theme.primary + "15", borderColor: theme.primary }]}
            onPress={() => {
              router.push({
                pathname: "/result",
                params: {
                  attempt: JSON.stringify(a),
                  questions: JSON.stringify([]),
                  attemptId: a.id ?? "",
                  reviewMode: "1",
                },
              });
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: theme.primary }}>View Result</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: theme.redLt, borderColor: theme.red }]}
            onPress={() => handleDelete(a)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color={theme.red} />
            ) : (
              <Text style={{ fontSize: 13, fontWeight: "700", color: theme.red }}>Delete</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: "center", alignItems: "center" }}>
        <Spinner icon="📋" label="Loading History" sublabel="Fetching your test sessions…" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[s.headerBar, { backgroundColor: theme.bg }]}>
        <Text style={[s.screenTitle, { color: theme.text }]}>History</Text>
        <Text style={[s.screenSub,   { color: theme.sub  }]}>{attempts.length} sessions</Text>
      </View>

      {attempts.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 52 }}>📋</Text>
          <Text style={[s.emptyTitle, { color: theme.text }]}>No history yet</Text>
          <Text style={{ color: theme.sub, textAlign: "center", fontSize: 14, lineHeight: 20 }}>
            Complete a test and your sessions will appear here.
          </Text>
          <TouchableOpacity
            style={[s.goBtn, { backgroundColor: theme.primary }]}
            onPress={() => router.push("/(tabs)/subjects")}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Start practicing</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) =>
            item.type === "header" ? `hdr-${item.label}` : `atm-${item.attempt.id ?? idx}`
          }
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontSize: 15, fontWeight: "800", color: color ?? theme.text }}>{value}</Text>
      <Text style={{ fontSize: 10, color: theme.sub, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  headerBar:   { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 },
  screenTitle: { fontSize: 28, fontWeight: "900" },
  screenSub:   { fontSize: 13, marginTop: 2 },
  groupHeader: { paddingTop: 8, paddingBottom: 4 },
  groupLabel:  { fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
  card: {
    borderRadius: 16, padding: 14, borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  topicName: { fontSize: 15, fontWeight: "700" },
  modeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  actionBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: "800" },
  goBtn: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, marginTop: 8 },
});
