import React, { useState } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, TouchableOpacity, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { Button, ErrorText, Card } from "../../components/kit";
import { useTheme } from "../../lib/theme-context";

function friendly(code: string): string {
  if (
    code.includes("invalid-credential") ||
    code.includes("wrong-password")     ||
    code.includes("user-not-found")
  ) return "Wrong email or password.";
  if (code.includes("invalid-email"))         return "That email address looks invalid.";
  if (code.includes("missing-password"))      return "Please enter your password.";
  if (code.includes("missing-email"))         return "Please enter your email.";
  if (code.includes("user-disabled"))         return "This account has been disabled.";
  if (code.includes("too-many-requests"))     return "Too many attempts — wait a moment and try again.";
  if (code.includes("operation-not-allowed")) return "Email sign-in is not enabled. Contact support.";
  if (code.includes("network"))               return "Network error — check your connection.";
  return `Login failed (${code}).`;
}

export default function Login() {
  const { login } = useAuth();
  const router    = useRouter();
  const { theme } = useTheme();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    setErr(null);
    if (!email.trim()) { setErr("Please enter your email."); return; }
    if (!password)     { setErr("Please enter your password."); return; }
    setBusy(true);
    try {
      await login(email, password);
    } catch (e: any) {
      setErr(friendly(String(e?.code || e?.message || e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[s.wrap, { backgroundColor: theme.bg }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.logo}>🎯</Text>
        <Text style={[s.title, { color: theme.text }]}>Alpha</Text>
        <Text style={[s.tag, { color: theme.sub }]}>SSC CGL Mock Tests & Analytics</Text>

        <Card style={{ marginTop: 24 }}>
          {/* Email */}
          <Text style={[s.label, { color: theme.sub }]}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.input, { backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }]}
          />

          {/* Password with show/hide */}
          <Text style={[s.label, { color: theme.sub }]}>PASSWORD</Text>
          <View style={[s.passWrap, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.muted}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              style={[s.passInput, { color: theme.text }]}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eyeBtn} activeOpacity={0.7}>
              <Text style={{ fontSize: 18 }}>{showPass ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          <ErrorText msg={err} />
          <Button title="Login" onPress={onLogin} loading={busy} style={{ marginTop: 4 }} />

          <TouchableOpacity
            onPress={() => router.push("/(auth)/forgot")}
            style={{ marginTop: 14, alignItems: "center" }}
          >
            <Text style={{ color: theme.primary, fontWeight: "600" }}>Forgot password?</Text>
          </TouchableOpacity>
        </Card>

        <View style={s.footer}>
          <Text style={{ color: theme.sub }}>New here? </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
            <Text style={{ color: theme.primary, fontWeight: "700" }}>Create account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:      { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo:      { fontSize: 48, textAlign: "center" },
  title:     { fontSize: 32, fontWeight: "900", textAlign: "center", marginTop: 8 },
  tag:       { fontSize: 14, textAlign: "center", marginTop: 4 },
  footer:    { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  label:     { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 6, marginTop: 14 },
  input:     {
    borderWidth: 1.5, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 16, marginBottom: 2,
  },
  passWrap:  {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderRadius: 14, marginBottom: 2,
  },
  passInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16 },
  eyeBtn:    { paddingHorizontal: 14, paddingVertical: 13 },
});
