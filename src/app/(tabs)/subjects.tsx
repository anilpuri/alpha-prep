import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { fetchTree } from "../../lib/db";
import { useTheme } from "../../lib/theme-context";
import { subjectAccent, subjectEmoji } from "../../lib/theme";
import type { TreeNode } from "../../lib/types";

function countLeaves(n: TreeNode): number {
  if (n.leaf) return 1;
  return (n.children || []).reduce((s, c) => s + countLeaves(c), 0);
}
function countLeafQ(n: TreeNode): number {
  if (n.leaf) return n.count || 0;
  return (n.children || []).reduce((s, c) => s + countLeafQ(c), 0);
}

export default function Subjects() {
  const [subjects, setSubjects] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const { theme } = useTheme();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const tree = await fetchTree();
      setSubjects(tree.subjects);
    } catch (e: any) {
      setErr(e.message || "Failed to load subjects");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <ActivityIndicator size="large" color={theme.primary} />
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
        <Text style={{ fontSize: 28, fontWeight: "900", color: theme.text }}>Practice</Text>
        <Text style={{ fontSize: 14, color: theme.sub, marginTop: 2 }}>25,932 SSC CGL questions</Text>
      </View>
      <FlatList
        data={subjects}
        keyExtractor={i => i.name}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.primary} />}
        renderItem={({ item }) => {
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
              onPress={() => router.push({ pathname: "/topic", params: { node: JSON.stringify(item), subject: item.name } })}
              activeOpacity={0.82}
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
              <View style={[s.arrow, { backgroundColor: color + "20" }]}>
                <Text style={{ color, fontSize: 16, fontWeight: "900" }}>›</Text>
              </View>
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
  iconBox: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  arrow: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
