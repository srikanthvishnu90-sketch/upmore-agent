// WO-064: the panel's open questions drafted from the person's confirmed facts, so the person reviews a list instead of
// typing it. The model only proposes; code decides what is shown:
//   1. Some questions are never drafted and never sent to the model (neverDraft): crime and background checks, a
//      government's question about the person, EEO and self-identification, identity numbers, signatures, consents.
//   2. Only confirmed facts reach the model (essay_draft.ts confirmedFacts), never one waiting for the person's yes, and
//      never a fact sent with the request.
//   3. Every proposal passes the veto (vetoDraft): it cites confirmed facts by id; an option answer is one of the
//      question's own options; free text traces to the cited facts (factLock); a "no" to an experience, referral or
//      worked-here question needs a fact that says no (never drafted from absence); a "yes" names the thing in a cited
//      fact; years claimed are carried by the cited facts' own years or dates.
//   4. One model call per BATCH questions; a failed call fails its own batch only, and nothing throws.
// Nothing here saves or fills: the panel shows each draft pre-selected, and only the person's Save answers keeps it.
import { confirmedFacts, factLock, factText, type ModelFn, norm } from "./essay_draft.ts";
import { factLabel } from "./career_essay_card.ts";

export interface ShortQuestion {
  key: string; label: string; type: string; options: string[]; company: string; location?: string | null;
  own_words?: boolean; // the form asks for the person's own words (the card reads its AI policy): no free-text draft
}
export type ShortWhy = "never" | "no_fact" | "not_an_option" | "unverified" | "negative_from_absence" | "model" | "cap";
export type ShortDraft =
  | { key: string; ok: true; answer: string; fact_ids: string[]; from: string[] }
  | { key: string; ok: false; why: ShortWhy };
export const BATCH = 25;

