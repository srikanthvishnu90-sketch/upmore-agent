// Backend gap map G2 (owner, 2026-10-23): work authorization and sponsorship are safety fields. Every fact carries its
// source or stays unwritten, and neither is ever inferred. What the person said in chat ("I don't need visa
// sponsorship") is offered back when the employer's sponsorship or work-authorization question is shown: their own
// message, word for word, with its date, as a draft that only "use N" saves (career_apply_questions.ts). Nothing here
// writes anything.
// - Sponsorship comes only from a first-person statement of needing or not needing sponsorship.
// - Work authorization comes only from a first-person statement of being, or not being, authorized to work in the US.
// - A statement about one never answers the other.
// - Citizenship, a green card or a visa type answers neither.
// - A question, a maybe, someone else's situation, another country, or two answers in one message answer nothing.
// - The newest message about a fact decides, and if it is not clear nothing is offered.
import { mapQuestion } from "./question_map.ts";

export type EligibilityFact = "sponsorship" | "work_authorization";
export interface Said { text: string; at: string }
export interface EligibilityDraft { fact: EligibilityFact; value: "Yes" | "No"; text: string; at: string }

const MENTIONS: Record<EligibilityFact, RegExp> = {
  sponsorship: /sponsor/,
  work_authorization: /\b(?:authori[sz]ed|eligible|permitted) to work\b|\bwork authori[sz]ation\b|\bauthori[sz]ation to work\b/,
};
// Words that make a statement conditional or uncertain: it is not an answer.
const HEDGE = /\b(?:if|might|may|maybe|perhaps|probably|possibly|unsure|not sure|depends|depending|whether|could|think|guess|hope|unless)\b/;
const US = /\b(?:us|u s|usa|united states(?: of america)?|america)\b/;

// Contractions spelled out, so the patterns read one way: "don't" → "do not", "I'm" → "i am", "I'll" → "i will".
function normal(s: string): string {
  return ` ${s.toLowerCase().replace(/[’`]/g, "'")} `
    .replace(/\bcan't\b/g, "can not").replace(/\bwon'?t\b/g, "will not").replace(/\b(do|does|did|would|should|is|am|are)n'?t\b/g, "$1 not")
    .replace(/\bdont\b/g, "do not").replace(/\bi'?m\b/g, "i am").replace(/\bi'll\b/g, "i will").replace(/\bi'd\b/g, "i would")
    .replace(/[^a-z0-9?'\s-]/g, " ").replace(/\s+/g, " ");
}
// A message's sentences, each with whether it was asked as a question ("U.S." is a name, not the end of one).
function sentences(text: string): { s: string; asked: boolean }[] {
  return String(text ?? "").replace(/\b[Uu]\.\s?[Ss]\.(?:\s?[Aa]\.)?/g, "US").split(/(?<=[.!?;\n])/).map((raw) => ({ s: normal(raw), asked: /\?\s*$/.test(raw.trim()) }))
    .filter((x) => x.s.trim());
}

// Only these words may sit between "need" and "sponsor" ("I need a visa sponsor"; never "I need to know about sponsorship").
const FILL = "(?:(?:a|an|the|any|visa|employment|work|h-1b|h1b|employer|company|future|new|immigration) )*";
const SP_NO = new RegExp(`\\b(?:i|and)(?: do| will| would| shall)? (?:not|never|no longer)(?: (?:currently|ever|now|presently|yet))? (?:need|require)s? ${FILL}sponsor`);
const SP_YES = new RegExp(`\\b(?:i|and)(?: will| do| would| shall| currently| also| still)? (?:need|require)s? ${FILL}sponsor`);
const WA_NO = /\bi am not (?:(?:legally|currently) )*(?:authori[sz]ed|eligible|permitted) to work\b|\bi do not have (?:(?:valid|any|us) )*(?:work authori[sz]ation|authori[sz]ation to work)\b/;
const WA_YES = /\bi am (?:(?:legally|currently|fully|also|now|already) )*(?:authori[sz]ed|eligible|permitted) to work\b|\bi have (?:(?:valid|full|current|us) )*(?:work authori[sz]ation|authori[sz]ation to work)\b/;

// One sentence's answer for one fact: a value, "unclear" (it is about the fact but is not an answer), or null.
function sentenceValue(fact: EligibilityFact, x: { s: string; asked: boolean }): "Yes" | "No" | "unclear" | null {
  if (!MENTIONS[fact].test(x.s)) return null;
  if (x.asked || HEDGE.test(x.s)) return "unclear";
  if (fact === "sponsorship") {
    if (SP_NO.test(x.s)) return "No";
    if (SP_YES.test(x.s) && !/\b(?:not|never|no longer)\b/.test(x.s)) return "Yes";
    return "unclear";
  }
  const no = WA_NO.test(x.s), yes = !no && WA_YES.test(x.s);
  if (!no && !yes) return "unclear";
  // Only the US: any other place named after "to work in" is another country's question.
  const where = /\bto work (?:\w+ ){0,4}?in (?:the )?([a-z][a-z ]{1,30})/.exec(x.s);
  if (where && !US.test(` ${where[1]} `)) return "unclear";
  return no ? "No" : "Yes";
}

// One message's answer for one fact: a single clear value, or "unclear", or null when it does not mention the fact.
export function statedValue(fact: EligibilityFact, text: string): "Yes" | "No" | "unclear" | null {
  const vals = sentences(text).map((x) => sentenceValue(fact, x)).filter((v) => v !== null);
  if (!vals.length) return null;
  return new Set(vals).size === 1 ? vals[0] : "unclear";
}

// The draft for one fact from the person's own messages: the newest message about the fact decides.
export function eligibilityDraft(fact: EligibilityFact, said: Said[]): EligibilityDraft | null {
  const about = said.filter((m) => typeof m?.text === "string" && Number.isFinite(Date.parse(m.at)) && statedValue(fact, m.text) !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = about[about.length - 1];
  if (!last) return null;
  const v = statedValue(fact, last.text);
  return v === "Yes" || v === "No" ? { fact, value: v, text: last.text.replace(/\s+/g, " ").trim(), at: last.at } : null;
}

const FOREIGN = /\b(?:canada|united kingdom|uk|britain|england|europe|european union|eu|australia|new zealand|india|germany|france|ireland|singapore|mexico|brazil|japan|netherlands|spain|israel|china|switzerland|poland|portugal)\b/;
// The fact a question asks, when it asks exactly one of the two and only about the US; else null (never drafted).
export function eligibilityFactOf(q: { key: string; label: string; type: string }): EligibilityFact | null {
  const fact = q.key.startsWith("fact:") ? q.key.slice(5) : mapQuestion({ label: q.label, type: q.type }).fact;
  if (fact !== "sponsorship" && fact !== "work_authorization") return null;
  const t = normal(q.label);
  // "authorized to work ... without sponsorship" asks both facts at once; it is the person's to answer.
  if (/\bsponsor/.test(t) && /\b(?:authori[sz]|eligib|entitled|right to work|permitted to work)/.test(t)) return null;
  if (/\bwithout\b/.test(t)) return null;
  if (FOREIGN.test(t)) return null;
  return fact;
}

// The line shown under the question: their own words, when, what that answers, and how to use it.
export function draftNote(d: Pick<EligibilityDraft, "text" | "at">, value: string, n: number): string {
  const day = new Date(d.at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const quote = d.text.length > 160 ? `${d.text.slice(0, 157)}...` : d.text;
  return `   You told me on ${day}: "${quote}". That answers ${value}. Say "use ${n}" to answer ${value}, or answer it yourself.`;
}
