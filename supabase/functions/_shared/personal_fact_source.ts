// Negative provenance only. A false result is not confirmation or application authorization.
// Inspect metadata, never the person's text/title/value/evidence: "AI engineer" can be their own stated goal.
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
  return deniedRecord(value) || deniedLabel(value.provenance) ||
    (record(value.provenance) && deniedRecord(value.provenance));
}
