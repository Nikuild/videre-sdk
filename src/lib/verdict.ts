// Maps the engine's draft_verdict onto exactly four display badges. The word "SAFE" is never produced.
// Display labels (i18n): hard_pass -> "AVOID" (the engine's "HARD PASS" = "pass on it", which newcomers misread as
// "passed"), no_hard_flags -> "NO MAJOR FLAGS". Both old and new strings are recognised (history rows, simulate labels).
export type VerdictKind = "hard_pass" | "watch" | "watch_incomplete" | "no_hard_flags";

export function verdictKind(raw: string | null | undefined, incomplete?: boolean): { kind: VerdictKind; recognised: boolean } {
  const s = (raw || "").trim().toUpperCase();
  if (s.startsWith("HARD PASS") || s.startsWith("AVOID")) return { kind: "hard_pass", recognised: true };
  if (s.startsWith("WATCH (INCOMPLETE") || (s.startsWith("WATCH") && incomplete)) return { kind: "watch_incomplete", recognised: true };
  if (s.startsWith("WATCH")) return { kind: "watch", recognised: true };
  if (s.startsWith("NO HARD FLAGS") || s.startsWith("NO MAJOR FLAGS")) return { kind: incomplete ? "watch_incomplete" : "no_hard_flags", recognised: true };
  // Unknown / missing verdict string: never upgrade it. Treat as incomplete.
  return { kind: "watch_incomplete", recognised: false };
}
