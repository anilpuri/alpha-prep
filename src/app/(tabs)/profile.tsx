import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from "react-native";
import { Spinner } from "../../components/Spinner";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import { fetchAttempts } from "../../lib/db";
import { THEME_META, type ThemeName, type ThemeGroup } from "../../lib/theme";
import type { Attempt } from "../../lib/types";

const GROUPS: { group: ThemeGroup; label: string; emoji: string }[] = [
  { group: "default", label: "Default", emoji: "✦" },
  { group: "light",   label: "Light",   emoji: "☀️" },
  { group: "dark",    label: "Dark",    emoji: "🌙" },
];

export default function Profile() {
  const { user, logout }               = useAuth();
  const { theme, themeName, setTheme } = useTheme();
  const [attempts, setAttempts]        = useState<Attempt[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchAttempts(user.uid, 500)
      .then(a => { setAttempts(a); setLoadingStats(false); })
      .catch(() => setLoadingStats(false));
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
});

const styles = StyleSheet.create({
  row: { borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", borderWidth: 1 },
});
