import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GroqModelId } from "./groq";
import type { StudySource, SubjectTarget } from "./types";

const KEY = "@alpha/groq_model";
let _model: GroqModelId = "meta-llama/llama-4-scout-17b-16e-instruct";
let _ready = false;

export async function loadSettings() {
  if (_ready) return;
  const v = await AsyncStorage.getItem(KEY);
  if (v) _model = v as GroqModelId;
  _ready = true;
}

export function getActiveModel(): GroqModelId {
  return _model;
}

export async function setActiveModel(model: GroqModelId) {
  _model = model;
  _ready = true;
  await AsyncStorage.setItem(KEY, model);
}

// ── Study targets & sources ───────────────────────────────────────────────────

const TARGETS_KEY = "@alpha/study_targets";
const SOURCES_KEY = "@alpha/study_sources";

export const DEFAULT_SOURCES: StudySource[] = [
  { id: "book",     label: "Book",     enabled: true },
  { id: "notes",    label: "Notes",    enabled: true },
  { id: "coaching", label: "Coaching", enabled: true },
  { id: "pdf",      label: "PDF",      enabled: true },
  { id: "youtube",  label: "YouTube",  enabled: true },
  { id: "internet", label: "Internet", enabled: true },
];

export const DEFAULT_TARGETS: SubjectTarget[] = [
  { subject: "Maths",              dailyMinutes: 90, dailyMcqs: 30 },
  { subject: "Reasoning",          dailyMinutes: 45, dailyMcqs: 25 },
  { subject: "English",            dailyMinutes: 45, dailyMcqs: 20 },
  { subject: "General Knowledge",  dailyMinutes: 30, dailyMcqs: 15 },
  { subject: "Computer Knowledge", dailyMinutes: 20, dailyMcqs: 10 },
];

let _targets: SubjectTarget[] = DEFAULT_TARGETS.map(t => ({ ...t }));
let _sources: StudySource[]   = DEFAULT_SOURCES.map(s => ({ ...s }));

export async function loadStudySettings() {
  const [tv, sv] = await Promise.all([
    AsyncStorage.getItem(TARGETS_KEY),
    AsyncStorage.getItem(SOURCES_KEY),
  ]);
  if (tv) _targets = JSON.parse(tv);
  if (sv) _sources = JSON.parse(sv);
}

export function getStudyTargets(): SubjectTarget[] { return _targets; }
export function getStudySources(): StudySource[]   { return _sources; }

export async function saveStudyTargets(t: SubjectTarget[]) {
  _targets = t;
  await AsyncStorage.setItem(TARGETS_KEY, JSON.stringify(t));
}

export async function saveStudySources(s: StudySource[]) {
  _sources = s;
  await AsyncStorage.setItem(SOURCES_KEY, JSON.stringify(s));
}
