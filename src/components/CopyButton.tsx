"use client";
import { useEffect, useRef, useState } from "react";
import { copyText, legacyDomCopy } from "@/lib/copy";
import { fmt, type Dict } from "@/i18n/fmt";

type T = Pick<Dict["ui"], "copy" | "copyAddress" | "copied" | "copiedLive" | "copyFailed">;

/** One-click copy of a full address. Visible "Copied" state + an aria-live announcement for screen readers. */
export default function CopyButton({ text, t, className = "", testId = "copy-address" }: { text: string; t: T; className?: string; testId?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function onClick() {
    const ok = await copyText(text, { clipboard: typeof navigator !== "undefined" ? navigator.clipboard : null, legacyCopy: legacyDomCopy });
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        onClick={onClick}
        aria-label={fmt(t.copyAddress, { addr: text })}
        data-testid={testId}
        data-state={state}
        className={`inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold motion-safe:transition-colors ${
          state === "copied" ? "border-sev-info text-sev-info" : "border-line text-gold-soft hover:border-gold hover:bg-gold/10 hover:text-gold"
        } ${className}`}
      >
        <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
          {state === "copied" ? <path d="M3 8.5l3 3 7-7" /> : <><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 10.5V4a1 1 0 0 1 1-1h6.5" /></>}
        </svg>
        <span>{state === "copied" ? t.copied : t.copy}</span>
      </button>
      <span className="sr-only" aria-live="polite" role="status">{state === "copied" ? t.copiedLive : state === "failed" ? t.copyFailed : ""}</span>
    </span>
  );
}
