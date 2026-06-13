/**
 * Alpha — design system.
 * 11 themes in 3 groups: 1 Default, 5 Light, 5 Dark.
 *
 * Eye-relaxing principles:
 *   Light — accent saturation ≤ 70 %, no pure spectral hues
 *   Dark  — accent saturation ≤ 55 %, brightness ≤ 62 %,
 *            background tinted (not grey), no neon anywhere
 */

// ── Default (unchanged — original user theme) ─────────────────────────────────

export const INDIGO = {
  bg:        "#F0F2FF",  bg2:       "#E8EAF8",
  card:      "#FFFFFF",  border:    "#E2E4F3",  shadow:    "#6C63FF18",
  primary:   "#6C63FF",  primaryLt: "#EAE8FF",
  text:      "#1A1A2E",  sub:       "#6B6F8E",  muted:     "#A0A4BE",
  green:     "#22C55E",  greenLt:   "#DCFCE7",
  red:       "#EF4444",  redLt:     "#FEE2E2",
  amber:     "#F59E0B",  amberLt:   "#FEF3C7",
  blue:      "#3B82F6",  blueLt:    "#DBEAFE",
  purple:    "#A855F7",  purpleLt:  "#F3E8FF",
  teal:      "#14B8A6",  tealLt:    "#CCFBF1",
  english:   "#3B82F6",  ga:        "#F59E0B",
  math:      "#22C55E",  reasoning: "#A855F7",  cs: "#14B8A6",
};

// ── Light themes ──────────────────────────────────────────────────────────────
// Backgrounds: soft tints, never pure white for card group.
// Accents: saturation 55–70 %, no pure spectral primaries.

export const CLASSIC = {
  // Warm off-white — easier than pure #FFFFFF
  bg:        "#F8F9FA",  bg2:       "#F0F2F5",
  card:      "#FFFFFF",  border:    "#DDE1E8",  shadow:    "#00000012",
  primary:   "#2258CC",  primaryLt: "#E2EAFA",
  text:      "#181C28",  sub:       "#606880",  muted:     "#9AA0B0",
  green:     "#1E9048",  greenLt:   "#E4F5EC",
  red:       "#C02828",  redLt:     "#F5E2E2",
  amber:     "#B87010",  amberLt:   "#FAF0DC",
  blue:      "#2258CC",  blueLt:    "#E2EAFA",
  purple:    "#6030B8",  purpleLt:  "#EDE0FA",
  teal:      "#0E88A8",  tealLt:    "#D8F2F8",
  english:   "#2258CC",  ga:        "#B87010",
  math:      "#1E9048",  reasoning: "#6030B8",  cs: "#0E88A8",
};

export const OCEAN = {
  // Sky-washed, calming
  bg:        "#EFF8FF",  bg2:       "#DCEEFA",
  card:      "#FFFFFF",  border:    "#B8DCEE",  shadow:    "#027AB015",
  primary:   "#027AB0",  primaryLt: "#DCEEFA",
  text:      "#0A3C58",  sub:       "#3A6880",  muted:     "#80AABF",
  green:     "#0E9068",  greenLt:   "#DCEEE8",
  red:       "#B82828",  redLt:     "#F5E2E2",
  amber:     "#A86C10",  amberLt:   "#FAF0DC",
  blue:      "#027AB0",  blueLt:    "#DCEEFA",
  purple:    "#5030A8",  purpleLt:  "#EAE0F8",
  teal:      "#0880A0",  tealLt:    "#D8EEF5",
  english:   "#027AB0",  ga:        "#A86C10",
  math:      "#0E9068",  reasoning: "#5030A8",  cs: "#0880A0",
};

export const FOREST = {
  // Deep forest greens, earthy
  bg:        "#F2FCF5",  bg2:       "#DFFAEB",
  card:      "#FFFFFF",  border:    "#B8E8CC",  shadow:    "#17884815",
  primary:   "#178848",  primaryLt: "#DDFAEC",
  text:      "#0E3820",  sub:       "#336840",  muted:     "#80AE8A",
  green:     "#178848",  greenLt:   "#DDFAEC",
  red:       "#B82828",  redLt:     "#F5E2E2",
  amber:     "#9A7008",  amberLt:   "#FAF0DC",
  blue:      "#1E58C0",  blueLt:    "#E0EAFA",
  purple:    "#5828A8",  purpleLt:  "#EAE0F8",
  teal:      "#0C9080",  tealLt:    "#D8F2EC",
  english:   "#178848",  ga:        "#9A7008",
  math:      "#148040",  reasoning: "#5828A8",  cs: "#0C9080",
};

