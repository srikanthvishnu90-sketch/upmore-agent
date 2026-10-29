// The posting screen's question, answered (F09). When the screen holds postings for a fact the person has not confirmed it
// asks once ("Will you need visa sponsorship...?") and the reply carries what it asked (meta.screen_ask) and which postings
// wait (meta.screen_held). The person's next message, while that question is the thread's last word, is read here:
//   * the answer becomes a CONFIRMED profile fact in their own words (screen_key + value + the message as evidence), so the
//     screen reads it now, on every later turn, and replaces an older answer for the same key;
//   * the held postings are screened again with it and queued if they pass (the caller's `rerun`), never before;
//   * a message that is not an answer to a question asked (a command, a question, another topic) is left alone: null.
// Nothing is guessed (D-007): a reply that does not clearly answer saves nothing and the question stands.
import { educationLevelOf, type GateResult, placeOf } from "./career_apply_gate.ts";
import { FACT_QUESTIONS, type ScreenFactKey } from "./career_apply_screen.ts";

export interface ScreenAsk { fact: ScreenFactKey; question: string }
export interface HeldPosting { job_id: string | null; company: string; title: string; url: string }

// What the reply keeps for the next turn.
export function screenMeta(screen?: GateResult | null): Record<string, unknown> | null {
  if (!screen?.asks?.length) return null;
  return { screen_ask: screen.asks.map((a) => ({ fact: a.fact, question: a.question })), screen_held: screen.held.map((h) => ({ job_id: h.job_id, company: h.company, title: h.title, url: h.url })) };
}

