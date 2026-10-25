// One-click copy with a fallback for non-secure contexts (plain http on a LAN IP has no navigator.clipboard).
export interface ClipboardDeps {
  clipboard?: { writeText(s: string): Promise<void> } | null;
  /** legacy fallback: returns true when the text was copied */
  legacyCopy?: (s: string) => boolean;
}

export async function copyText(text: string, deps: ClipboardDeps): Promise<boolean> {
  if (!text) return false;
  if (deps.clipboard?.writeText) {
    try {
      await deps.clipboard.writeText(text);
      return true;
    } catch {
      /* permission denied / insecure context -> try the legacy path */
    }
  }
  try {
    return deps.legacyCopy ? deps.legacyCopy(text) : false;
  } catch {
    return false;
  }
}

/** Browser legacy fallback via a hidden textarea + execCommand("copy"). */
export function legacyDomCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand("copy");
  } finally {
    ta.remove();
  }
}
