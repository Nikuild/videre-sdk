import type { VerdictKind } from "@/lib/verdict";
import type { Dict } from "@/i18n/fmt";

const STYLE: Record<VerdictKind, string> = {
  hard_pass: "bg-[#b3261e] text-white border-[#ff8080]",
  watch: "bg-[#f2a516] text-[#1a1204] border-[#ffd27a]",
  watch_incomplete: "bg-transparent text-[#fbc02d] border-[#fbc02d] border-dashed",
  no_hard_flags: "bg-panel-2 text-gold-soft border-gold",
};
export const VERDICT_ORDER: VerdictKind[] = ["hard_pass", "watch", "watch_incomplete", "no_hard_flags"];

export default function VerdictBadge({ kind, t, testId = "verdict-badge" }: { kind: VerdictKind; t: Dict["report"]; testId?: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId} data-verdict={kind}>
      <span className="text-xs font-semibold uppercase tracking-widest text-muted">{t.draft}</span>
      <span className={`inline-block w-fit rounded-xl border-2 px-4 py-2 text-xl font-black tracking-wide sm:text-2xl ${STYLE[kind]}`}>
        {t.verdicts[kind]}
      </span>
      <span className="text-sm text-muted">{t.verdictHelp[kind]}</span>
    </div>
  );
}

/** Short legend of all four badges so a red AVOID can never be read as "passed". */
export function VerdictLegend({ t, active }: { t: Dict["report"]; active?: VerdictKind }) {
  return (
    <details className="group rounded-lg border border-line/80 bg-ink/60 px-3 py-2 text-xs" data-testid="verdict-legend" open>
      <summary className="cursor-pointer font-semibold text-muted hover:text-gold-soft">{t.legendTitle2}</summary>
      <ul className="mt-2 space-y-1.5">
        {VERDICT_ORDER.map((k) => (
          <li key={k} className={`flex flex-wrap items-center gap-2 ${active && active !== k ? "opacity-75" : ""}`}>
            <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-black ${STYLE[k]}`}>{t.verdicts[k]}</span>
            <span className="text-muted">{t.verdictLegend[k]}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