export const ROSE = {
  // Dusty rose — already gentle, minor polish
  bg:        "#FFF4F7",  bg2:       "#FFE6EE",
  card:      "#FFFFFF",  border:    "#F0C8D5",  shadow:    "#B85080",
  primary:   "#B85080",  primaryLt: "#FFE8F2",
  text:      "#2A1020",  sub:       "#805068",  muted:     "#B888A0",
  green:     "#288848",  greenLt:   "#E8F8EE",
  red:       "#B02840",  redLt:     "#F5E2E8",
  amber:     "#A87018",  amberLt:   "#F8EED8",
  blue:      "#284EB0",  blueLt:    "#E0E8F8",
  purple:    "#7038B0",  purpleLt:  "#EDE0F8",
  teal:      "#108080",  tealLt:    "#D8EEEE",
  english:   "#284EB0",  ga:        "#A87018",
  math:      "#288848",  reasoning: "#7038B0",  cs: "#108080",
};

export const SAND = {
  // Warm parchment — already eye-friendly, minor polish
  bg:        "#FAF5EC",  bg2:       "#F2E8D5",
  card:      "#FFFDF8",  border:    "#E0D0B5",  shadow:    "#90601815",
  primary:   "#906038",  primaryLt: "#F5E8D5",
  text:      "#281C10",  sub:       "#705838",  muted:     "#B09878",
  green:     "#387030",  greenLt:   "#E8F5E0",
  red:       "#B03020",  redLt:     "#F5E5E0",
  amber:     "#985E08",  amberLt:   "#F8EED8",
  blue:      "#244890",  blueLt:    "#E0E5F5",
  purple:    "#603898",  purpleLt:  "#EDE0F8",
  teal:      "#187068",  tealLt:    "#D8EEE8",
  english:   "#244890",  ga:        "#985E08",
  math:      "#387030",  reasoning: "#603898",  cs: "#187068",
};

// ── Dark themes ───────────────────────────────────────────────────────────────
// ALL accent colors: saturation ≤ 55 %, brightness 42–60 %.
// Background tinted toward the theme colour, never neutral grey.
// No pure greens, no electric blues, no neon teals.

export const MIDNIGHT = {
  // Deep navy — GitHub-dark inspired
  bg:        "#0D1117",  bg2:       "#161B24",
  card:      "#1C2435",  border:    "#2C3650",  shadow:    "#00000075",
  primary:   "#7082D8",  primaryLt: "#182040",
  text:      "#D8E4F0",  sub:       "#7A8898",  muted:     "#404C5C",
  // Desaturated accent colours — no neon
  green:     "#3C9848",  greenLt:   "#0C2015",
  red:       "#C04848",  redLt:     "#280E0E",
  amber:     "#9E7525",  amberLt:   "#201605",
  blue:      "#4A82C8",  blueLt:    "#0C1E38",
  purple:    "#8868C0",  purpleLt:  "#180E35",
  teal:      "#2C9CA8",  tealLt:    "#0A2225",
  english:   "#4A82C8",  ga:        "#9E7525",
  math:      "#3C9848",  reasoning: "#8868C0",  cs: "#2C9CA8",
};

export const AMOLED = {
  // Pure black — every colour slightly brighter for readability, still muted
  bg:        "#000000",  bg2:       "#0A0A0A",
  card:      "#111111",  border:    "#202020",  shadow:    "#00000095",
  primary:   "#8880D5",  primaryLt: "#120D2A",
  text:      "#E0E0E0",  sub:       "#787878",  muted:     "#383838",
  green:     "#3C9850",  greenLt:   "#081505",
  red:       "#C03838",  redLt:     "#1C0505",
  amber:     "#886018",  amberLt:   "#140C02",
  blue:      "#3870B8",  blueLt:    "#061020",
  purple:    "#8870C0",  purpleLt:  "#100828",
  teal:      "#289090",  tealLt:    "#041818",
  english:   "#3870B8",  ga:        "#886018",
  math:      "#3C9850",  reasoning: "#8870C0",  cs: "#289090",
};

export const SLATE = {
  // Cool blue-grey — like a moonlit sky
  bg:        "#181E2C",  bg2:       "#202638",
  card:      "#272E42",  border:    "#343E58",  shadow:    "#00000060",
  primary:   "#6088C0",  primaryLt: "#141E30",
  text:      "#C8D4E5",  sub:       "#728098",  muted:     "#404E65",
  green:     "#3C8858",  greenLt:   "#0A1C14",
  red:       "#A84040",  redLt:     "#200C0C",
  amber:     "#907020",  amberLt:   "#1C1505",
  blue:      "#6088C0",  blueLt:    "#101E30",
  purple:    "#7870A8",  purpleLt:  "#141028",
  teal:      "#2E8E90",  tealLt:    "#081E20",
  english:   "#6088C0",  ga:        "#907020",
  math:      "#3C8858",  reasoning: "#7870A8",  cs: "#2E8E90",
};

