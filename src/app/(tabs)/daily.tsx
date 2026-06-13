import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, FlatList, Modal,
} from "react-native";
import { ConfirmSheet } from "../../components/ConfirmSheet";
import * as Speech from "expo-speech";
import { useTheme } from "../../lib/theme-context";
import { useAuth } from "../../lib/auth-context";
import { groqChat, parseGroqJson } from "../../lib/groq";
import { loadSettings, getActiveModel } from "../../lib/settings";
import {
  saveDailyContent, fetchAllDailyContent, deleteDailyContent,
  checkAndAwardAchievements,
} from "../../lib/db";
import type { DailyContent, VocabWord, OneWordSub, GkFact } from "../../lib/types";

const todayStr = () => new Date().toISOString().slice(0, 10);

const VOCAB_THEMES = [
  "Random", "Science & Technology", "History & Heritage",
  "Politics & Governance", "Economics & Finance", "Environment & Nature",
  "Art & Culture", "Health & Medicine", "International Relations",
  "Law & Justice", "Sports & Awards",
];

function autoTheme() {
  const idx = (Math.floor(Date.now() / 86400000)) % (VOCAB_THEMES.length - 1);
  return VOCAB_THEMES[idx + 1];
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CUR_YEAR = new Date().getFullYear();

const SYS_JSON =
  "You are an SSC CGL expert. Output ONLY a raw JSON array — no explanation, no markdown, no preamble.";

async function safeGen<T>(
  messages: Parameters<typeof groqChat>[0],
  maxTokens: number,
): Promise<T> {
  const model = getActiveModel();
  const raw = await groqChat(messages, maxTokens, model);
  return parseGroqJson<T>(raw);
}

// Generate misspellings for MCQ vocab test
function makeMisspellings(word: string): string[] {
  const ws: string[] = [];
  // 1. swap two adjacent different chars
  for (let i = 0; i < word.length - 1 && ws.length < 3; i++) {
    if (word[i] !== word[i + 1]) {
      const v = word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
      if (!ws.includes(v)) ws.push(v);
    }
  }
  // 2. double a consonant
  const consonants = "bcdfghjklmnpqrstvwxyz";
  for (let i = 1; i < word.length - 1 && ws.length < 3; i++) {
    if (consonants.includes(word[i].toLowerCase())) {
      const v = word.slice(0, i) + word[i] + word.slice(i);
      if (!ws.includes(v) && v !== word) ws.push(v);
    }
  }
  // 3. remove a letter
  for (let i = 1; i < word.length - 1 && ws.length < 3; i++) {
    const v = word.slice(0, i) + word.slice(i + 1);
    if (!ws.includes(v) && v !== word) ws.push(v);
  }
  // 4. change a vowel
  const vowelMap: Record<string, string> = { a:"e", e:"i", i:"a", o:"u", u:"o", A:"E", E:"I", I:"A", O:"U", U:"O" };
  for (let i = 0; i < word.length && ws.length < 3; i++) {
    if (vowelMap[word[i]]) {
      const v = word.slice(0, i) + vowelMap[word[i]] + word.slice(i + 1);
      if (!ws.includes(v) && v !== word) ws.push(v);
    }
  }
  // fallback: add 'e' or truncate
  if (ws.length < 3) ws.push(word + "e");
  if (ws.length < 3) ws.push(word.slice(0, -1));
  return ws.slice(0, 3);
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DailyScreen() {
  const { theme } = useTheme();
  const { user }  = useAuth();

  const [allDays,   setAllDays]   = useState<(DailyContent & { id: string })[]>([]);
  const [selected,  setSelected]  = useState<(DailyContent & { id: string }) | null>(null);
  const [activeTab, setActiveTab] = useState<"vocab" | "owsub" | "gk">("vocab");
  const [generating, setGenerating] = useState<"vocab" | "owsub" | "gk" | null>(null);

  // Vocab
  const [vocabTheme, setVocabTheme] = useState("Random");

  // OW-Sub
  const [owCount,      setOwCount]      = useState(15);
  const [owCountSheet, setOwCountSheet] = useState(false);

  // GK
  const [gkModal,  setGkModal]  = useState(false);
  const [gkFilter, setGkFilter] = useState<"today" | "monthly" | "yearly">("today");
  const [gkMonth,  setGkMonth]  = useState(new Date().getMonth());
  const [gkYear,   setGkYear]   = useState(CUR_YEAR);
  const [gkCount,  setGkCount]  = useState(10);

  // Vocab MCQ practice
  const [vocabTest,    setVocabTest]    = useState(false);
  const [vIdx,         setVIdx]         = useState(0);
  const [vOptions,     setVOptions]     = useState<string[]>([]);
  const [vCorrectIdx,  setVCorrectIdx]  = useState(0);
  const [vPick,        setVPick]        = useState<number | null>(null);
  const [vScore,       setVScore]       = useState({ correct: 0, wrong: 0 });

  // OW-Sub test
  const [owTest,   setOwTest]   = useState(false);
  const [owIdx,    setOwIdx]    = useState(0);
  const [owPick,   setOwPick]   = useState<number | null>(null);
  const [owScore,  setOwScore]  = useState({ correct: 0, wrong: 0 });

  // GK review
  const [gkRev,    setGkRev]    = useState(false);
  const [gkRevIdx, setGkRevIdx] = useState(0);
  const [gkReveal, setGkReveal] = useState(false);

  // Delete
  const [delTarget, setDelTarget] = useState<string | null>(null);

  // Speech
  const [speaking, setSpeaking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return [];
    const days = await fetchAllDailyContent(user.uid);
    setAllDays(days);
    return days;
  }, [user]);

  useEffect(() => {
    loadSettings();
    load().then(days => {
      if (days.length) setSelected(days[0]);
    });
  }, [load]);

  const getOrCreate = (date: string): DailyContent & { id: string } =>
    allDays.find(d => d.id === date) ??
    { id: date, createdAt: Date.now(), vocab: [], oneWordSub: [], gkCapsule: [], questionSets: [] };

  // ── Generators ────────────────────────────────────────────────────────────────

  const genVocab = async (append = false) => {
    if (!user || generating) return;
    const date = todayStr();
    setGenerating("vocab");
    try {
      const theme_ = vocabTheme === "Random" ? autoTheme() : vocabTheme;
      const vocab = await safeGen<VocabWord[]>([
        { role: "system", content: SYS_JSON },
        {
          role: "user",
          content:
            `Generate 20 English vocabulary words for SSC CGL. Theme: "${theme_}". ` +
            `Return JSON array: [{"word":"","pronunciation":"KON-sept","meaning":"","pos":"","synonym":"","antonym":"","example":""},...]. ` +
            `Mix 6 easy, 10 medium, 4 hard. Pronunciation in CAPS phonetic. ONLY the array.`,
        },
      ], 3000);
      const shell   = getOrCreate(date);
      const merged  = append ? [...(shell.vocab ?? []), ...vocab] : vocab;
      const updated = { ...shell, vocab: merged };
      await saveDailyContent(user.uid, date, updated);
      const days = await load();
      setSelected({ ...updated, id: date });
      if (!append) {
        await checkAndAwardAchievements(user.uid, {
          totalTests: 0, totalQ: 0, streak: 0, maxAccuracy: 0, avgSpeed: 0,
          dailyContent: true, dailyCount: days.length,
        });
      }
    } catch (e: any) {
      Alert.alert("Vocab failed", e.message);
    } finally {
      setGenerating(null);
    }
  };

  const genOwSub = async (count = owCount, append = false) => {
    if (!user || generating) return;
    const date = todayStr();
    setOwCountSheet(false);
    setGenerating("owsub");
    try {
      const owsub = await safeGen<OneWordSub[]>([
        { role: "system", content: SYS_JSON },
        {
          role: "user",
          content:
            `Generate ${count} one-word substitution items for SSC CGL English. ` +
            `Each phrase must be a complete sentence ending with "______ " where the blank is the answer. ` +
            `Example: {"phrase":"A person who can use both hands equally well is called ______","word":"Ambidextrous","options":["Ambidextrous","Ambiguous","Ambivalent","Ambrosial"],"explanation":"Ambidextrous means equally skilled with both hands."}. ` +
            `Return JSON array. options[0] must be the correct word. ONLY the array.`,
        },
      ], 3500);
      const shell   = getOrCreate(date);
      const merged  = append ? [...(shell.oneWordSub ?? []), ...owsub] : owsub;
      const updated = { ...shell, oneWordSub: merged };
      await saveDailyContent(user.uid, date, updated);
      await load();
      setSelected({ ...updated, id: date });
    } catch (e: any) {
      Alert.alert("OW-Sub failed", e.message);
    } finally {
      setGenerating(null);
    }
  };

  const genGk = async (append = false) => {
    if (!user || generating) return;
    const date = todayStr();
    setGkModal(false);
    setGenerating("gk");
    try {
      let period = "Focus on current affairs and important events from the past week.";
      if (gkFilter === "monthly")
        period = `Focus on important events from ${MONTHS[gkMonth]} ${gkYear}.`;
      else if (gkFilter === "yearly")
        period = `Focus on important events and milestones of the year ${gkYear}.`;

      const gk = await safeGen<GkFact[]>([
        { role: "system", content: SYS_JSON },
        {
          role: "user",
          content:
            `Generate ${gkCount} GK facts for SSC CGL. ${period} ` +
            `Mix categories: current affairs, history, geography, science, polity, economy. ` +
            `Return JSON array: [{"category":"","headline":"","detail":"2-3 sentence explanation with context for SSC CGL."},...]. ONLY the array.`,
        },
      ], 2500);
      const shell   = getOrCreate(date);
      const merged  = append ? [...(shell.gkCapsule ?? []), ...gk] : gk;
      const updated = { ...shell, gkCapsule: merged };
      await saveDailyContent(user.uid, date, updated);
      await load();
      setSelected({ ...updated, id: date });
    } catch (e: any) {
      Alert.alert("GK failed", e.message);
    } finally {
      setGenerating(null);
    }
  };

  const deleteSectionConfirm = (section: "vocab" | "owsub" | "gk") => {
    const labels = { vocab: "Vocabulary", owsub: "OW-Sub", gk: "GK Capsule" };
    Alert.alert(
      `Clear ${labels[section]}?`,
      `Remove all ${labels[section]} for this day?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => deleteSection(section) },
      ]
    );
  };

  const deleteSection = async (section: "vocab" | "owsub" | "gk") => {
    if (!user || !selected) return;
    const updates =
      section === "vocab"  ? { vocab: [] as VocabWord[] } :
      section === "owsub"  ? { oneWordSub: [] as OneWordSub[] } :
                             { gkCapsule: [] as GkFact[] };
    const updated = { ...selected, ...updates };
    try {
      await saveDailyContent(user.uid, selected.id, updated);
      setSelected(updated);
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e.message);
    }
  };

  // ── Speech ────────────────────────────────────────────────────────────────────

  const speak = (text: string, key: string) => {
    if (speaking === key) { Speech.stop(); setSpeaking(null); return; }
    Speech.stop();
    Speech.speak(text, {
      language: "en-IN", pitch: 1.0, rate: 0.85,
      onDone: () => setSpeaking(null), onStopped: () => setSpeaking(null),
    });
    setSpeaking(key);
  };

  // ── Vocab MCQ Test ────────────────────────────────────────────────────────────

  const setupVocabQ = (idx: number, words: VocabWord[]) => {
    const word = words[idx]?.word ?? "";
    const misspellings = makeMisspellings(word);
    const options = shuffleArr([word, ...misspellings]);
    setVOptions(options);
    setVCorrectIdx(options.indexOf(word));
    setVPick(null);
  };

  const startVocabTest = () => {
    const words = selected?.vocab ?? [];
    if (!words.length) return;
    setVIdx(0);
    setVScore({ correct: 0, wrong: 0 });
    setupVocabQ(0, words);
    setVocabTest(true);
  };

  const pickVocab = (optIdx: number) => {
    if (vPick !== null) return;
    setVPick(optIdx);
    const ok = optIdx === vCorrectIdx;
    setVScore(s => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
  };

  const nextVocab = () => {
    const words = selected?.vocab ?? [];
    if (vIdx + 1 >= words.length) { setVocabTest(false); return; }
    const next = vIdx + 1;
    setVIdx(next);
    setupVocabQ(next, words);
  };

  // ── OW-Sub test ───────────────────────────────────────────────────────────────

  const startOwTest = () => {
    setOwIdx(0); setOwPick(null); setOwScore({ correct: 0, wrong: 0 });
    setOwTest(true);
  };

  const pickOw = (i: number) => {
    if (owPick !== null) return;
    setOwPick(i);
    const item    = selected?.oneWordSub?.[owIdx];
    const correct = item?.options.indexOf(item.word) ?? -1;
    setOwScore(s => ({ correct: s.correct + (i === correct ? 1 : 0), wrong: s.wrong + (i !== correct ? 1 : 0) }));
  };

  const nextOw = () => {
    if (owIdx + 1 >= (selected?.oneWordSub?.length ?? 0)) { setOwTest(false); return; }
    setOwIdx(i => i + 1); setOwPick(null);
  };

  // ── Day chip ──────────────────────────────────────────────────────────────────

  const renderDayChip = ({ item }: { item: DailyContent & { id: string } }) => (
    <TouchableOpacity
      onPress={() => setSelected(item)}
      style={[s.dayChip, {
        backgroundColor: selected?.id === item.id ? theme.primary : theme.bg2,
        borderColor:     selected?.id === item.id ? theme.primary : theme.border,
      }]}
    >
      <Text style={{ fontSize: 11, fontWeight: "800", color: selected?.id === item.id ? "#fff" : theme.text }}>
        {item.id}
      </Text>
    </TouchableOpacity>
  );

  const tabs = [
    { key: "vocab", label: "Vocab",  count: selected?.vocab?.length ?? 0 },
    { key: "owsub", label: "OW-Sub", count: selected?.oneWordSub?.length ?? 0 },
    { key: "gk",    label: "GK",     count: selected?.gkCapsule?.length ?? 0 },
  ] as const;

  const isToday = selected?.id === todayStr();

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[s.header, { borderBottomColor: theme.border }]}>
        <View style={{ paddingTop: 52, paddingBottom: 8, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: theme.text }}>Daily Content</Text>
          <Text style={{ fontSize: 13, color: theme.sub, marginTop: 2 }}>
            Select a day, pick a section, and generate
          </Text>
        </View>
        <FlatList
          data={allDays}
          keyExtractor={d => d.id}
          renderItem={renderDayChip}
          horizontal
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}
          showsHorizontalScrollIndicator={false}
          ListHeaderComponent={
            <TouchableOpacity
              onPress={() => {
                const td = todayStr();
                const ex = allDays.find(d => d.id === td);
                if (ex) { setSelected(ex); return; }
                setSelected({ id: td, createdAt: Date.now(), vocab: [], oneWordSub: [], gkCapsule: [], questionSets: [] });
              }}
              style={[s.dayChip, {
                backgroundColor: selected?.id === todayStr() ? theme.primary : theme.bg2,
                borderColor:     selected?.id === todayStr() ? theme.primary : theme.border,
              }]}
            >
              <Text style={{
                fontSize: 11, fontWeight: "900",
                color: selected?.id === todayStr() ? "#fff" : theme.primary,
              }}>
                Today
              </Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <Text style={{ color: theme.sub, fontSize: 12, paddingVertical: 8 }}>No past content</Text>
          }
        />
      </View>

      {!selected ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 48 }}>📅</Text>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 12 }}>
            Tap "Today" to start
          </Text>
        </View>
      ) : (
        <>
          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <View style={[s.tabRow, { borderBottomColor: theme.border }]}>
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[s.tab, activeTab === tab.key && { borderBottomColor: theme.primary, borderBottomWidth: 2.5 }]}
              >
                <Text style={{ fontSize: 12, fontWeight: "800", color: activeTab === tab.key ? theme.primary : theme.sub }}>
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <View style={[s.badge, { backgroundColor: theme.primary + "20" }]}>
                    <Text style={{ fontSize: 10, color: theme.primary, fontWeight: "700" }}>{tab.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => setDelTarget(selected.id)}
              style={{ padding: 10 }}
              disabled={generating !== null}
            >
              <Text style={{ color: theme.red, fontSize: 18, opacity: generating ? 0.4 : 1 }}>🗑</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>

            {/* ── VOCAB ──────────────────────────────────────────────────────── */}
            {activeTab === "vocab" && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8, paddingVertical: 2 }}>
                    {VOCAB_THEMES.map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setVocabTheme(t)}
                        style={{
                          borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
                          backgroundColor: vocabTheme === t ? theme.primary : theme.bg2,
                          borderWidth: 1.5, borderColor: vocabTheme === t ? theme.primary : theme.border,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: vocabTheme === t ? "#fff" : theme.sub }}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {(selected.vocab?.length ?? 0) > 0 ? (
                  <>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={startVocabTest}
                        style={[s.practiceBtn, { backgroundColor: theme.primary + "15", borderColor: theme.primary + "40", flex: 1 }]}
                      >
                        <Text style={{ fontSize: 16 }}>📝</Text>
                        <View>
                          <Text style={{ color: theme.primary, fontWeight: "800", fontSize: 13 }}>Practice Vocab</Text>
                          <Text style={{ color: theme.sub, fontSize: 11 }}>{selected.vocab!.length} words · Spelling MCQ</Text>
                        </View>
                      </TouchableOpacity>
                      {isToday && (
                        <TouchableOpacity
                          onPress={() => genVocab(true)}
                          disabled={generating !== null}
                          style={[s.regenBtn, { borderColor: theme.border }]}
                        >
                          {generating === "vocab"
                            ? <ActivityIndicator size="small" color={theme.primary} />
                            : <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}>＋ More</Text>
                          }
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => deleteSectionConfirm("vocab")}
                        style={[s.regenBtn, { borderColor: theme.border }]}
                        disabled={generating !== null}
                      >
                        <Text style={{ fontSize: 16 }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                    {selected.vocab!.map((w, i) => (
                      <View key={i} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={s.cardRow}>
                          <Text style={[s.wordText, { color: theme.primary }]}>{w.word}</Text>
                          <View style={[s.posTag, { backgroundColor: theme.primary + "20" }]}>
                            <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "800" }}>{w.pos}</Text>
                          </View>
                          <TouchableOpacity onPress={() => speak(`${w.word}. ${w.meaning}. Example: ${w.example}`, `v${i}`)}>
                            <Text style={{ fontSize: 18 }}>{speaking === `v${i}` ? "🔊" : "🔈"}</Text>
                          </TouchableOpacity>
                        </View>
                        {(w as any).pronunciation ? (
                          <Text style={{ color: theme.sub, fontSize: 12, fontStyle: "italic", marginBottom: 2 }}>
                            /{(w as any).pronunciation}/
                          </Text>
                        ) : null}
                        <Text style={{ color: theme.text, fontSize: 14, lineHeight: 22, marginTop: 4 }}>{w.meaning}</Text>
                        <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                          <Text style={{ color: theme.green, fontSize: 12 }}>↑ {w.synonym}</Text>
                          <Text style={{ color: theme.red,   fontSize: 12 }}>↓ {w.antonym}</Text>
                        </View>
                        <Text style={{ color: theme.sub, fontSize: 12, fontStyle: "italic", marginTop: 6 }}>
                          "{w.example}"
                        </Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={[s.genCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={{ fontSize: 40, marginBottom: 10 }}>📚</Text>
                    <Text style={{ fontSize: 17, fontWeight: "900", color: theme.text, marginBottom: 6 }}>No Vocab Yet</Text>
                    <Text style={{ fontSize: 13, color: theme.sub, textAlign: "center", marginBottom: 18, lineHeight: 20 }}>
                      Generate AI vocabulary words{"\n"}for your selected theme
                    </Text>
                    <TouchableOpacity
                      onPress={() => genVocab(false)}
                      disabled={generating !== null}
                      style={[s.genBtn, { backgroundColor: theme.primary, opacity: generating ? 0.7 : 1 }]}
                    >
                      {generating === "vocab"
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Generate Vocab</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* ── OW-SUB ─────────────────────────────────────────────────────── */}
            {activeTab === "owsub" && (
              <>
                {(selected.oneWordSub?.length ?? 0) > 0 ? (
                  <>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={startOwTest}
                        style={[s.practiceBtn, { backgroundColor: theme.green + "15", borderColor: theme.green + "40", flex: 1 }]}
                      >
                        <Text style={{ fontSize: 16 }}>🎯</Text>
                        <View>
                          <Text style={{ color: theme.green, fontWeight: "800", fontSize: 13 }}>Practice OW-Sub</Text>
                          <Text style={{ color: theme.sub, fontSize: 11 }}>{selected.oneWordSub!.length} items</Text>
                        </View>
                      </TouchableOpacity>
                      {isToday && (
                        <TouchableOpacity
                          onPress={() => setOwCountSheet(true)}
                          disabled={generating !== null}
                          style={[s.regenBtn, { borderColor: theme.border }]}
                        >
                          {generating === "owsub"
                            ? <ActivityIndicator size="small" color={theme.primary} />
                            : <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}>＋ More</Text>
                          }
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => deleteSectionConfirm("owsub")}
                        style={[s.regenBtn, { borderColor: theme.border }]}
                        disabled={generating !== null}
                      >
                        <Text style={{ fontSize: 16 }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                    {selected.oneWordSub!.map((item, i) => (
                      <View key={i} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={s.cardRow}>
                          <Text style={{ flex: 1, color: theme.text, fontSize: 14, fontWeight: "600" }}>{item.phrase}</Text>
                          <TouchableOpacity onPress={() => speak(`${item.phrase}. Answer: ${item.word}`, `ow${i}`)}>
                            <Text style={{ fontSize: 18 }}>{speaking === `ow${i}` ? "🔊" : "🔈"}</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={{ color: theme.primary, fontWeight: "900", fontSize: 16, marginTop: 6 }}>
                          → {item.word}
                        </Text>
                        <Text style={{ color: theme.sub, fontSize: 12, marginTop: 4 }}>{item.explanation}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={[s.genCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={{ fontSize: 40, marginBottom: 10 }}>📝</Text>
                    <Text style={{ fontSize: 17, fontWeight: "900", color: theme.text, marginBottom: 6 }}>No OW-Sub Yet</Text>
                    <Text style={{ fontSize: 13, color: theme.sub, textAlign: "center", marginBottom: 12, lineHeight: 20 }}>
                      Generate one-word substitution phrases{"\n"}for SSC CGL English
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
                      {[10, 15, 20, 25].map(n => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => setOwCount(n)}
                          style={{
                            flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center",
                            backgroundColor: owCount === n ? theme.primary : theme.bg2,
                            borderWidth: 1.5, borderColor: owCount === n ? theme.primary : theme.border,
                          }}
                        >
                          <Text style={{ fontWeight: "900", fontSize: 15, color: owCount === n ? "#fff" : theme.text }}>{n}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      onPress={() => genOwSub(owCount, false)}
                      disabled={generating !== null}
                      style={[s.genBtn, { backgroundColor: theme.primary, opacity: generating ? 0.7 : 1 }]}
                    >
                      {generating === "owsub"
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Generate {owCount} OW-Sub</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* ── GK ─────────────────────────────────────────────────────────── */}
            {activeTab === "gk" && (
              <>
                {(selected.gkCapsule?.length ?? 0) > 0 ? (
                  <>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => { setGkRevIdx(0); setGkReveal(false); setGkRev(true); }}
                        style={[s.practiceBtn, { backgroundColor: theme.amber + "15", borderColor: theme.amber + "40", flex: 1 }]}
                      >
                        <Text style={{ fontSize: 16 }}>🧠</Text>
                        <View>
                          <Text style={{ color: theme.amber, fontWeight: "800", fontSize: 13 }}>Review GK</Text>
                          <Text style={{ color: theme.sub, fontSize: 11 }}>{selected.gkCapsule!.length} facts</Text>
                        </View>
                      </TouchableOpacity>
                      {isToday && (
                        <TouchableOpacity
                          onPress={() => setGkModal(true)}
                          disabled={generating !== null}
                          style={[s.regenBtn, { borderColor: theme.border }]}
                        >
                          {generating === "gk"
                            ? <ActivityIndicator size="small" color={theme.primary} />
                            : <Text style={{ color: theme.primary, fontWeight: "700", fontSize: 12 }}>＋ More</Text>
                          }
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => deleteSectionConfirm("gk")}
                        style={[s.regenBtn, { borderColor: theme.border }]}
                        disabled={generating !== null}
                      >
                        <Text style={{ fontSize: 16 }}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                    {selected.gkCapsule!.map((fact, i) => (
                      <View key={i} style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <View style={s.cardRow}>
                          <View style={[s.catTag, { backgroundColor: theme.primary + "20" }]}>
                            <Text style={{ color: theme.primary, fontSize: 10, fontWeight: "800" }}>
                              {fact.category.toUpperCase()}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => speak(`${fact.headline}. ${fact.detail}`, `gk${i}`)}>
                            <Text style={{ fontSize: 18 }}>{speaking === `gk${i}` ? "🔊" : "🔈"}</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 14, lineHeight: 22, marginTop: 6 }}>
                          {fact.headline}
                        </Text>
                        <Text style={{ color: theme.sub, fontSize: 13, lineHeight: 20, marginTop: 4 }}>
                          {fact.detail}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <View style={[s.genCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={{ fontSize: 40, marginBottom: 10 }}>📰</Text>
                    <Text style={{ fontSize: 17, fontWeight: "900", color: theme.text, marginBottom: 6 }}>No GK Yet</Text>
                    <Text style={{ fontSize: 13, color: theme.sub, textAlign: "center", marginBottom: 18, lineHeight: 20 }}>
                      Generate GK facts with filters:{"\n"}Today · Monthly · Yearly
                    </Text>
                    <TouchableOpacity
                      onPress={() => setGkModal(true)}
                      disabled={generating !== null}
                      style={[s.genBtn, { backgroundColor: theme.primary, opacity: generating ? 0.7 : 1 }]}
                    >
                      {generating === "gk"
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Generate GK</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </>
      )}

      {/* ── GK Filter Modal ─────────────────────────────────────────────────── */}
      <Modal visible={gkModal} transparent animationType="slide" onRequestClose={() => setGkModal(false)}>
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }}>
          <View style={[s.sheet, { backgroundColor: theme.bg }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <Text style={{ fontSize: 18, fontWeight: "900", color: theme.text, marginBottom: 16 }}>
              GK Filter
            </Text>

            <Text style={s.label}>PERIOD</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {(["today", "monthly", "yearly"] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setGkFilter(f)}
                  style={{
                    flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center",
                    backgroundColor: gkFilter === f ? theme.primary : theme.bg2,
                    borderWidth: 1.5, borderColor: gkFilter === f ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontWeight: "800", fontSize: 12, color: gkFilter === f ? "#fff" : theme.text }}>
                    {f === "today" ? "Today" : f === "monthly" ? "Monthly" : "Yearly"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {gkFilter === "monthly" && (
              <>
                <Text style={s.label}>MONTH</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {MONTHS.map((m, i) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setGkMonth(i)}
                        style={{
                          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
                          backgroundColor: gkMonth === i ? theme.primary : theme.bg2,
                          borderWidth: 1.5, borderColor: gkMonth === i ? theme.primary : theme.border,
                        }}
                      >
                        <Text style={{ fontWeight: "800", fontSize: 12, color: gkMonth === i ? "#fff" : theme.text }}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <Text style={s.label}>YEAR</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  {[CUR_YEAR - 1, CUR_YEAR].map(y => (
                    <TouchableOpacity
                      key={y}
                      onPress={() => setGkYear(y)}
                      style={{
                        flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center",
                        backgroundColor: gkYear === y ? theme.primary : theme.bg2,
                        borderWidth: 1.5, borderColor: gkYear === y ? theme.primary : theme.border,
                      }}
                    >
                      <Text style={{ fontWeight: "800", color: gkYear === y ? "#fff" : theme.text }}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {gkFilter === "yearly" && (
              <>
                <Text style={s.label}>YEAR</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  {[CUR_YEAR - 2, CUR_YEAR - 1, CUR_YEAR].map(y => (
                    <TouchableOpacity
                      key={y}
                      onPress={() => setGkYear(y)}
                      style={{
                        flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center",
                        backgroundColor: gkYear === y ? theme.primary : theme.bg2,
                        borderWidth: 1.5, borderColor: gkYear === y ? theme.primary : theme.border,
                      }}
                    >
                      <Text style={{ fontWeight: "800", color: gkYear === y ? "#fff" : theme.text }}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <Text style={s.label}>COUNT</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {[5, 10, 15, 20].map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setGkCount(n)}
                  style={{
                    flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center",
                    backgroundColor: gkCount === n ? theme.primary : theme.bg2,
                    borderWidth: 1.5, borderColor: gkCount === n ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontWeight: "800", color: gkCount === n ? "#fff" : theme.text }}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Append or Replace */}
            {(selected?.gkCapsule?.length ?? 0) > 0 && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  onPress={() => genGk(true)}
                  style={[s.genBtn, { backgroundColor: theme.bg2, borderWidth: 1.5, borderColor: theme.border, flex: 1 }]}
                >
                  <Text style={{ color: theme.primary, fontWeight: "800", fontSize: 14 }}>＋ Add to existing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => genGk(false)}
                  style={[s.genBtn, { backgroundColor: theme.primary, flex: 1 }]}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>↺ Replace all</Text>
                </TouchableOpacity>
              </View>
            )}
            {!(selected?.gkCapsule?.length) && (
              <TouchableOpacity
                onPress={() => genGk(false)}
                style={[s.genBtn, { backgroundColor: theme.primary }]}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Generate GK</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setGkModal(false)} style={{ alignItems: "center", marginTop: 14 }}>
              <Text style={{ color: theme.sub, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── OW-Sub Count Sheet ───────────────────────────────────────────────── */}
      <Modal visible={owCountSheet} transparent animationType="slide" onRequestClose={() => setOwCountSheet(false)}>
        <View style={{ flex: 1, backgroundColor: "#000000BB", justifyContent: "flex-end" }}>
          <View style={[s.sheet, { backgroundColor: theme.bg }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <Text style={{ fontSize: 18, fontWeight: "900", color: theme.text, marginBottom: 20 }}>
              Add how many more?
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
              {[10, 15, 20, 25].map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setOwCount(n)}
                  style={{
                    flex: 1, borderRadius: 12, paddingVertical: 16, alignItems: "center",
                    backgroundColor: owCount === n ? theme.primary : theme.bg2,
                    borderWidth: 1.5, borderColor: owCount === n ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "900", color: owCount === n ? "#fff" : theme.text }}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => genOwSub(owCount, true)}
              style={[s.genBtn, { backgroundColor: theme.primary }]}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Add {owCount} More OW-Sub</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOwCountSheet(false)} style={{ alignItems: "center", marginTop: 14 }}>
              <Text style={{ color: theme.sub, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Vocab MCQ Test Modal ─────────────────────────────────────────────── */}
      <Modal visible={vocabTest} transparent animationType="slide" onRequestClose={() => setVocabTest(false)}>
        <View style={{ flex: 1, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
          <View style={[s.testSheet, { backgroundColor: theme.bg }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <View style={s.testHeader}>
              <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>
                Spelling Test  {vIdx + 1}/{selected?.vocab?.length ?? 0}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Text style={{ color: theme.green, fontWeight: "700" }}>✓ {vScore.correct}</Text>
                <Text style={{ color: theme.red,   fontWeight: "700" }}>✗ {vScore.wrong}</Text>
                <TouchableOpacity onPress={() => setVocabTest(false)}>
                  <Text style={{ color: theme.sub, fontSize: 20 }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {selected?.vocab?.[vIdx] && (() => {
              const w = selected.vocab![vIdx];
              return (
                <>
                  {/* Clue: meaning + POS */}
                  <Text style={{ color: theme.sub, fontSize: 11, fontWeight: "800", marginBottom: 4 }}>MEANING</Text>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600", lineHeight: 24, marginBottom: 2 }}>
                    {w.meaning}
                  </Text>
                  <Text style={{ color: theme.sub, fontSize: 12, marginBottom: 4 }}>
                    {w.pos}
                    {(w as any).pronunciation ? `  ·  /${(w as any).pronunciation}/` : ""}
                  </Text>
                  <Text style={{ color: theme.sub, fontSize: 11, fontWeight: "800", marginBottom: 12, marginTop: 6 }}>
                    CHOOSE THE CORRECT SPELLING
                  </Text>

                  {/* MCQ Options */}
                  {vOptions.map((opt, oi) => {
                    let bg     = theme.bg2;
                    let border = theme.border;
                    let color  = theme.text;
                    if (vPick !== null) {
                      if (oi === vCorrectIdx)                  { bg = theme.greenLt; border = theme.green; color = theme.green; }
                      if (oi === vPick && oi !== vCorrectIdx)  { bg = theme.redLt;   border = theme.red;   color = theme.red; }
                    }
                    return (
                      <TouchableOpacity
                        key={oi}
                        onPress={() => pickVocab(oi)}
                        style={[s.testOpt, { backgroundColor: bg, borderColor: border }]}
                      >
                        <Text style={{ color, fontSize: 15, fontWeight: "700" }}>{opt}</Text>
                        {vPick !== null && oi === vCorrectIdx && (
                          <Text style={{ color: theme.green, fontWeight: "900" }}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {vPick !== null && (
                    <TouchableOpacity onPress={nextVocab} style={[s.nextBtn, { backgroundColor: theme.primary }]}>
                      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                        {vIdx + 1 >= (selected?.vocab?.length ?? 0) ? "Finish ✓" : "Next →"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── OW-Sub Test Modal ───────────────────────────────────────────────── */}
      <Modal visible={owTest} transparent animationType="slide" onRequestClose={() => setOwTest(false)}>
        <View style={{ flex: 1, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
          <View style={[s.testSheet, { backgroundColor: theme.bg }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <View style={s.testHeader}>
              <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>
                OW-Sub Test  {owIdx + 1}/{selected?.oneWordSub?.length ?? 0}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Text style={{ color: theme.green, fontWeight: "700" }}>✓ {owScore.correct}</Text>
                <Text style={{ color: theme.red,   fontWeight: "700" }}>✗ {owScore.wrong}</Text>
                <TouchableOpacity onPress={() => setOwTest(false)}>
                  <Text style={{ color: theme.sub, fontSize: 20 }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {selected?.oneWordSub?.[owIdx] && (() => {
              const item    = selected.oneWordSub![owIdx];
              const correct = item.options.indexOf(item.word);
              return (
                <>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600", lineHeight: 26, marginBottom: 16 }}>
                    {item.phrase}
                  </Text>
                  {item.options.map((opt, oi) => {
                    let bg = theme.bg2, border = theme.border;
                    if (owPick !== null) {
                      if (oi === correct)                   { bg = theme.greenLt; border = theme.green; }
                      if (oi === owPick && oi !== correct)  { bg = theme.redLt;   border = theme.red; }
                    }
                    return (
                      <TouchableOpacity
                        key={oi}
                        onPress={() => pickOw(oi)}
                        style={[s.testOpt, { backgroundColor: bg, borderColor: border }]}
                      >
                        <Text style={{ color: theme.text, fontSize: 14 }}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {owPick !== null && (
                    <TouchableOpacity onPress={nextOw} style={[s.nextBtn, { backgroundColor: theme.primary }]}>
                      <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                        {owIdx + 1 >= (selected?.oneWordSub?.length ?? 0) ? "Finish ✓" : "Next →"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── GK Review Modal ─────────────────────────────────────────────────── */}
      <Modal visible={gkRev} transparent animationType="slide" onRequestClose={() => setGkRev(false)}>
        <View style={{ flex: 1, backgroundColor: "#000000CC", justifyContent: "flex-end" }}>
          <View style={[s.testSheet, { backgroundColor: theme.bg }]}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <View style={s.testHeader}>
              <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>
                GK Review  {gkRevIdx + 1}/{selected?.gkCapsule?.length ?? 0}
              </Text>
              <TouchableOpacity onPress={() => setGkRev(false)}>
                <Text style={{ color: theme.sub, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {selected?.gkCapsule?.[gkRevIdx] && (() => {
              const fact = selected.gkCapsule![gkRevIdx];
              return (
                <>
                  <View style={[s.catTag, { backgroundColor: theme.amber + "20", alignSelf: "flex-start", marginBottom: 12 }]}>
                    <Text style={{ color: theme.amber, fontSize: 11, fontWeight: "800" }}>
                      {fact.category.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: "900", lineHeight: 26, marginBottom: 16 }}>
                    {fact.headline}
                  </Text>
                  {gkReveal ? (
                    <View style={[s.revealBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <Text style={{ color: theme.sub, fontSize: 14, lineHeight: 22 }}>{fact.detail}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setGkReveal(true)}
                      style={[s.revealBtn, { backgroundColor: theme.amber + "15", borderColor: theme.amber + "50" }]}
                    >
                      <Text style={{ color: theme.amber, fontWeight: "800", fontSize: 14 }}>Tap to Reveal</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      const max = selected.gkCapsule?.length ?? 0;
                      if (gkRevIdx + 1 >= max) { setGkRev(false); return; }
                      setGkRevIdx(i => i + 1); setGkReveal(false);
                    }}
                    style={[s.nextBtn, { backgroundColor: theme.primary, marginTop: 16 }]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>
                      {gkRevIdx + 1 >= (selected?.gkCapsule?.length ?? 0) ? "Finish ✓" : "Next →"}
                    </Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Delete Day ConfirmSheet ──────────────────────────────────────────── */}
      <ConfirmSheet
        visible={delTarget !== null}
        icon="🗑️"
        title="Delete content?"
        message={`Remove daily content for ${delTarget}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        danger
        onConfirm={async () => {
          const id = delTarget;
          setDelTarget(null);
          setSelected(null);
          if (user && id) {
            try { await deleteDailyContent(user.uid, id); } catch (e: any) {
              Alert.alert("Delete failed", e.message);
            }
            const days = await load();
            if (days.length) setSelected(days[0]);
          }
        }}
        onCancel={() => setDelTarget(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header:      { borderBottomWidth: 1 },
  dayChip:     { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5 },
  tabRow:      { flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 8 },
  tab:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10 },
  badge:       { borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 },
  label:       { fontSize: 11, fontWeight: "800", color: "#888", letterSpacing: 0.5, marginBottom: 8 },

  genCard:     { borderRadius: 20, borderWidth: 1.5, padding: 28, alignItems: "center", marginTop: 16 },
  genBtn:      { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "100%" },

  practiceBtn: { borderRadius: 14, borderWidth: 1.5, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  regenBtn:    { borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" },

  card:        { borderRadius: 16, borderWidth: 1, padding: 14 },
  cardRow:     { flexDirection: "row", alignItems: "center", gap: 8 },
  wordText:    { flex: 1, fontSize: 18, fontWeight: "900" },
  posTag:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catTag:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },

  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 48 },
  handle:      { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 20 },

  testSheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 48, maxHeight: "90%" },
  testHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  testOpt:     { borderRadius: 12, borderWidth: 1.5, padding: 14, marginBottom: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nextBtn:     { marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  revealBox:   { borderRadius: 14, borderWidth: 1, padding: 14 },
  revealBtn:   { borderRadius: 14, borderWidth: 1.5, padding: 16, alignItems: "center" },
});
