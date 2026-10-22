// A person's answer to one repeated-form row is usable only on that exact posting and field snapshot.
// This binding never creates a whole-history/global personal fact. Keep producer/store/consumer on these same bytes.
const PARTS: Record<string, readonly string[]> = {
  work: ["title", "employer", "location", "description", "start", "end", "current"],
  education: ["school", "degree", "major", "gpa", "end"],
  language: ["language", "fluent", "proficiency"],
  website: ["url"],
};
const TITLES: Record<string, string> = { work: "Work experience", education: "Education", language: "Language", website: "Website" };
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const LOGICAL_TYPE = /^[a-z][a-z0-9_]{0,18}$/;
function rowField(field: unknown): field is Record<string, any> {
  if (!record(field) || !nonempty(field.name) || !nonempty(field.label) || !nonempty(field.type) || !LOGICAL_TYPE.test(field.type) || !Array.isArray(field.options)) return false;
  const s = field.section;
  return record(s) && typeof s.kind === "string" && Object.hasOwn(PARTS, s.kind) &&
    Number.isSafeInteger(s.row) && s.row >= 1 && PARTS[s.kind].includes(s.part) &&
    (s.anchor === undefined || typeof s.anchor === "string") && (s.format === undefined || typeof s.format === "string") &&
    field.options.every((o: unknown) => record(o) && typeof o.label === "string" && typeof o.value === "string");
}
function h16(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return hash.toString(16).padStart(16, "0");
}
export function rowAnswerKey(field: unknown, jobId: unknown): string | null {
  if (!nonempty(jobId) || !rowField(field)) return null;
  const s = field.section;
  // Fixed tuples are independent of object-property order; option order and every raw identifying string remain exact.
  return "job:" + h16(JSON.stringify(["row-answer-v1", jobId, field.name, field.label, field.type,
    field.options.map((o: any) => [o.label, o.value]), s.kind, s.row, s.part, s.anchor ?? null, s.format ?? null]));
}
export function rowQuestionType(field: unknown, jobId: unknown, logicalType?: string): string {
  const native = record(field) && typeof field.type === "string" ? field.type : "text";
  const key = rowAnswerKey(field, jobId);
  // A present but unidentified row must never fall through to a reusable label/global answer.
  if (!key || !rowField(field)) return record(field) && field.section !== undefined ? "row:unbound" : native;
  let type = logicalType ?? native;
  if (logicalType === undefined && !field.options.length && native !== "checkbox" && native !== "number" && !/file/.test(native)) {
    const format = String(field.section.format ?? "").toUpperCase();
    if (format === "YYYY") type = "year";
    else if (/^(?:MM[\/.-]YYYY|YYYY[\/.-]MM)$/.test(format)) type = "month";
  }
  if (!LOGICAL_TYPE.test(type)) throw new Error("row_question_type_invalid");
  return `row:${type}:${key.slice(4)}`;
}
export function decodeRowQuestionType(type: unknown): { key: string; type: string } | null {
  if (typeof type !== "string" || type.length > 40) return null;
  const match = /^row:([a-z][a-z0-9_]{0,18}):([0-9a-f]{16})$/.exec(type);
  return match ? { key: "job:" + match[2], type: match[1] } : null;
}
export function rowQuestionLabel(field: unknown): string {
  const label = record(field) && typeof field.label === "string" ? field.label : "";
  if (!rowField(field)) return label;
  const s = field.section, anchor = s.anchor?.trim() ? s.anchor : "entry not named";
  return `${TITLES[s.kind]} row ${s.row} (${anchor})${s.format ? ` [${s.format}]` : ""}: ${label}`;
}
