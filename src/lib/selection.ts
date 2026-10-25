// Cluster-graph node selection state. Pure (unit-tested); ClusterGraph and the side panel share it.
export interface EdgeLike {
  source: string;
  target: string;
}

/** Clicking the selected node again clears the selection; clicking another node selects it. */
export function toggleSelection(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

/** Ids of the selected node and every node directly linked to it (used to dim the rest). */
export function neighbourhood(sel: string | null, edges: EdgeLike[]): Set<string> {
  const s = new Set<string>();
  if (!sel) return s;
  s.add(sel);
  for (const e of edges) if (e.source === sel || e.target === sel) { s.add(e.source); s.add(e.target); }
  return s;
}

/** Arrow-key navigation between nodes in render order (wraps around). */
export function stepSelection(ids: string[], current: string | null, dir: 1 | -1): string | null {
  if (!ids.length) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return dir === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(i + dir + ids.length) % ids.length];
}

/** Initial selection: the mother wallet (INFERENCE) if present, else the queried address, else nothing. */
export function initialSelection(nodes: { id: string; isMother: boolean; isTarget: boolean }[]): string | null {
  return nodes.find((n) => n.isMother)?.id ?? nodes.find((n) => n.isTarget)?.id ?? null;
}
