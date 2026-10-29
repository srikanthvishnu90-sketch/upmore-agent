// Step 4: the guard. Code, not the model, decides which specifics survive. A "specific" is a number (figure, date, year, count) or
// a named thing (employer, program, exam, credential body). It may appear in a brief only if (a) it traces to a retrieved fact
// whose source URL was actually returned by the search, (b) the person said it, or (c) it is a plain general-knowledge term from
// the fixed list in fields.ts. Everything else is dropped by code (D-007).
import { GK_TERMS } from "./fields.ts";
import type { Fact } from "./ground.ts";

const COMMON = new Set(["i", "i'm", "i'll", "i've", "i'd", "a", "an", "the", "this", "that", "these", "those", "it", "if", "in", "on", "at", "to", "for", "of", "and", "or", "but", "so", "as", "by", "with", "from", "your", "you", "you're", "my", "we", "they", "he", "she", "his", "her", "their", "our", "do", "does", "did", "what", "which", "who", "how", "why", "when", "where", "no", "not", "yes", "ask", "use", "get", "take", "keep", "build", "apply", "start", "look", "add", "write", "finish", "check", "learn", "join", "move", "plan", "pick", "practice", "replace", "translate", "update", "target", "choose", "confirm", "complete", "pass", "become", "have", "has", "is", "are", "was", "were", "be", "can", "will", "would", "should", "could", "may", "might", "must", "before", "after", "once", "then", "now", "later", "first", "second", "also", "assuming", "treat", "most", "some", "any", "each", "every", "one", "two", "three", "many", "such", "there", "here", "while", "since", "because", "than", "about", "over", "into", "out", "up", "down", "all", "both", "more", "less", "only", "even", "just", "still", "again", "ever", "never", "always", "often", "usually", "rarely", "sometimes", "hi", "thanks", "thank", "source", "sources", "general", "knowledge", "retrieved", "not", "none", "nothing"]);
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
export const stripNonClaims = (s: string) => s.replace(/\[[^\]]*\]/g, " ").replace(/https?:\/\/\S+/g, " ").replace(/`[^`]*`/g, " ");

export interface Specifics { numbers: string[]; names: string[] }
export function specifics(text: string): Specifics {
  const t = stripNonClaims(text).replace(/\bF-1\b/g, "F").replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "").replace(/\*\*/g, "");
  const numbers = [...t.matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)].map((m) => m[0].replace(/[$,%]/g, "").replace(/\.$/, "")).filter((n) => n.length);
  const names = new Set<string>();
  const re = /[A-Za-z][A-Za-z0-9&'’.-]*/g;
  const words: { w: string; start: boolean }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    words.push({ w: m[0].replace(/[.'’-]+$/, ""), start: /(^|[.?!:"“—–(]|\n)\s*$/.test(t.slice(0, m.index)) });
  }
  for (let i = 0; i < words.length; i++) {
    const { w, start } = words[i];
    if (w.length < 2 || !/^[A-Z]/.test(w)) continue;
    const next = words[i + 1];
    const acronym = /^[A-Z][A-Z0-9&-]{1,}$/.test(w);
    if (start && !acronym && !(next && !next.start && /^[A-Z]/.test(next.w) && !COMMON.has(next.w.toLowerCase()))) continue;
    if (COMMON.has(w.toLowerCase())) continue;
    names.add(w);
  }
  return { numbers: [...new Set(numbers)], names: [...names] };
}
const flat = (s: string) => norm(s).replace(/[$,%]/g, "");
// Does `support` account for every number and name in `text`?
export function unsupported(text: string, support: string, allowGK = true): string[] {
  const sup = flat(support), sp = specifics(text), out: string[] = [];
  for (const n of sp.numbers) if (!new RegExp(`(^|[^0-9.])${n.replace(/\./g, "\\.")}([^0-9]|\\.(?!\\d)|$)`).test(sup)) out.push(n);
  for (const w of sp.names) { const lw = norm(w); if (!sup.includes(lw) && !(allowGK && GK_TERMS.has(lw))) out.push(w); }
  return out;
}

// ---------------------------------------------------------------------------------------------- facts
const norm_url = (u: string) => { try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => /^utm_/i.test(k)).forEach((k) => x.searchParams.delete(k)); x.hash = ""; return x.toString().replace(/\/$/, ""); } catch { return ""; } };
export const sameUrl = (a: string, b: string) => !!norm_url(a) && norm_url(a) === norm_url(b);
export interface Rejected { fact: Partial<Fact>; why: string }
// A retrieved fact stays only if: its URL is one the search returned; it carries a verbatim quote; and every number and name in
// the fact's text is in its quote. The model's paraphrase can drop words but cannot add a figure.
export function acceptFacts(facts: Fact[], returnedUrls: string[]): { kept: Fact[]; rejected: Rejected[] } {
  const kept: Fact[] = [], rejected: Rejected[] = [];
  for (const f of facts) {
    const bad = (why: string) => rejected.push({ fact: f, why });
    if (!f || typeof f.text !== "string" || !f.text.trim()) { bad("empty"); continue; }
    if (!/^https:\/\//i.test(String(f.url ?? ""))) { bad("no https source URL"); continue; }
    if (!returnedUrls.some((u) => sameUrl(u, f.url))) { bad("URL not among the sources the search returned"); continue; }
    if (!f.quote || f.quote.trim().length < 8) { bad("no quote from the source"); continue; }
    if (f.text.length > 320) { bad("too long to verify"); continue; }
    const extra = unsupported(f.text, f.quote, false);
    if (extra.length) { bad(`not in the quote: ${extra.join(", ")}`); continue; }
    kept.push({ ...f, url: norm_url(f.url) || f.url });
  }
  return { kept, rejected };
}

// ---------------------------------------------------------------------------------------------- the finished brief
// What the harness and the tool both ask of a finished brief: every number and name in its body is in a kept fact (text or
// quote), in the person's confirmed or said facts, in the message, or in the general-knowledge list. The sources list and the
// headings are not claims. Returns what is unsourced; empty is the only pass.
export function unsourcedIn(brief: string, support: { facts: Fact[]; person: string[]; message: string }): string[] {
  const body = brief.replace(/^\d+\. S\d+: https?:\/\/.*$/gm, " ").replace(/^#+ .*$/gm, " ").replace(/\[S\d+[^\]]*\]/g, " ").replace(/\(general knowledge[^)]*\)/gi, " ");
  const sup = [...support.facts.flatMap((f) => [f.text, f.quote, f.label]), ...support.person, support.message].join(" \n ");
  const out = new Set<string>();
  for (const line of body.split("\n")) for (const x of unsupported(line, sup)) out.add(x);
  return [...out];
}
