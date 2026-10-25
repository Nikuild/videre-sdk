// Types for the backend envelope (GET /api/v1/token). See docs/token-envelope.example.json.
export type Severity = "critical" | "high" | "medium" | "info";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "info"];
export type Epistemic = "FACT" | "INFERENCE" | "UNKNOWN";

export interface Section {
  source?: string;
  status?: string; // "OK" | "FAIL" | "NEEDS_KEY" | ... — anything but OK is UNKNOWN
  fetched_at?: string | null;
  cached?: boolean;
  data?: unknown;
  error?: string | null;
  label?: string; // optional FACT/INFERENCE/UNKNOWN if the engine provides it
  fallback_from?: { source?: string; status?: string; error?: string } | null;
  [k: string]: unknown;
}

export interface Flag {
  severity: string;
  flag: string;
  evidence?: string | null;
  source?: string | null;
  fetched_at?: string | null;
  label?: string;
  confidence?: string;
}

export interface Verdict {
  draft_verdict?: string;
  why?: string;
  counts?: Partial<Record<Severity, number>>;
  incomplete?: boolean;
  established_token_heuristic?: boolean;
  note?: string;
}

export interface EngineResult {
  kind?: string;
  input?: string;
  chain?: string;
  chain_detection?: string | null;
  generated_at?: string;
  tool?: string;
  sections?: Record<string, Section>;
  flags?: (Flag | string)[];
  verdict?: Verdict;
  unknown_sources?: string[];
  explorer?: string;
  disclaimer?: string;
  error?: string;
}

export interface Envelope {
  status: "ok" | "error" | "timeout" | string;
  engine_version?: string;
  wrapper_version?: string;
  requested_at_utc?: string;
  finished_at_utc?: string;
  chain?: string | null;
  chain_requested?: string | null;
  address?: string | null;
  cached?: boolean;
  cache_age_sec?: number | null;
  result?: EngineResult | null;
  error?: { code?: string; message?: string; retry_after_sec?: number } | null;
}

export function isEnvelope(x: unknown): x is Envelope {
  return !!x && typeof x === "object" && typeof (x as Envelope).status === "string";
}

// ---- stage 3: url / cluster / ticker envelopes share the same base shape plus a few kind-specific fields
export interface Stage3Extras {
  kind?: "url" | "cluster" | "ticker" | string;
  target?: string | null; // url
  host?: string | null; // url
  params?: { depth: number; max_nodes: number } | null; // cluster
  png_url?: string | null; // cluster: same-origin /api/v1/cluster/png?... when the engine rendered a PNG
  symbol?: string | null; // ticker
}
export type AnyEnvelope = Omit<Envelope, "result"> & Stage3Extras & { result?: Record<string, unknown> | null };
