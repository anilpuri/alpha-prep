import React, { useState } from "react";
import { Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { Field, Button, ErrorText, Card } from "../../components/kit";
import { useTheme } from "../../lib/theme-context";

export default function Forgot() {
  const { forgotPassword } = useAuth();
  const router    = useRouter();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [sent,  setSent]  = useState(false);
  const [err,   setErr]   = useState<string | null>(null);
  const [busy,  setBusy]  = useState(false);

  const onSend = async () => {
    setErr(null); setBusy(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (e: any) {
      const code = String(e?.code || "");
      setErr(code.includes("invalid-email")
        ? "That email looks invalid."
        : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Text style={[s.title, { color: theme.text }]}>Reset password</Text>
      <Card style={{ marginTop: 24 }}>
        {sent ? (
          <>
            <Text style={{ fontSize: 16, color: theme.green, fontWeight: "700", marginBottom: 8 }}>
              ✅ Reset link sent
            </Text>
            <Text style={{ color: theme.sub, marginBottom: 16 }}>
              Check your inbox (and spam) for the password reset email,
              then login with your new password.
            </Text>
            <Button title="Back to login" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Field label="Email" value={email} onChangeText={setEmail}
                   keyboardType="email-address" placeholder="you@example.com" />
            <ErrorText msg={err} />
            <Button title="Send reset link" onPress={onSend} loading={busy} />
          </>
        )}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:  { flexGrow: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "900", textAlign: "center" },
});
