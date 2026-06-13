const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Available Groq models — free tier TPM limits
export const GROQ_MODELS = {
  "openai/gpt-oss-120b": {
    label: "GPT-OSS 120B",
    desc:  "Most powerful — best quality",
    tpm:   6000,
  },
  "llama-3.3-70b-versatile": {
    label: "Llama 3.3 70B",
    desc:  "High quality, reliable",
    tpm:   6000,
  },
  "openai/gpt-oss-20b": {
    label: "GPT-OSS 20B",
    desc:  "Fast, higher rate limit",
    tpm:   20000,
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    label: "Llama 4 Scout 17B",
    desc:  "Fastest, best for bulk",
    tpm:   30000,
  },
} as const;

export type GroqModelId = keyof typeof GROQ_MODELS;

// Default model for concept explanations (quality matters)
export const MODEL_CONCEPT: GroqModelId = "llama-3.3-70b-versatile";
// Default model for bulk daily content (rate limit matters)
export const MODEL_DAILY: GroqModelId   = "meta-llama/llama-4-scout-17b-16e-instruct";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function groqChat(
  messages: Msg[],
  maxTokens = 1024,
  model: GroqModelId = MODEL_CONCEPT,
): Promise<string> {
  const key = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!key) throw new Error("GROQ API key not configured");

  const res = await fetch(GROQ_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body:    JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 }),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) {
      throw new Error("Rate limit hit — try switching to a faster model in daily settings, or wait a minute.");
    }
    throw new Error(`Groq error ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}

// Parse JSON from Groq response — handles code fences, trailing commas, truncation
export function parseGroqJson<T>(text: string): T {
  const clean = text
    .replace(/```(?:json|javascript|js|text)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  const arrIdx = clean.indexOf("[");
  const objIdx = clean.indexOf("{");

  if (arrIdx === -1 && objIdx === -1)
    throw new Error(`No JSON in response. Got: ${text.slice(0, 200)}`);

  const start = arrIdx === -1 ? objIdx : objIdx === -1 ? arrIdx : Math.min(arrIdx, objIdx);
  const isArr = clean[start] === "[";
  const end   = clean.lastIndexOf(isArr ? "]" : "}");

  if (end <= start)
    throw new Error(`Truncated JSON — model likely cut off. Got: ${text.slice(0, 200)}`);

  const tryParse = (s: string): T | null => {
    try { return JSON.parse(s) as T; } catch { return null; }
  };

  // Fix trailing commas ,} and ,]
  let jsonStr = clean.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");

  const r = tryParse(jsonStr);
  if (r !== null) return r;

  // Recovery for truncated arrays: close at last complete object
  if (isArr) {
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace > 0) {
      const recovered = tryParse(jsonStr.slice(0, lastBrace + 1) + "]");
      if (recovered !== null) return recovered;
    }
  }

  throw new Error(`JSON parse failed. Extracted:\n${jsonStr.slice(0, 300)}`);
}
