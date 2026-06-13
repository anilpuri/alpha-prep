import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GroqModelId } from "./groq";

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
