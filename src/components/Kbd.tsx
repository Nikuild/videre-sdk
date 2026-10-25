export default function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-line bg-ink px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gold-soft">{children}</kbd>;
}
