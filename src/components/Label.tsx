import type { Epistemic } from "@/lib/envelope";

const STYLE: Record<Epistemic, string> = {
  FACT: "border-sev-info/60 text-sev-info",
  INFERENCE: "border-gold/60 text-gold-soft",
  UNKNOWN: "border-sev-high/70 text-sev-high border-dashed",
};

export default function Label({ label }: { label: Epistemic }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${STYLE[label]}`} data-label={label}>
      {label}
    </span>
  );
}
