// WO-091a: what the end of an agent turn checks in the model's reply before the person reads it (audit chat-brain F6,
// F10; the claim check, F5, lives in loop.ts and uses the sentence pieces here). The model writes the words; code checks:
//   facts   a sentence about the person (a draft in their voice, or "you/your" with a skill, school, employer, title or
//           number) may say only what traces to their confirmed facts, their own messages or this turn's tool results.
//           The tracing is the essay fact lock (essay_draft.ts factLock, also inside career_outreach.ts outreachLock);
//           this file only picks the sentences and the kinds of words that are claims about the person.
//   leaks   no tool name, raw job id, uuid or JSON field name reaches the person.
// Each finder returns what it found (for the one rewrite the loop asks for) and a fixer applies code's last resort.
import { DEGREES, factLock, factText, norm, SCALE, TITLES, TOOLS } from "../essay_draft.ts";

// ------------------------------------------------------------------------------------------------ sentences
// A reply as sentence pieces with the whitespace after each, so a piece can be dropped or changed and the rest of the
// reply (paragraphs, bullets, a draft's line breaks) rebuilt as it was.
export interface Piece { text: string; sep: string }
export function pieces(reply: string): Piece[] {
  const parts = String(reply ?? "").split(/((?<=[.!?]["”')\]]?)[ \t]+|[ \t]*\n\s*)/);
  const out: Piece[] = [];
  for (let i = 0; i < parts.length; i += 2) out.push({ text: parts[i] ?? "", sep: parts[i + 1] ?? "" });
  return out;
}
const breaks = (s: string) => (s.match(/\n/g) || []).length;
export function rebuild(ps: Piece[], drop: Set<number> = new Set()): string {
  const out: Piece[] = [];
  ps.forEach((p, i) => {
    if (!drop.has(i)) { out.push({ ...p }); return; }
    // A dropped sentence keeps the larger break around it: dropping a paragraph's last sentence keeps the paragraph.
    if (out.length && breaks(p.sep) > breaks(out[out.length - 1].sep)) out[out.length - 1].sep = p.sep;
  });
  const text = out.map((p) => p.text + p.sep).join("");
  return (drop.size ? text.replace(/\n{3,}/g, "\n\n") : text).trim();
}
export const plainQuotes = (s: string) => String(s ?? "").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const URL_RE = /https?:\/\/[^\s)\]>"']+/g;
// Code's own masks while it edits: links are never touched.
function masked(text: string, fn: (t: string) => string): string {
  const kept: string[] = [];
  const t = text.replace(URL_RE, (u) => { kept.push(u); return `\u0000${kept.length - 1}\u0000`; });
  return fn(t).replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}
function tidy(s: string): string {
  return s.replace(/\(\s*\)|\[\s*\]/g, "").replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?)])/g, "$1").replace(/\(\s+/g, "(").replace(/^\s+|\s+$/g, "");
}

// ------------------------------------------------------------------------------------------------ sources
// What a sentence about the person may draw on: confirmed facts (never one waiting for their yes, memory.ts's rule),
// the account's stated facts, this turn's message, their own earlier messages, and this turn's tool results. Never the
// model's own earlier replies.
export function factSources(o: { state: Record<string, unknown>; message: string; history: any[]; results: string[] }): string[] {
  const profile: any = o.state?.profile;
  const facts = (Array.isArray(profile?.facts) ? profile.facts : []).filter((f: any) => f && typeof f === "object" && !f.needs_confirmation && f.status !== "draft" && f.status !== "rejected");
  const sf: any = o.state?.statedFacts;
  const stated = Array.isArray(sf?.facts) ? sf.facts : Array.isArray(sf) ? sf : [];
  const userSaid = (Array.isArray(o.history) ? o.history : []).filter((m: any) => m && m.role === "user").map((m: any) =>
    typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.filter((b: any) => b && b.type === "text").map((b: any) => String(b.text ?? "")).join("\n") : ""
  );
  return [...facts.map(factText), ...stated.map(factText), String(o.message ?? ""), ...userSaid, ...o.results].filter(Boolean);
}