// ---------------------------------------------------------------------------------------------------------------------
// Never drafted, whatever the facts say: these stay the person's own answer every time.
const CONSENT = /\bconsent\w*|\backnowledg\w*|\bdisclosures?\b|\bterms (and|&) conditions\b|\bprivacy (policy|notice|statement)\b|\bagree (to|with)\b|\battest\w*|\bi (hereby )?(certify|authori[sz]e)\b/;
const NEVER: [RegExp, string][] = [
  [/\b(convict\w*|felon\w*|misdemeanou?r\w*|criminal|arrest\w*|pleaded|pled guilty|pending charges?)\b/, "a criminal history question"],
  [/\b(background|drug|alcohol)\s+(check|test|screen)\w*/, "a background check or drug test"],
  [/\bclearance\b|\bpublic trust\b|\brenounc\w*|\bexport control\w*|\bsanction\w*|\bdebar\w*|\bitar\b|\bofac\b|\bdenied party\b/, "a government's question about the person"],
  [/\b(gender|sex|race|racial|ethnic\w*|hispanic|latin[oax]|veteran|disabilit\w*|disabled|sexual orientation|transgender|pronouns?|lgbtq\w*)\b/, "a self-identification question"],
  [/\bdate of birth\b|\bbirth ?date\b|\bhow old\b|\bage\b/, "a question about age"],
  [/\bsocial security\b|\bssn\b|\bnational (id|insurance)\b|\bpassport (number|no)\b|\bdriver'?s licen[cs]e (number|no)\b|\btax (id|file number)\b|\bnin\b|\bsin\b/, "an identity number"],
  [/\bsignature\b|\bsign here\b|\be-?sign\b/, "a signature"],
  [/^\s*(i\s+)?(hereby\s+)?(certify|agree|consent|acknowledge|attest|authori[sz]e|declare|understand that|confirm that)\b/, "a consent or attestation"],
  [CONSENT, "a consent, acknowledgement or disclosure"],
  [/\b(prove|confirm|verify) (that )?you('| a)?re (a )?(real|human)|\bnot a robot\b|\bcaptcha\b|\btype (the word )?\w+ below\b/, "a human check"],
  [/\bpronounc\w*/, "how the person says their name"],
  [/\b(discharged|terminated|fired|dismissed|let go|asked to resign)\b/, "a question about leaving a job"],
  [/\bex-?employee|\bformer (employee|intern|contractor)|\bpreviously (worked|been employed|interned)|\bever (worked|been employed|interned)|\bworked (for|at|with) .{0,60}\b(before|previously|in the past)\b/, "past work for this employer"],
  [/\b(listed|stated|posted|outlined|mentioned|shown|advertised) (in|on|for) (the|this) (job |role )?(description|posting|ad|advert|listing)|\bthis (salary|pay|compensation|rate|range)\b|\b(salary|pay|compensation|rate) (range )?(for|of) this (position|role|job)\b/, "this posting's own terms"],
  [/\bnotif\w*|\bnewsletters?\b|\bmarketing\b|\bsubscribe\w*|\btalent (community|network|pool)\b|\bopt[- ]in\b|\bkeep (you|me) (informed|updated)\b/, "an opt-in"],
  [/\bcompetitors?\b|\bconflicts? of interest\b/, "an opinion about another employer"],
  // This posting's office, place or schedule: the answer depends on where this job is and what the person will do for it,
  // which no fact holds (a standing answer for postings the person approves is WO-074, the person's own choice).
  [/\b(on-?site|in[- ]office|in the office|offices?|commut\w*|relocat\w*|hybrid|in[- ]person|headquarters|located (in|within|near|close)|live (in|within|near)|resid(e|ing) (in|within|near)|(which|preferred|work) location)\b/, "this posting's office or place"],
];
export function neverDraft(label: string): string | null {
  const t = String(label ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  for (const [re, why] of NEVER) if (re.test(t)) return why;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The veto.
const idOf = (f: any) => String(f?.id || f?.fact_id || "");
const EXPERIENCE = /\bexperience\w*|\bbilingual\b|\bfluen\w*|\bspeak\w*|\bnative (speaker|language)\b|\bfamiliar\w*|\bproficien\w*|\bknowledge of\b|\bworked (with|on|in)\b|\bhave you (ever )?(used|built|developed|created|designed|led|managed|written|shipped|run|owned|taught|published|implemented|deployed|sold|launched)\b|\bhands[- ]on\b|\byears of\b|\bcertifi\w*|\blicen[cs]e\w*|\bskill\w*/;
const ABOUT_THEM = /\brefer\w*|\brelative\w*|\bfamily members?\b|\brelated to\b|\bacquaint\w*|\bpreviously (worked|been employed|applied|interviewed)\b|\bworked (for|at)\b|\bformer (employee|intern)\b|\bcurrently employed (by|at)\b|\bapplied (before|previously)\b/;
const NEGATIVE = /^(no\b|none\b|n\/?a\b|0\b|zero\b|not\b|never\b|no experience|less than|under 1\b|i do not|i don'?t|i have not|i haven'?t|i have never|i am not|i'?m not)/;
const SAYS_NO = /\b(no|not|never|none|without|n't|nobody)\b/;
const GENERIC = new Set((
  "the a an and or of to in for on at with your you our we us is are was were be been do does did have has had this that it as about from by any " +
  "experience experienced years year many how much what which who whom whose when where why if so please select all apply following best describes " +
  "describe level professional direct hands working work worked knowledge familiar familiarity proficient proficiency skill skills using use used " +
  "relevant total currently current hold held least one more than plus minimum required role position job company there here these those can could " +
  "would should will able yes no other prior previous previously ever been time full part type kind area field fields such e g i.e etc"
).split(" "));
const termsOf = (s: string) => [...new Set(norm(s).split(" ").filter((w) => w.length > 1 && !GENERIC.has(w) && !/^\d/.test(w)))];
// A loose word match for "is this fact about this question": the first five letters, either way ("authorized" and
// "authorization", "hear" and "heard", "citizen" and "citizenship").
const stem = (w: string) => w.slice(0, 5);
// A short word (SQL, R, AWS) matches only itself.
const sameStem = (a: string, b: string) =>
  a.length < 4 || b.length < 4 ? a === b : stem(a) === stem(b) || a.startsWith(b) || b.startsWith(a);
const shares = (terms: string[], text: string) => {
  const words = norm(text).split(" ").filter(Boolean);
  return terms.some((t) => words.some((w) => sameStem(t, w)));
};
const allIn = (terms: string[], text: string) => terms.every((t) => shares([t], text));
// What a fact of each kind is about, beyond its own words: a job answers "your most recent company", a school "your degree".
const KIND_WORDS: Record<string, string> = {
  experience: "employer employers company companies work worked working employed employment job role title position recent current previous",
  education: "school degree education university college graduation graduate gpa major study studies",
  skill: "skill skills experience tools",
};
const aboutText = (f: any) => `${factText(f)} ${KIND_WORDS[String(f?.kind)] ?? ""}`;
const hasTerm = (corpus: string, w: string) => new RegExp(`(^| )${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ed|ing)?( |$)`).test(corpus);

// Years the cited facts carry: "4 years", "since 2023", "2019 to 2024", "2021 - present". The longest one.
export function factYears(text: string, now: number): number | null {
  const t = String(text).toLowerCase(), year = new Date(now).getUTCFullYear();
  const out: number[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/g)) out.push(Number(m[1]));
  for (const m of t.matchAll(/\bsince\s+((?:19|20)\d\d)\b/g)) out.push(year - Number(m[1]));
  for (const m of t.matchAll(/\b((?:19|20)\d\d)\s*(?:to|-|–|—|until|through)\s*((?:19|20)\d\d|present|now|today|current)\b/g)) {
    out.push((/\d/.test(m[2]) ? Number(m[2]) : year) - Number(m[1]));
  }
  const ok = out.filter((n) => Number.isFinite(n) && n >= 0 && n < 60);
  return ok.length ? Math.max(...ok) : null;
}
// The years an answer claims: "5+ years", "1-3 years", "More than 2 Years", "3"; a "yes" claims the label's own ("7+ years of").
function claimedYears(answer: string, label: string, yes: boolean): { lo: number; hi: number | null } | null {
  const a = answer.toLowerCase();
  let m = a.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)?/);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  m = a.match(/(?:more than|over|at least)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|$)/);
  if (m && (/\+|more than|over|at least/.test(a) || /^\s*\d+(?:\.\d+)?\s*(years?|yrs?)?\s*$/.test(a))) {
    return { lo: Number(m[1]), hi: /\+|more than|over|at least/.test(a) ? null : Number(m[1]) };
  }
  if (yes) {
    const l = label.toLowerCase().match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:or more\s*)?(?:years?|yrs?)/);
    if (l) return { lo: Number(l[1]), hi: null };
  }
  return null;
}
// Numbers an option names must be carried by the cited facts: as the same number, a month (05 for May), or a range
// holding a cited number ("3.5-4.0" for a GPA of 3.8).
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function optionNumbersCarried(option: string, label: string, cited: string): boolean {
  const nums = [...cited.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
  const low = cited.toLowerCase(), inLabel = new Set([...label.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ""))));
  const range = option.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|to)\s*(\d[\d,]*(?:\.\d+)?)/);
  if (range) {
    const [a, b] = [Number(range[1].replace(/,/g, "")), Number(range[2].replace(/,/g, ""))];
    return nums.some((n) => n >= Math.min(a, b) && n <= Math.max(a, b));
  }
  for (const m of option.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (inLabel.has(n) || nums.includes(n)) continue;
    if (n >= 1 && n <= 12 && new RegExp(`\\b${MONTHS[n - 1]}\\b|\\b${MONTHS[n - 1].slice(0, 3)}\\b`).test(low)) continue;
    return false;
  }
  return true;
}
const MULTI = /multi|checkbox/;
const YESNO = (o: string[]) => o.length > 0 && o.every((x) => /^(yes|no)\b/i.test(x.trim()));

