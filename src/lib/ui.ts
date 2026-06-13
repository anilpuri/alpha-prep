/**
 * Legacy compatibility shim — maps old C.xxx references to LIGHT theme values.
 * New code should use useTheme() instead.
 */
import { LIGHT } from "./theme";

export const C = {
  bg:        LIGHT.bg,
  card:      LIGHT.card,
  primary:   LIGHT.primary,
  primaryLt: LIGHT.primaryLt,
  text:      LIGHT.text,
  sub:       LIGHT.sub,
  border:    LIGHT.border,
  green:     LIGHT.green,
  greenLt:   LIGHT.greenLt,
  red:       LIGHT.red,
  redLt:     LIGHT.redLt,
  amber:     LIGHT.amber,
  amberLt:   LIGHT.amberLt,
  purple:    LIGHT.purple,
};

export function subjectColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("english"))  return LIGHT.english;
  if (n.includes("ga") || n.includes("general")) return LIGHT.ga;
  if (n.includes("math"))     return LIGHT.math;
  if (n.includes("reason"))   return LIGHT.reasoning;
  if (n.includes("computer")) return LIGHT.cs;
  return LIGHT.primary;
}

export function pct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}
