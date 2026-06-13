import React, { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { Button, Card } from "../../components/kit";
import { useTheme } from "../../lib/theme-context";

export default function Verify() {
  const { user, resendVerification, refreshVerification, logout } = useAuth();
  const router    = useRouter();
  const { theme } = useTheme();
  const [status,   setStatus]   = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll every 5 s — as soon as the user clicks the email link, let them in
  useEffect(() => {
    timer.current = setInterval(async () => {
      const ok = await refreshVerification().catch(() => false);
      if (ok) {
        if (timer.current) clearInterval(timer.current);
        router.replace("/(tabs)");
      }
    }, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onResend = async () => {
    setBusy(true); setStatus(null);
    try {
      await resendVerification();
      setStatus("Verification email sent again — check inbox & spam.");
      setCooldown(30);
    } catch {
      setStatus("Could not send — wait a minute and try again.");
    } finally {
      setBusy(false);
    }
  };

  const onCheck = async () => {
    setBusy(true); setStatus(null);
    const ok = await refreshVerification().catch(() => false);
    setBusy(false);
    if (ok) router.replace("/(tabs)");
    else setStatus("Not verified yet — click the link in the email first.");
  };

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Text style={s.emoji}>📬</Text>
      <Text style={[s.title, { color: theme.text }]}>Verify your email</Text>
      <Text style={[s.sub, { color: theme.sub }]}>
        We sent a verification link to{"\n"}
        <Text style={{ fontWeight: "800", color: theme.text }}>{user?.email}</Text>
      </Text>

      <Card style={{ marginTop: 24, width: "100%" }}>
        <Text style={{ color: theme.sub, marginBottom: 16, lineHeight: 20 }}>
          Open the email and click the link. This screen will unlock automatically
          (we check every few seconds).
        </Text>
        {status && <Text style={[s.status, { color: theme.amber }]}>{status}</Text>}
        <Button title="I've verified — check now" onPress={onCheck} loading={busy} />
        <View style={{ height: 10 }} />
        <Button
          title={cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
          onPress={onResend}
          variant="ghost"
        />
        <View style={{ height: 10 }} />
        <Button title="Use a different account" onPress={logout} variant="ghost" />
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:   { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  emoji:  { fontSize: 48 },
  title:  { fontSize: 26, fontWeight: "900", marginTop: 12 },
  sub:    { fontSize: 15, textAlign: "center", marginTop: 8, lineHeight: 22 },
  status: { marginBottom: 12, fontWeight: "600" },
});