export const EMBER = {
  // Warm dark amber — like a dying campfire
  bg:        "#181108",  bg2:       "#201808",
  card:      "#2A2010",  border:    "#3A2E18",  shadow:    "#00000070",
  primary:   "#C07838",  primaryLt: "#281E08",
  text:      "#EEE0C8",  sub:       "#907860",  muted:     "#504030",
  green:     "#608840",  greenLt:   "#101A08",
  red:       "#A83828",  redLt:     "#250C08",
  amber:     "#B87030",  amberLt:   "#251808",
  blue:      "#486080",  blueLt:    "#0C1520",
  purple:    "#705080",  purpleLt:  "#180E20",
  teal:      "#387068",  tealLt:    "#0A1818",
  english:   "#486080",  ga:        "#B87030",
  math:      "#608840",  reasoning: "#705080",  cs: "#387068",
};

export const SAKURA = {
  // Dark rose — cherry blossom night
  bg:        "#180E16",  bg2:       "#221420",
  card:      "#2C1828",  border:    "#3C2535",  shadow:    "#00000070",
  primary:   "#A86080",  primaryLt: "#280E20",
  text:      "#EDD8E5",  sub:       "#906878",  muted:     "#503040",
  green:     "#589055",  greenLt:   "#101A10",
  red:       "#A03048",  redLt:     "#250A12",
  amber:     "#A07028",  amberLt:   "#221408",
  blue:      "#5060A0",  blueLt:    "#0E1228",
  purple:    "#8055A0",  purpleLt:  "#180A28",
  teal:      "#3E8080",  tealLt:    "#0C1C1C",
  english:   "#5060A0",  ga:        "#A07028",
  math:      "#589055",  reasoning: "#8055A0",  cs: "#3E8080",
};

// Backward-compat aliases
export const LIGHT = INDIGO;
export const DARK  = MIDNIGHT;

// ── Type exports ──────────────────────────────────────────────────────────────

export type Theme = typeof INDIGO;
export type ThemeName =
  | "indigo"
  | "classic" | "ocean" | "forest" | "rose" | "sand"
  | "midnight" | "amoled" | "slate" | "ember" | "sakura";

export type ThemeGroup = "default" | "light" | "dark";

export const THEMES: Record<ThemeName, Theme> = {
  indigo:   INDIGO,
  classic:  CLASSIC,  ocean:  OCEAN,  forest: FOREST,  rose: ROSE,  sand: SAND,
  midnight: MIDNIGHT, amoled: AMOLED, slate:  SLATE,   ember: EMBER, sakura: SAKURA,
};

export const THEME_META: Record<ThemeName, { label: string; swatch: string; isDark: boolean; group: ThemeGroup }> = {
  indigo:   { label: "Indigo",   swatch: "#6C63FF", isDark: false, group: "default" },
  classic:  { label: "Classic",  swatch: "#2258CC", isDark: false, group: "light"   },
  ocean:    { label: "Ocean",    swatch: "#027AB0", isDark: false, group: "light"   },
  forest:   { label: "Forest",   swatch: "#178848", isDark: false, group: "light"   },
  rose:     { label: "Rose",     swatch: "#B85080", isDark: false, group: "light"   },
  sand:     { label: "Sand",     swatch: "#906038", isDark: false, group: "light"   },
  midnight: { label: "Midnight", swatch: "#7082D8", isDark: true,  group: "dark"    },
  amoled:   { label: "AMOLED",   swatch: "#8880D5", isDark: true,  group: "dark"    },
  slate:    { label: "Slate",    swatch: "#6088C0", isDark: true,  group: "dark"    },
  ember:    { label: "Ember",    swatch: "#C07838", isDark: true,  group: "dark"    },
  sakura:   { label: "Sakura",   swatch: "#A86080", isDark: true,  group: "dark"    },
};

export const DEFAULT_THEME: ThemeName = "amoled";

// ── Helper functions ──────────────────────────────────────────────────────────

export function subjectAccent(name: string, theme: Theme): string {
  const n = name.toLowerCase().replace(/_/g, "");
  if (n.includes("english"))                     return theme.english;
  if (n.includes("ga") || n.includes("general")) return theme.ga;
  if (n.includes("math"))                        return theme.math;
  if (n.includes("reason"))                      return theme.reasoning;
  if (n.includes("computer"))                    return theme.cs;
  return theme.primary;
}

export function subjectEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("english"))                     return "🔤";
  if (n.includes("ga") || n.includes("general")) return "🌍";
  if (n.includes("math"))                        return "🔢";
  if (n.includes("reason"))                      return "🧩";
  if (n.includes("computer"))                    return "💻";
  return "📖";
}

export function accuracyColor(pct: number, theme: Theme): string {
  if (pct >= 75) return theme.green;
  if (pct >= 50) return theme.amber;
  return theme.red;
}

export function pctStr(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}