// ------------------------------------------------------------------------------------------------ the fact lock on a reply
// A clause speaks about the person when it says "your …", "my …", "I built/used/led…", "you worked/studied…", "I'm a…"
// or marks something "(confirmed)". A clause that negates or names a gap ("not in your facts", "you don't have") claims
// nothing. A question claims nothing.
const ABOUT = /\b(?:your|yours|my|confirmed)\b|\b(?:gave|taught|earned|got) me\b|\b(?:you|i)(?:'re|'m| are| am| were| was)\s+(?:an?|proficient|skilled|experienced|fluent|certified)\b|\b(?:you|i)(?:'ve| have| had)?\s+(?:built|led|used|managed|developed|created|designed|worked|interned|studied|graduated|majored|minored|earned|completed|shipped|launched|ran|analy[sz]ed|automated|grew|increased|reduced|cut|taught|served|spent|bring|know|hold|have \d)\b/i;
const GAP = /\b(?:not|no|never|none|without|lack|lacking|missing|gaps?|cannot)\b|n't\b/i;
const CLAUSE = /([,;]\s+|\s*[—–]\s*|:\s+|\s+(?:and|but|or|while|whereas)\s+)/;
const MONTHS = /^(?:January|February|March|April|May|June|July|August|September|October|November|December)$/;
// Capitals that are ordinary words, places, formats or products, never a skill the person claims.
const COMMON_CAPS = new Set(["I", "US", "USA", "UK", "EU", "NY", "NYC", "SF", "LA", "DC", "IL", "CA", "TX", "WA", "MA", "GPA", "CS", "AI", "ML", "HR", "PM", "AM", "QA", "OK", "ATS", "PDF", "CSV", "URL", "CV", "FAQ", "ID", "EST", "PST", "CST", "UTC", "TBD", "ASAP", "FYI", "TEST", "SWE", "BS", "BA", "MS", "LinkedIn", "WhatsApp", "iMessage", "YouTube", "iPhone", "Trainee", "Upmore"]);
const inList = (list: string[], u: string) => list.some((w) => norm(w) === norm(u));
const before = (clause: string, w: string) => { const at = clause.search(new RegExp(`(?<![\\w$])${esc(w)}(?![\\w%])`, "i")); return at < 0 ? null : clause.slice(0, at); };
// Each kind of word is a claim about the person only where the clause attributes it to them.
const SKILL_CUE = /\b(?:experience (?:with|in)|skills? (?:in|with)|your|my|used|using|proficient (?:in|with)|knowledge of|worked with|built (?:with|in))\s+(?:[\w+#./-]+\s+){0,2}$/i;
const TITLE_CUE = /\b(?:as an?|i(?:'m| am| was) an?|you(?:'re| are| were) an?|(?:your|my) (?:role|title|job|position|time) (?:as|at)(?: an?)?)\s+(?:[\w-]+\s+){0,3}$/i;
const NUM_UNIT = /^\s*(?:\+\s*)?(?:years?|yrs?|months?|people|engineers|members|students|users|customers|clients|employees|reports|interns|projects)\b/i;
export interface Untraced { word: string; kind: "skill" | "title" | "degree" | "number" | "result" | "month" | "place" }
const PLACEHOLDER: Record<Untraced["kind"], string> = {
  skill: "[your skill]", title: "[your title]", degree: "[your degree]", number: "[number]", result: "[result]", month: "[month]", place: "[employer or school]",
};
// Which of the fact lock's untraced words are claims about the person, and of what kind; the rest (a capitalized word
// opening a clause, "Hiring", "your Fieldnote recruiter", "within 48 hours") is ordinary prose.
function classify(u: string, clause: string): Untraced | null {
  const w = u.replace(/['’]s$/, "").trim();
  const pre = w ? before(clause, w) : null;
  if (!w || pre === null || COMMON_CAPS.has(w)) return null;
  if (inList(TOOLS, w)) return { word: w, kind: "skill" };
  if (/^(?:[A-Za-z]*[a-z][A-Z][A-Za-z0-9]*|[A-Za-z]+\d+[A-Za-z0-9]*|[A-Za-z]+\.(?:js|io|net)|C\+\+|C#|[A-Z]{2,5})$/.test(w)) return SKILL_CUE.test(pre) ? { word: w, kind: "skill" } : null;
  if (inList(DEGREES, w)) return { word: w, kind: "degree" };
  if (inList(TITLES, w)) return TITLE_CUE.test(pre) ? { word: w, kind: "title" } : null;
  if (inList(SCALE, w)) return { word: w, kind: "result" };
  if (MONTHS.test(w)) return { word: w, kind: "month" };
  if (/\d/.test(w)) {
    if (/[$%]|\d\s?(?:k|m|bn|b)$/i.test(w) || /^(?:19|20)\d\d$/.test(w)) return { word: w, kind: "number" };
    return NUM_UNIT.test(clause.slice(pre.length + w.length)) || /\bGPA\s*(?:of\s*)?$/i.test(pre) ? { word: w, kind: "number" } : null;
  }
  // A name is the person's employer or school where the clause puts them there: "interned at X", "graduated from X".
  if (/^[A-Z]/.test(w)) return /\b(?:at|from)\s+(?:the\s+)?$/i.test(pre) ? { word: w, kind: "place" } : null;
  return null;
}
const unbracketed = (s: string) => s.replace(/\[[^\]]*\]/g, (m) => " ".repeat(m.length));
function clauseClaims(clause: string, sources: string[]): Untraced[] {
  const plain = unbracketed(plainQuotes(clause)).replace(URL_RE, " ");
  if (!ABOUT.test(plain) || GAP.test(plain)) return [];
  const out: Untraced[] = [];
  for (const u of factLock(plain, sources).untraced) {
    const c = classify(u, plain);
    if (c && !out.some((x) => norm(x.word) === norm(c.word))) out.push(c);
  }
  return out;
}
const isQuestion = (s: string) => /\?["”')\]]*\s*$/.test(s.trim());
// Every untraced claim about the person in the reply, sentence by sentence.
export function untracedFacts(reply: string, sources: string[]): Untraced[] {
  const out: Untraced[] = [];
  for (const p of pieces(reply)) {
    if (isQuestion(p.text)) continue;
    for (const clause of p.text.split(CLAUSE).filter((_, i) => i % 2 === 0)) {
      for (const c of clauseClaims(clause, sources)) if (!out.some((x) => norm(x.word) === norm(c.word))) out.push(c);
    }
  }
  return out;
}
// Code's last resort: each untraced claim becomes a placeholder the person fills in ("[your skill]"), in the clause
// that makes it, never inside a bracket or a link.
export function bracketUntraced(reply: string, sources: string[]): string {
  const ps = pieces(reply);
  for (const p of ps) {
    if (isQuestion(p.text)) continue;
    const parts = p.text.split(CLAUSE);
    for (let i = 0; i < parts.length; i += 2) {
      const found = clauseClaims(parts[i], sources);
      if (!found.length) continue;
      parts[i] = masked(parts[i], (t) => t.split(/(\[[^\]]*\])/).map((seg, j) => {
        if (j % 2) return seg;
        let s = seg;
        for (const f of found) s = s.replace(new RegExp(`(?<![\\w$])${esc(f.word)}(?![\\w%])`, "gi"), PLACEHOLDER[f.kind]);
        return s;
      }).join(""));
    }
    p.text = parts.join("");
  }
  return rebuild(ps);
}

// ------------------------------------------------------------------------------------------------ internal words
// The tool vocabulary the person must never read: tool names, snake_case field names (job_id, remote_ok, full_name),
// uuids and raw job ids ("greenhouse:copperlineinfra:4100016"). A word the person typed themselves is theirs to read.
const SNAKE = /\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const RAW_ID = /\b[a-z][a-z0-9]*:[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*\b/gi;
export interface Posting { title: string; company: string }
// The postings this turn's tool results named, by every id they gave it.
export function postingsOf(results: string[]): Map<string, Posting> {
  const out = new Map<string, Posting>();
  const walk = (v: any, depth = 0) => {
    if (depth > 6 || v == null || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    const title = typeof v.title === "string" ? v.title : "", company = typeof v.company === "string" ? v.company : "";
    if (title || company) for (const k of ["job_id", "posting_id", "posting_key", "id"]) if (typeof v[k] === "string" && v[k].length >= 4) out.set(v[k], { title, company });
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  for (const r of results) { try { walk(JSON.parse(r)); } catch { /* a plain-text result names no posting */ } }
  return out;
}
const idLike = (id: string) => /[:_-]/.test(id) && id.length >= 6;
function typedWords(typed: string): Set<string> {
  const t = String(typed ?? "").toLowerCase();
  return new Set([...(t.match(SNAKE) || []), ...(t.match(UUID) || []), ...(t.match(RAW_ID) || [])]);
}
export function leakedWords(reply: string, o: { tools: string[]; typed: string; postings: Map<string, Posting> }): string[] {
  const own = typedWords(o.typed);
  const out: string[] = [];
  const add = (w: string) => { if (!own.has(w.toLowerCase()) && !out.includes(w)) out.push(w); };
  const t = String(reply ?? "").replace(URL_RE, " ");
  for (const id of o.postings.keys()) if (idLike(id) && t.includes(id)) add(id);
  for (const re of [RAW_ID, UUID, SNAKE]) for (const m of t.matchAll(re)) add(m[0]);
  for (const name of o.tools) if (/_/.test(name) && new RegExp(`\\b${esc(name)}\\b`).test(t)) add(name);
  return out;
}
// Code's last resort: a known job id becomes "title at company" (or goes, when the sentence already names it), any other
// id goes, and a field or tool name becomes plain words.
export function stripLeaks(reply: string, o: { tools: string[]; typed: string; postings: Map<string, Posting> }): string {
  const own = typedWords(o.typed);
  const ps = pieces(reply);
  for (const p of ps) {
    if (!leakedWords(p.text, o).length) continue;
    p.text = tidy(masked(p.text, (t) => {
      let s = t;
      const ids = [...new Set([...[...o.postings.keys()].filter((id) => idLike(id) && s.includes(id)), ...(s.match(RAW_ID) || []), ...(s.match(UUID) || [])])]
        .filter((id) => !own.has(id.toLowerCase())).sort((a, b) => b.length - a.length);
      for (const id of ids) {
        const known = o.postings.get(id);
        const named = known && known.company && s.toLowerCase().includes(known.company.toLowerCase()) && (!known.title || s.toLowerCase().includes(known.title.toLowerCase()));
        const say = known && !named ? [known.title, known.company].filter(Boolean).join(" at ") : "";
        s = s.split(id).join(say);
      }
      return s.replace(SNAKE, (w) => own.has(w.toLowerCase()) ? w : w.replace(/_/g, " "));
    }));
  }
  return rebuild(ps);
}
