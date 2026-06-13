import React, { useState, useEffect } from "react";
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { useTheme } from "../lib/theme-context";
import { groqChat } from "../lib/groq";
import { stripHtml } from "../lib/utils";
import type { Question } from "../lib/types";

interface Props {
  question: Question | null;
  visible: boolean;
  onClose: () => void;
}

type Section = { key: string; label: string; icon: string; color: string };

const SECTIONS: Section[] = [
  { key: "CONCEPT", label: "What's Being Tested",  icon: "🎯", color: "#8880D5" },
  { key: "CORRECT", label: "Why The Answer Is Right", icon: "✅", color: "#22C55E" },
  { key: "MISTAKE", label: "Common Mistake",        icon: "⚠️", color: "#F59E0B" },
  { key: "TIP",     label: "Quick Tip",             icon: "💡", color: "#3B82F6" },
];

function parseSections(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const sec of SECTIONS) {
    const re = new RegExp(`${sec.key}:\\s*([\\s\\S]*?)(?=(?:CONCEPT|CORRECT|MISTAKE|TIP):|$)`, "i");
    const m  = text.match(re);
    if (m) result[sec.key] = m[1].trim();
  }
  return result;
}

export function ConceptModal({ question, visible, onClose }: Props) {
  const { theme } = useTheme();
  const [loading,  setLoading]  = useState(false);
  const [sections, setSections] = useState<Record<string, string>>({});
  const [error,    setError]    = useState<string | null>(null);

  const analyze = async () => {
    if (!question) return;
    setLoading(true); setSections({}); setError(null);
    try {
      const opts    = question.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${stripHtml(o.value)}`).join("\n");
      const correct = question.options.filter(o => question.answer.includes(o.id)).map(o => stripHtml(o.value)).join(", ");

      const text = await groqChat([
        {
          role: "system",
          content:
            "You are an expert SSC CGL tutor. Analyze the question and respond with EXACTLY these 4 labeled sections:\n" +
            "CONCEPT: [what concept is tested — 1-2 sentences]\n" +
            "CORRECT: [why the answer is correct, step-by-step if math — 2-4 sentences]\n" +
            "MISTAKE: [most common wrong approach candidates take — 1-2 sentences]\n" +
            "TIP: [one concise memory trick or shortcut — 1 sentence]\n" +
            "Use simple language. No markdown. Keep each section under 60 words.",
        },
        {
          role: "user",
          content:
            `Question: ${stripHtml(question.question)}\n\nOptions:\n${opts}\n\nCorrect Answer: ${correct}`,
        },
      ], 1024);

      const parsed = parseSections(text);
      if (!Object.keys(parsed).length) {
        // Fallback: if model didn't follow format, show full text as concept
        setSections({ CONCEPT: text.slice(0, 800) });
      } else {
        setSections(parsed);
      }
    } catch (e: any) {
      setError(e.message || "AI analysis failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && question && !loading && !Object.keys(sections).length && !error) {
      analyze();
    }
    if (!visible) { setSections({}); setError(null); }
  }, [visible, question]);

  const hasContent = Object.keys(sections).length > 0;
  const qText = question ? stripHtml(question.question) : "";
  const correctText = question
    ? question.options.filter(o => question.answer.includes(o.id)).map(o => stripHtml(o.value)).join(", ")
    : "";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={[s.sheet, { backgroundColor: theme.bg }]}>
          {/* Handle bar */}
          <View style={[s.handle, { backgroundColor: theme.border }]} />

          {/* Header */}
          <View style={[s.header, { borderBottomColor: theme.border }]}>
            <View style={[s.headerIcon, { backgroundColor: theme.primary + "20" }]}>
              <Text style={{ fontSize: 22 }}>🧠</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: theme.text }]}>AI Concept Explainer</Text>
              <Text style={[s.headerSub, { color: theme.sub }]}>Powered by Groq · llama-3.3-70b</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[s.closeBtn, { backgroundColor: theme.card }]}>
              <Text style={{ color: theme.sub, fontSize: 18, fontWeight: "700" }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Question preview */}
            {question && (
              <View style={[s.qCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[s.qLabel, { color: theme.primary }]}>QUESTION</Text>
                <Text style={[s.qText, { color: theme.text }]} numberOfLines={4}>{qText}</Text>
                {correctText ? (
                  <View style={[s.correctBadge, { backgroundColor: theme.green + "20" }]}>
                    <Text style={{ fontSize: 10 }}>✅</Text>
                    <Text style={[s.correctText, { color: theme.green }]}>{correctText}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Loading */}
            {loading && (
              <View style={s.loadingBox}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[s.loadingText, { color: theme.sub }]}>Analysing concept…</Text>
                <Text style={[s.loadingHint, { color: theme.muted }]}>This takes a few seconds</Text>
              </View>
            )}

            {/* Error */}
            {error && !loading && (
              <View style={[s.errorBox, { backgroundColor: theme.redLt, borderColor: theme.red }]}>
                <Text style={{ fontSize: 28, marginBottom: 8 }}>⚠️</Text>
                <Text style={[s.errorText, { color: theme.red }]}>{error}</Text>
                <TouchableOpacity
                  onPress={analyze}
                  style={[s.retryBtn, { backgroundColor: theme.primary }]}
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>Try Again</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Section cards */}
            {hasContent && SECTIONS.map(sec => {
              const content = sections[sec.key];
              if (!content) return null;
              return (
                <View
                  key={sec.key}
                  style={[s.sectionCard, { backgroundColor: sec.color + "12", borderColor: sec.color + "44" }]}
                >
                  <View style={s.sectionHeader}>
                    <View style={[s.sectionIconWrap, { backgroundColor: sec.color + "25" }]}>
                      <Text style={{ fontSize: 16 }}>{sec.icon}</Text>
                    </View>
                    <Text style={[s.sectionLabel, { color: sec.color }]}>{sec.label}</Text>
                  </View>
                  <Text style={[s.sectionBody, { color: theme.text }]}>{content}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "88%", minHeight: "55%",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 20, elevation: 20,
  },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginTop: 12, marginBottom: 4 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "900" },
  headerSub:   { fontSize: 11, marginTop: 1 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },

  qCard: {
    borderRadius: 16, borderWidth: 1, padding: 14, gap: 8,
  },
  qLabel:  { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  qText:   { fontSize: 13, lineHeight: 20, fontWeight: "500" },
  correctBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start",
  },
  correctText: { fontSize: 12, fontWeight: "700" },

  loadingBox: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 15, fontWeight: "600" },
  loadingHint: { fontSize: 12 },

  errorBox: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: "center", gap: 6 },
  errorText: { fontSize: 13, textAlign: "center", fontWeight: "600" },
  retryBtn: { marginTop: 8, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },

  sectionCard:   { borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sectionLabel:  { fontSize: 12, fontWeight: "900", letterSpacing: 0.5, flex: 1 },
  sectionBody:   { fontSize: 14, lineHeight: 22 },
});
