// All times are rendered in UTC only. Never use toLocaleString / local time zones.
export function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return "UNKNOWN";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "UNKNOWN";
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
