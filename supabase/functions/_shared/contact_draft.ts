// SUBMIT-STEER-1130: the person's name, email and phone, as they said them in chat, offered back when an application asks
// for them, the way G2 offers their sponsorship and work-authorization words (eligibility_draft.ts). Nothing here writes
// anything: the question shows their own message, word for word with its date, and only "use N" saves the value
// (career_apply_questions.ts), through the same check as a typed answer.
// - Only a first-person statement of their own: "my name is ...", "my email (address) is ...", "my (cell|mobile)
//   phone (number) is ...", "you can reach me at ...". Someone else's ("my sister's phone ..."), a question, a maybe, or a
//   negation offers nothing.
// - The value is what they typed, never reformatted or completed. A first and a last name are offered only from a name
//   of exactly two words; any other name is theirs to split.
// - The newest message about a field decides; if it is not a clear statement, nothing is offered.
export type ContactFact = "first_name" | "last_name" | "full_name" | "email" | "phone";
export interface Said { text: string; at: string }
export interface ContactDraft { fact: ContactFact; value: string; text: string; at: string }

const HEDGE = /\b(?:if|might|may|maybe|perhaps|probably|possibly|unsure|not sure|soon|changing|will be|was|used to|old|isn'?t|is not|not)\b/i;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const NAME_WORD = /^[\p{L}][\p{L}'’-]*$/u;

const sentences = (text: string) => String(text ?? "").split(/(?<=[!?;\n])|(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
const stripEnd = (s: string) => s.trim().replace(/[.,!;:]+$/, "").trim();

type Field = "name" | "email" | "phone";
const ABOUT: Record<Field, RegExp> = {
  name: /\bmy (?:full |legal )?name\b/i,
  email: /\bmy (?:new |personal |preferred )?e-?mail(?: address)?\b|\be-?mail me at\b/i,
  phone: /\bmy (?:new |personal )?(?:(?:cell|mobile|cell phone|mobile phone|phone)(?: number)?|number)\b|\breach me at\b|\btext me at\b/i,
};
// The value of one field from one sentence: a value, "unclear" (it is about the field but is not a statement), or null.
function valueIn(field: Field, raw: string): string | "unclear" | null {
  if (!ABOUT[field].test(raw)) return null;
  if (/\?\s*$/.test(raw) || /^\s*(?:is|are|do|does|did|can|could|should|what|which)\b/i.test(raw)) return "unclear";
  // Someone else's: a possessive between "my" and the field ("my sister's phone", "my boss's email").
  if (/\bmy [\p{L}]+['’]s (?:full |legal )?(?:name|e-?mail|phone|cell|mobile|number)\b/iu.test(raw)) return null;
  let m: RegExpExecArray | null = null;
  if (field === "name") m = /\bmy (?:full |legal )?name is ([^,;]+?)(?:\s+and\b.*)?$/i.exec(stripEnd(raw));
  if (field === "email") m = /\b(?:my (?:new |personal |preferred )?e-?mail(?: address)? is|e-?mail me at)\s+(\S+)/i.exec(raw);
  if (field === "phone") m = /\b(?:my (?:new |personal )?(?:(?:cell|mobile|cell phone|mobile phone|phone)(?: number)?|number) is|reach me at|text me at)\s+(\+?[\d(][\d ().-]{5,}\d)/i.exec(raw);
  const before = m ? raw.slice(0, m.index) + raw.slice(m.index).split(m[1])[0] : raw;
  if (!m || HEDGE.test(before)) return "unclear";
  const v = stripEnd(m[1]);
  if (field === "email") return EMAIL.test(v) ? v : "unclear";
  if (field === "phone") {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 && /^\+?[\d ().-]+$/.test(v) ? v : "unclear";
  }
  const words = v.split(/\s+/);
  return words.length >= 1 && words.length <= 4 && words.every((w) => NAME_WORD.test(w)) ? words.join(" ") : "unclear";
}
// One message's value for a field: one clear value, "unclear", or null when it does not mention the field.
function statedIn(field: Field, text: string): string | "unclear" | null {
  const vals = sentences(text).map((s) => valueIn(field, s)).filter((v) => v !== null);
  if (!vals.length) return null;
  return new Set(vals).size === 1 ? vals[0] : "unclear";
}
const FIELD: Record<ContactFact, Field> = { first_name: "name", last_name: "name", full_name: "name", email: "email", phone: "phone" };

export function contactDraft(fact: ContactFact, said: Said[]): ContactDraft | null {
  const field = FIELD[fact];
  const about = said.filter((m) => typeof m?.text === "string" && Number.isFinite(Date.parse(m.at)) && statedIn(field, m.text) !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = about[about.length - 1];
  if (!last) return null;
  const v = statedIn(field, last.text);
  if (!v || v === "unclear") return null;
  let value = v;
  if (field === "name") {
    const words = v.split(" ");
    if (fact !== "full_name" && words.length > 2) return null;
    if (fact === "first_name") value = words[0];
    else if (fact === "last_name") { if (words.length !== 2) return null; value = words[1]; }
  }
  return { fact, value, text: last.text.replace(/\s+/g, " ").trim(), at: last.at };
}

const CONTACT_FACTS = new Set<string>(["first_name", "last_name", "full_name", "email", "phone"]);
export const isContactFact = (f: string | null | undefined): f is ContactFact => !!f && CONTACT_FACTS.has(f);
