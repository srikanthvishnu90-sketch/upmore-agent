// D-007 policy shared by conversation and application readers. The owner's bank is not changed or deleted.
export function quarantinedFact(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const f = value as Record<string, unknown>;
  for (const id of [f.factId, f.id]) {
    const m = /^F-0*(\d+)$/.exec(String(id ?? "").trim());
    if (m && Number(m[1]) >= 27 && Number(m[1]) <= 79) return true;
  }
  return /owner-delegated|answer-all/i.test(String(f.provenance ?? ""));
}
