import React, { useState } from "react";
import {
  Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, View, TextInput, Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { Button, ErrorText, Card } from "../../components/kit";
import { useTheme } from "../../lib/theme-context";

function friendly(code: string): string {
  if (code.includes("email-already-in-use"))  return "An account with this email already exists.";
  if (code.includes("invalid-email"))         return "That email address looks invalid.";
  if (code.includes("weak-password"))         return "Password must be at least 6 characters.";
  if (code.includes("operation-not-allowed")) return "Email sign-up is not enabled. Contact support.";
  if (code.includes("network"))               return "Network error — check your connection.";
  if (code.includes("too-many-requests"))     return "Too many attempts — wait a moment and try again.";
  return `Registration failed (${code}).`;
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export default function Register() {
  const { register } = useAuth();
  const router       = useRouter();
  const { theme }    = useTheme();

  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onRegister = async () => {
    setErr(null);
    if (!name.trim())         { setErr("Please enter your name."); return; }
    if (!email.trim())        { setErr("Please enter your email."); return; }
    if (!isValidEmail(email)) { setErr("That email address looks invalid."); return; }
    if (password.length < 6)  { setErr("Password must be at least 6 characters."); return; }
    if (password !== confirm)  { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      await register(name, email, password);
    } catch (e: any) {
      setErr(friendly(String(e?.code || e?.message || e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[s.wrap, { backgroundColor: theme.bg }]} keyboardShouldPersistTaps="handled">
        <Image source={require("../../../assets/images/icon.png")} style={s.logo} resizeMode="contain" />
        <Text style={[s.title, { color: theme.text }]}>Create account</Text>
        <Text style={[s.tag, { color: theme.sub }]}>Start practicing 25,000+ SSC CGL PYQs</Text>

        <Card style={{ marginTop: 24 }}>
          {/* Name */}
          <Text style={[s.label, { color: theme.sub }]}>NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={theme.muted}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            style={[s.input, { backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }]}
          />

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
            textContentType="emailAddress"
            autoComplete="email"
            style={[s.input, { backgroundColor: theme.bg2, borderColor: theme.border, color: theme.text }]}
          />

          {/* Password */}
          <Text style={[s.label, { color: theme.sub }]}>PASSWORD</Text>
          <View style={[s.passWrap, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="min 6 characters"
              placeholderTextColor={theme.muted}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              style={[s.passInput, { color: theme.text }]}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eyeBtn} activeOpacity={0.7}>
              <Text style={{ fontSize: 18 }}>{showPass ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          {/* Confirm Password */}
          <Text style={[s.label, { color: theme.sub }]}>CONFIRM PASSWORD</Text>
          <View style={[s.passWrap, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="repeat password"
              placeholderTextColor={theme.muted}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              style={[s.passInput, { color: theme.text }]}
            />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={s.eyeBtn} activeOpacity={0.7}>
              <Text style={{ fontSize: 18 }}>{showConfirm ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>

          <ErrorText msg={err} />
          <Button title="Register" onPress={onRegister} loading={busy} style={{ marginTop: 4 }} />
        </Card>

        <View style={s.footer}>
          <Text style={{ color: theme.sub }}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: theme.primary, fontWeight: "700" }}>Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap:      { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo:      { width: 88, height: 88, alignSelf: "center", marginBottom: 12 },
  title:     { fontSize: 28, fontWeight: "900", textAlign: "center" },
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
