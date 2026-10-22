// D-007 policy shared by conversation and application readers. The owner's bank is not changed or deleted.
// The F-027..F-079 range names the bank's facts, whose ids live in factId. A chat profile numbers its own facts F-001 up
// in id, and those are the person's own (same rule as packages/domain/122-career-profile.js).
export function quarantinedFact(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const f = value as Record<string, unknown>;
  const m = /^F-0*(\d+)$/.exec(String(f.factId ?? "").trim());
  if (m && Number(m[1]) >= 27 && Number(m[1]) <= 79) return true;
  return /owner-delegated|answer-all/i.test(String(f.provenance ?? ""));
}

// Both metadata spellings are in stored profiles. They are a union: one valid alias cannot mask the other.
// Null means malformed dependency metadata; an empty list means no dependencies. Never inspect fact-body/evidence text.
export function factDependencies(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>, ids: string[] = [];
  for (const key of ["derived_from", "derivedFrom"]) {
    if (!Object.hasOwn(row, key)) continue;
    const list = row[key];
    if (!Array.isArray(list) || list.some(id => typeof id !== "string" || !id.trim())) return null;
    ids.push(...list);
  }
  return [...new Set(ids)];
}
