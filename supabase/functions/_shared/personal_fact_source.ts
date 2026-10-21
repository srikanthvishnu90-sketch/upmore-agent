// Negative provenance only. A false result is not confirmation or application authorization.
// Inspect metadata, never the person's text/title/value/evidence: "AI engineer" can be their own stated goal.
import { quarantinedFact } from "./fact_quarantine.ts";
const DENIED_LABELS = new Set([
  "agent", "assistant", "model", "llm", "ai", "inferred", "generated", "agent-generated", "assistant-generated",
  "model-generated", "ai-generated", "quarantined", "rejected",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const label = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
const deniedLabel = (value: unknown) => DENIED_LABELS.has(label(value));
function deniedRecord(value: Record<string, unknown>): boolean {
  return value.unproven === true || value.quarantined === true || value.rejected === true ||
    label(value.status) === "rejected" || deniedLabel(value.source) || deniedLabel(value.origin);
}
export function personalSourceDenied(value: unknown): boolean {
  if (!record(value)) return false;
  return quarantinedFact(value) || deniedRecord(value) || deniedLabel(value.provenance) ||
    (record(value.provenance) && deniedRecord(value.provenance));
}

// Build one read-only dependency closure over all available personal fact containers/results. A child's confirmation
// cannot erase its parent's quarantine; a derived row cannot revive an excluded or absent source by using a new id.
export function personalSourceGuard(roots: readonly unknown[]): (value: unknown) => boolean {
  const rows: Record<string, unknown>[] = [], nodes: object[] = [], denied = new WeakSet<object>(), seen = new WeakMap<object, boolean>();
  const parents = new Map<object, Set<object>>();
  // These records describe history or external requirements, never current personal sources (reply guard's same rule).
  const nonCurrent = new Set(["corrected_from", "was", "audit", "audit_log", "profile_corrections", "unconfirmed", "drafts", "rejected", "requirement", "requirements", "evidence", "provenance"]);
  const stack: { value: unknown; inherited: boolean; parent?: object }[] = roots.map(value => ({ value, inherited: false }));
  while (stack.length) {
    const { value, inherited, parent } = stack.pop()!;
    if (!value || typeof value !== "object") continue;
    if (parent) { const p = parents.get(value) ?? new Set<object>(); p.add(parent); parents.set(value, p); }
    const bad = inherited || personalSourceDenied(value), prior = seen.get(value);
    if (prior === true || prior === false && !bad) continue;
    seen.set(value, bad);
    if (bad) denied.add(value);
    if (prior === undefined) { nodes.push(value); if (record(value)) rows.push(value); }
    for (const [key, child] of Object.entries(value)) if (!nonCurrent.has(key)) stack.push({ value: child, inherited: bad, parent: value });
  }
  const idsOf = (v: Record<string, unknown>) => [v.id, v.factId].filter((id): id is string => typeof id === "string" && !!id.trim());
  const allIds = new Set(rows.flatMap(idsOf)), deniedIds = new Set<string>(), unavailable = new Set<string>();
  for (const row of rows) {
    if (denied.has(row)) idsOf(row).forEach(id => deniedIds.add(id));
    if (row.needs_confirmation === true || row.status !== undefined && row.status !== "confirmed") idsOf(row).forEach(id => unavailable.add(id));
  }
  const badDependencies = (row: Record<string, unknown>) => Object.hasOwn(row, "derived_from") && (
    !Array.isArray(row.derived_from) || row.derived_from.some(id => typeof id !== "string" || !id.trim() ||
      quarantinedFact({ factId: id }) || !allIds.has(id) || deniedIds.has(id) || unavailable.has(id)));
  for (let changed = true; changed;) {
    changed = false;
    for (const node of nodes) if (!denied.has(node) && [...parents.get(node) ?? []].some(parent => denied.has(parent))) {
      denied.add(node); if (record(node)) idsOf(node).forEach(id => deniedIds.add(id)); changed = true;
    }
    for (const row of rows) {
      if (!denied.has(row) && badDependencies(row)) {
        denied.add(row); idsOf(row).forEach(id => deniedIds.add(id)); changed = true;
      }
    }
  }
  return value => personalSourceDenied(value) || !!value && typeof value === "object" && (denied.has(value) ||
    record(value) && badDependencies(value));
}
