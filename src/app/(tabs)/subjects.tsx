import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Spinner } from "../../components/Spinner";
import { useRouter } from "expo-router";
import { fetchTree } from "../../lib/db";
import { useTheme } from "../../lib/theme-context";
import { subjectAccent, subjectEmoji } from "../../lib/theme";
import type { TreeNode } from "../../lib/types";

const ORDER_KEY = "@alpha/subject_order";

function countLeaves(n: TreeNode): number {
  if (n.leaf) return 1;
  return (n.children || []).reduce((s, c) => s + countLeaves(c), 0);
}
function countLeafQ(n: TreeNode): number {
  if (n.leaf) return n.count || 0;
  return (n.children || []).reduce((s, c) => s + countLeafQ(c), 0);
}

export default function Subjects() {
  const [subjects,  setSubjects]  = useState<TreeNode[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState(false);
  const router    = useRouter();
  const { theme } = useTheme();

  const applyOrder = (raw: TreeNode[], saved: string[]): TreeNode[] =>
    [...raw].sort((a, b) => {
      const ai = saved.indexOf(a.name);
      const bi = saved.indexOf(b.name);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const tree = await fetchTree();
      const saved = await AsyncStorage.getItem(ORDER_KEY);
      const ordered = saved ? applyOrder(tree.subjects, JSON.parse(saved)) : tree.subjects;
      setSubjects(ordered);
    } catch (e: any) {
      setErr(e.message || "Failed to load subjects");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const moveSubject = async (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= subjects.length) return;
    const next = [...subjects];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSubjects(next);
    await AsyncStorage.setItem(ORDER_KEY, JSON.stringify(next.map(s => s.name)));
  };

  if (loading) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <Spinner icon="📚" label="Loading Subjects" sublabel="Fetching question bank…" />
    </View>
  );
  if (err) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 24 }}>
      <Text style={{ fontSize: 36 }}>😕</Text>
      <Text style={{ color: theme.red, textAlign: "center", marginTop: 12 }}>{err}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ padding: 20, paddingTop: 56 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontWeight: "900", color: theme.text }}>Practice</Text>
            <Text style={{ fontSize: 14, color: theme.sub, marginTop: 2 }}>25,932 SSC CGL questions</Text>
          </View>
          <TouchableOpacity
            onPress={() => setEditOrder(v => !v)}
            style={[s.orderBtn, {
              backgroundColor: editOrder ? theme.primary : theme.bg2,
              borderColor: editOrder ? theme.primary : theme.border,
            }]}
          >
            <Text style={{ color: editOrder ? "#fff" : theme.sub, fontSize: 12, fontWeight: "700" }}>
              {editOrder ? "Done" : "⇅ Order"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* AI Paper banner */}
        <TouchableOpacity
          onPress={() => router.push("/ai-paper")}
          activeOpacity={0.88}
          style={{ marginTop: 14, borderRadius: 18, overflow: "hidden", borderWidth: 1.5, borderColor: theme.primary }}
        >
          {/* Top strip */}
          <View style={{
            backgroundColor: theme.primary, paddingVertical: 12, paddingHorizontal: 16,
            flexDirection: "row", alignItems: "center", gap: 10,
          }}>
            <Text style={{ fontSize: 22 }}>🤖</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.2 }}>
                AI Mock Paper Generator
              </Text>
              <Text style={{ color: "#ffffff99", fontSize: 11, marginTop: 1 }}>
                Personalized from your weak chapters
              </Text>
            </View>
            <View style={{ backgroundColor: "#ffffff25", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>TRY NOW</Text>
            </View>
          </View>
          {/* Stats row */}
          <View style={{
            backgroundColor: theme.primary + "14", paddingVertical: 10, paddingHorizontal: 16,
            flexDirection: "row", alignItems: "center",
          }}>
            {[
              { value: "Smart", label: "Picks weak topics" },
              { value: "Custom", label: "Select chapters" },
              { value: "25K+", label: "Questions" },
            ].map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <View style={{ width: 1, height: 28, backgroundColor: theme.border, marginHorizontal: 12 }} />}
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: theme.primary, fontWeight: "900", fontSize: 15 }}>{item.value}</Text>
                  <Text style={{ color: theme.sub, fontSize: 10, marginTop: 1, textAlign: "center" }}>{item.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </TouchableOpacity>
      </View>

      <FlatList
        data={subjects}
        keyExtractor={i => i.name}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        renderItem={({ item, index }) => {
          const name   = item.name.replace(/_/g, " ");
          const color  = subjectAccent(name, theme);
          const topics = countLeaves(item);
          const total  = countLeafQ(item);
          return (
            <TouchableOpacity
              style={[s.card, {
                backgroundColor: theme.card, borderColor: theme.border,
                borderLeftColor: color, borderLeftWidth: 5,
              }]}
              onPress={() => {
                if (editOrder) return;
                router.push({ pathname: "/topic", params: { node: JSON.stringify(item), subject: item.name } });
              }}
              activeOpacity={editOrder ? 1 : 0.82}
            >
              <View style={[s.iconBox, { backgroundColor: color + "20" }]}>
                <Text style={{ fontSize: 26 }}>{subjectEmoji(name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: theme.text }}>{name}</Text>
                <Text style={{ fontSize: 13, color: theme.sub, marginTop: 3 }}>
                  {topics} topics · {total.toLocaleString()} questions
                </Text>
              </View>
              {editOrder ? (
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <TouchableOpacity
                    onPress={() => moveSubject(index, -1)}
                    disabled={index === 0}
                    style={[s.arrow, { backgroundColor: index === 0 ? theme.bg2 : color + "20" }]}
                  >
                    <Text style={{ color: index === 0 ? theme.muted : color, fontSize: 16, fontWeight: "900" }}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveSubject(index, 1)}
                    disabled={index === subjects.length - 1}
                    style={[s.arrow, { backgroundColor: index === subjects.length - 1 ? theme.bg2 : color + "20" }]}
                  >
                    <Text style={{ color: index === subjects.length - 1 ? theme.muted : color, fontSize: 16, fontWeight: "900" }}>↓</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[s.arrow, { backgroundColor: color + "20" }]}>
                  <Text style={{ color, fontSize: 16, fontWeight: "900" }}>›</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18, padding: 16, flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1,
    shadowColor: "#00000010", shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  iconBox:  { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  arrow:    { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  orderBtn: { borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
});