const YES = /^(?:y|yes|yeah|yep|yup|sure|i do|i would|i will|i need (?:it|that|sponsorship)|definitely|absolutely|correct)\b/i;
const NO = /^(?:n|no|nope|nah|i do not|i don'?t|i would not|i wouldn'?t|i won'?t|not really|never)\b/i;
const COMMAND = /\b(apply|queue|send|show|list|find|search|cancel|set|draft|write|tell me|remind|what|how|why|who|when|where|can you|could you|please)\b/i;
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const clean = (m: string) => String(m ?? "").replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
const KEYWORD: Record<ScreenFactKey, RegExp> = {
  location: /\b(live|living|reside|based|located|moved|in [A-Z])\b|\b(live|based)\b/i,
  relocation: /\b(relocat\w*|move|moving|remote only|in[- ]office|on[- ]?site)\b/i,
  sponsorship: /\b(sponsor\w*|visa|h-?1b|opt|work permit|authori[sz]ed)\b/i,
  citizenship: /\b(citizen\w*|green card|permanent resident|national)\b/i,
  years_experience: /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\+?\s*(?:years?|yrs?)\b/i,
  education_level: /\b(bachelor\w*|master\w*|ph\.?d|doctorate|mba|degree|associate|high school|ged|b\.?s|m\.?s|b\.?a|b\.?tech)\b/i,
};
export interface Parsed { value: string | number; text: string }

// One question, one message (or one clause of it). `alone` is true when this question is the only one open, so a bare
// yes / no / place / number answers it; with several open, a clause must name its subject.
export function parseScreenAnswer(fact: ScreenFactKey, raw: string, alone: boolean): Parsed | null {
  const m = clean(raw).replace(/[.!]+$/, "");
  if (!m || m.length > 200) return null;
  const named = KEYWORD[fact].test(m);
  if (!alone && !named) return null;
  const lead = (re: RegExp) => re.test(m);
  switch (fact) {
    case "location": {
      if (/\?/.test(m) || (COMMAND.test(m) && !/\b(live|based|located|reside)\b/i.test(m))) return null;
      if (/\b(want|prefer|looking|seeking|relocat\w*|remote|interested|work in)\b/i.test(m)) return null;
      const stripped = placeOf(m).replace(/^(?:i'?m|i am)\s+(?:in|from)\s+/i, "").replace(/\s+and\s+(?:no|yes|i)\b.*$/i, "").trim();
      if (!/^[A-Za-z][A-Za-z.' -]*(?:,\s*[A-Za-z][A-Za-z.' -]*)*$/.test(stripped) || stripped.length > 60 || stripped.split(/\s+/).length > 6) return null;
      if (/\b(yes|no|nope|yeah|ok|okay|sure|thanks|thank you|hi|hello|hey|maybe)\b/i.test(stripped)) return null;
      return { value: stripped, text: `Lives in ${stripped}` };
    }
    case "relocation": {
      if (lead(NO) || /\b(not|n't|never|won'?t)\b[^.]*\b(relocat\w*|move)\b|\bno relocation\b/i.test(m)) return { value: "no", text: "Not open to relocating" };
      if (lead(YES) || /\b(open|willing|happy|able)\b[^.]*\b(relocat\w*|move)\b|\bwould (?:relocate|move)\b/i.test(m)) return { value: m, text: `Open to relocating: ${m}` };
      return null;
    }
    case "sponsorship": {
      if (/\b(do not|don'?t|won'?t|will not|never|no longer)\b[^.]*\bneed\b|\bno\b[^.]*\bsponsor|\bwithout sponsor|\bnot needed\b/i.test(m) || (alone && lead(NO))) return { value: "no", text: "Does not need visa sponsorship" };
      if (/\b(need|needs|require|will need|would need)\b/i.test(m) || (alone && lead(YES))) return { value: "yes", text: "Needs visa sponsorship" };
      return null;
    }
    case "citizenship": {
      if (/\b(non|not)[- ]?(?:an? )?(?:u\.?s\.?|american)\s+citizen|\b(green card|permanent resident)\b/i.test(m)) return { value: "no", text: "Not a US citizen" };
      if (/\b(?:u\.?s\.?|american|united states)\s+citizen\b/i.test(m) && !/\b(not|n't|non)\b/i.test(m)) return { value: "yes", text: "US citizen" };
      const c = /\bcitizen(?:ship)?\s+of\s+([A-Za-z][A-Za-z ]{1,30})/i.exec(m);
      if (c) return { value: c[1].trim(), text: `Citizen of ${c[1].trim()}` };
      if (alone && lead(NO)) return { value: "no", text: "Not a US citizen" };
      if (alone && lead(YES)) return { value: "yes", text: "US citizen" };
      return null;
    }
    case "years_experience": {
      if (/\?/.test(m)) return null;
      const w = m.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b/g, (x) => String(NUM_WORDS[x]));
      const n = /\b(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)?\b/.exec(w);
      if (!n || (!named && !/^(?:about|around|roughly|almost|nearly|just over|over)?\s*\d{1,2}(?:\.\d)?\s*\+?$/.test(w.replace(/\byears?\b/, "").trim()))) return null;
      const v = Number(n[1]);
      if (!(v >= 0 && v <= 50)) return null;
      return { value: v, text: `${v} years of professional experience` };
    }
    case "education_level": {
      if (/\?/.test(m)) return null;
      const lvl = educationLevelOf(m.replace(/\bexpected\b/gi, "")) ?? (/\b(finishing|finish|expected)\b/i.test(m) ? educationLevelOf(m.replace(/\b(pursuing|expected|finishing|currently)\b/gi, "")) : null);
      return lvl ? { value: lvl, text: `Highest degree: ${lvl.replace("_", " ")}` } : null;
    }
  }
}

// The several questions one message may answer ("Austin, TX; no relocation; I need sponsorship"): clause by clause.
export function parseScreenAnswers(asks: ScreenFactKey[], message: string): { fact: ScreenFactKey; parsed: Parsed }[] {
  if (asks.length === 1) { const p = parseScreenAnswer(asks[0], message, true); return p ? [{ fact: asks[0], parsed: p }] : []; }
  const out: { fact: ScreenFactKey; parsed: Parsed }[] = [];
  const clauses = clean(message).split(/\s*(?:[;\n]|\.\s|,\s*(?=(?:and\s+)?(?:i\b|no\b|yes\b|not\b)))|\s+and\s+(?=i\b|no\b|not\b)/i).filter(Boolean);
  for (const fact of asks) {
    for (const c of clauses) { const p = parseScreenAnswer(fact, c, false); if (p) { out.push({ fact, parsed: p }); break; } }
  }
  return out;
}

// Save the answer as a confirmed profile fact (replacing the earlier answer to the same question).
export interface ProfileLike { facts?: any[] }
export function saveScreenFact(profile: ProfileLike, addFact: (profile: any, input: any) => any, fact: ScreenFactKey, parsed: Parsed, message: string, at: string): any {
  profile.facts = (profile.facts ?? []).filter((f: any) => !(f && f.screen_key === fact));
  const kind = fact === "location" ? "location" : fact === "relocation" ? "preference" : fact === "sponsorship" || fact === "citizenship" ? "eligibility" : "profile";
  return addFact(profile, { kind, text: parsed.text, value: parsed.value, screen_key: fact, source: "screen_answer", evidence: [clean(message).slice(0, 200)], answered_at: at, needs_confirmation: false, status: "confirmed" });
}

export interface ScreenAnswerResult {
  reply: string; status: string; intent: string;
  saved: { fact: ScreenFactKey; value: string | number }[];
  meta?: Record<string, unknown>;
  pending?: undefined; answers?: undefined;
}
export interface ScreenAnswerDeps {
  message: string; now: number;
  last: { intent: string | null; meta: Record<string, any> } | null; // the thread's last assistant reply
  profile: ProfileLike; addFact: (profile: any, input: any) => any;
  // Screen the held postings again with the saved answers and queue those that pass; the caller's apply turn.
  rerun?: (held: HeldPosting[]) => Promise<{ reply: string; status: string; intent: string; screen?: GateResult } | null>;
}
const LABEL: Record<ScreenFactKey, string> = { location: "where you live", relocation: "relocation", sponsorship: "visa sponsorship", citizenship: "citizenship", years_experience: "years of experience", education_level: "your degree" };
export async function screenAnswerTurn(o: ScreenAnswerDeps): Promise<ScreenAnswerResult | null> {
  const asked = ((o.last?.meta?.screen_ask ?? []) as ScreenAsk[]).filter((a) => a && a.fact in FACT_QUESTIONS);
  if (!asked.length) return null;
  const facts = [...new Set(asked.map((a) => a.fact))];
  const msg = clean(o.message);
  const answers = parseScreenAnswers(facts, msg);
  const intent = o.last?.intent ?? "career_apply_queue";
  if (!answers.length) {
    // A bare yes / no with several questions open is an answer to none of them: say which, keep the questions.
    if (facts.length > 1 && (YES.test(msg) || NO.test(msg)) && msg.split(/\s+/).length <= 3) {
      return { reply: `That was a few questions, so I don't know which one that answers. ${asked.map((a) => a.question).join(" ")} Answer them in one message, for example "${exampleFor(facts)}".`, status: "which", intent, saved: [], meta: { screen_ask: asked, screen_held: o.last?.meta?.screen_held ?? [] } };
    }
    return null;
  }
  const at = new Date(o.now).toISOString();
  const saved: { fact: ScreenFactKey; value: string | number }[] = [];
  for (const a of answers) { saveScreenFact(o.profile, o.addFact, a.fact, a.parsed, msg, at); saved.push({ fact: a.fact, value: a.parsed.value }); }
  const said = answers.map((a) => `${LABEL[a.fact]}: ${a.parsed.text.replace(/^Lives in /, "").replace(/^Highest degree: /, "")}`).join("; ");
  const held = (o.last?.meta?.screen_held ?? []) as HeldPosting[];
  const left = asked.filter((a) => !saved.some((s) => s.fact === a.fact));
  const lead = `Saved (${said}). Tell me if that's wrong and I'll change it.`;
  const re = held.length && o.rerun ? await o.rerun(held) : null;
  if (re) {
    const meta = screenMeta(re.screen) ?? undefined;
    return { reply: `${lead} ${re.reply}`.trim(), status: re.status, intent: re.intent, saved, ...(meta ? { meta } : {}) };
  }
  if (left.length) return { reply: `${lead} Still open: ${left.map((a) => a.question).join(" ")}`, status: "asking", intent, saved, meta: { screen_ask: left, screen_held: held } };
  return { reply: lead, status: "saved", intent, saved };
}
const exampleFor = (facts: ScreenFactKey[]) => facts.map((f) => ({ location: "I live in Austin, TX", relocation: "I would not relocate", sponsorship: "I do not need sponsorship", citizenship: "I am not a US citizen", years_experience: "3 years of experience", education_level: "bachelor's degree" }[f])).join("; ");