export function vetoDraft(q: ShortQuestion, p: { answer: unknown; fact_ids: unknown }, facts: unknown[], now = Date.now()): ShortDraft {
  const fail = (why: ShortWhy): ShortDraft => ({ key: q.key, ok: false, why });
  const byId = new Map(confirmedFacts(facts).map((f) => [idOf(f), f]));
  const ids = Array.isArray(p?.fact_ids) ? [...new Set(p.fact_ids.map((x) => String(x)))] : null;
  if (!ids?.length || ids.some((id) => !byId.has(id))) return fail("no_fact");
  const raw = typeof p?.answer === "string" || typeof p?.answer === "number" ? String(p.answer).replace(/\s+/g, " ").trim() : "";
  if (!raw) return fail("no_fact");
  const cited = ids.map((id) => byId.get(id));
  const citedText = cited.map((f) => factText(f)).join(" \n ");
  const corpus = norm(citedText);
  const options = (q.options ?? []).map(String);

  // The answer, in the question's own option spelling.
  let answer = raw, picked: string[] = [];
  if (options.length) {
    const find = (s: string) => options.find((o) => norm(o) === norm(s));
    const parts = MULTI.test(q.type) && !YESNO(options) ? raw.split(/\s*;\s*/).filter(Boolean) : [raw];
    picked = parts.map((s) => find(s) ?? "");
    if (!picked.length || picked.some((x) => !x)) return fail("not_an_option");
    picked = [...new Set(picked)];
    answer = picked.join("; ");
  } else if (q.own_words) return fail("never");
  if (CONSENT.test(answer.toLowerCase())) return fail("never");

  const label = String(q.label ?? ""), l = label.toLowerCase();
  if (!options.length && norm(answer).length > 15 && norm(label).includes(norm(answer))) return fail("unverified"); // the question copied back
  const experience = EXPERIENCE.test(l), aboutThem = ABOUT_THEM.test(l);
  const negative = NEGATIVE.test(answer.toLowerCase().trim());
  if ((experience || aboutThem) && negative) {
    // "Less than N years" is carried by the facts' own years when they are fewer; any other "no" needs a fact saying it.
    const less = answer.toLowerCase().match(/less than\s*(\d+(?:\.\d+)?)/);
    const yrs = factYears(citedText, now);
    if (less && yrs !== null && yrs < Number(less[1])) return { key: q.key, ok: true, answer, fact_ids: ids, from: cited.map(factLabel) };
    const subject = termsOf(label);
    const states = cited.some((f) => {
      const t = norm(factText(f));
      return SAYS_NO.test(t) && (!subject.length || subject.some((w) => hasTerm(t, w)));
    });
    return states ? { key: q.key, ok: true, answer, fact_ids: ids, from: cited.map(factLabel) } : fail("negative_from_absence");
  }
  // Every other answer rests on a cited fact about this question: a word of the question in the fact, or, for a named
  // option (a tool, a channel, a field), every word of that option in the cited facts.
  const named = options.length && !YESNO(options) ? picked.flatMap((o) => termsOf(o.replace(/^\s*(yes|no)\b[\s,.:;-]*/i, ""))) : [];
  const about = cited.map(aboutText).join(" \n ");
  const labelTerms = termsOf(label);
  if (named.length && !allIn(named, citedText)) return fail("unverified");
  if (labelTerms.length && !shares(labelTerms, about) && !(named.length && allIn(named, citedText))) return fail("unverified");
  if (experience && !negative) {
    // A yes names the thing asked about; a named option (a tool, a field) is itself the thing.
    const named = options.length && !YESNO(options) && !claimedYears(answer, label, false) ? picked.flatMap(termsOf) : termsOf(label);
    const hit = named.filter((w) => hasTerm(corpus, w)).length;
    if (named.length && hit < Math.ceil(named.length / 2)) return fail("unverified");
    const yes = /^yes\b/i.test(answer);
    const claim = claimedYears(answer, label, yes);
    if (claim) {
      const yrs = factYears(citedText, now);
      if (yrs === null || yrs < claim.lo || (claim.hi !== null && yrs > claim.hi + 1)) return fail("unverified");
    }
    return { key: q.key, ok: true, answer, fact_ids: ids, from: cited.map(factLabel) };
  }
  if (options.length) {
    if (!picked.every((o) => optionNumbersCarried(o, label, citedText))) return fail("unverified");
  } else {
    const lock = factLock(answer, [citedText, label, q.company ?? "", q.location ?? ""]);
    if (!lock.pass) return fail("unverified");
  }
  return { key: q.key, ok: true, answer, fact_ids: ids, from: cited.map(factLabel) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The model's part: propose, in JSON, for a batch.
const SYSTEM = [
  "You fill in short job application questions for the person applying, using ONLY their confirmed facts listed below.",
  "For each question, either propose an answer or leave it out. Rules that do not bend:",
  "1. Cite the fact ids your answer rests on. Answer only what a listed fact states directly. If no fact says it, leave the question out: never guess, never fill a gap with something plausible, never infer a preference, an opinion, a consent or anything about this employer or posting.",
  "2. A question with options gets exactly one of its options, copied character for character (several, joined with \"; \", only when it says select all that apply).",
  "3. Never answer no, none or zero because a fact is missing. Answer no only when a fact says no.",
  "4. Years of experience come only from the dates or years in the facts you cite.",
  "5. Free text is short (one line), plain, first person when needed, and names nothing the cited facts, the question or the company do not name.",
  'Return only JSON: {"drafts":[{"key":"…","answer":"…","fact_ids":["…"]}]}',
].join("\n");
export function shortPayload(qs: ShortQuestion[], facts: any[]) {
  const lines = [
    "The person's confirmed facts (the only material you may use):",
    ...facts.map((f) => `- [${[idOf(f), f.kind].filter(Boolean).join(", ")}] ${factText(f)}`),
    "",
    "Questions:",
    ...qs.map((x) => JSON.stringify({ key: x.key, company: x.company || undefined, location: x.location || undefined, question: x.label.replace(/\s+/g, " ").trim(), type: x.type, options: x.options.length ? x.options : undefined })),
  ];
  return { system: SYSTEM, messages: [{ role: "user", content: lines.join("\n") }], max_tokens: 2500, temperature: 0 };
}
function proposalsOf(msg: any): Map<string, { answer: unknown; fact_ids: unknown }> {
  const text = (Array.isArray(msg?.content) ? msg.content : []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("");
  const body = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const out = new Map<string, { answer: unknown; fact_ids: unknown }>();
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { throw new Error("the model did not return JSON"); }
  for (const d of Array.isArray(parsed?.drafts) ? parsed.drafts : []) {
    if (d && typeof d.key === "string" && !out.has(d.key)) out.set(d.key, { answer: d.answer, fact_ids: d.fact_ids });
  }
  return out;
}

export async function draftShortAnswers(
  qs: ShortQuestion[], deps: { model: ModelFn; facts: () => Promise<unknown[]> | unknown[]; now?: number },
): Promise<ShortDraft[]> {
  const out = new Map<string, ShortDraft>();
  const ask: ShortQuestion[] = [];
  for (const x of qs) {
    if (neverDraft(x.label)) out.set(x.key, { key: x.key, ok: false, why: "never" });
    else ask.push(x);
  }
  let all: unknown[] = [];
  try { all = await deps.facts(); } catch { for (const x of ask) out.set(x.key, { key: x.key, ok: false, why: "model" }); }
  const facts = confirmedFacts(all);
  if (!facts.length) for (const x of ask) if (!out.has(x.key)) out.set(x.key, { key: x.key, ok: false, why: "no_fact" });
  const todo = ask.filter((x) => !out.has(x.key));
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    let got: Map<string, { answer: unknown; fact_ids: unknown }> | null = null;
    for (let tries = 0; tries < 2 && !got; tries++) {
      try { got = proposalsOf(await deps.model(shortPayload(batch, facts))); } catch { /* tried once more, then refused */ }
    }
    if (!got) { for (const x of batch) out.set(x.key, { key: x.key, ok: false, why: "model" }); continue; }
    for (const x of batch) {
      const p = got.get(x.key);
      out.set(x.key, p ? vetoDraft(x, p, facts, deps.now ?? Date.now()) : { key: x.key, ok: false, why: "no_fact" });
    }
  }
  return qs.map((x) => out.get(x.key) ?? { key: x.key, ok: false, why: "no_fact" });
}
