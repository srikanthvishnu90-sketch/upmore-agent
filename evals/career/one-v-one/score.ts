// 1v1 (2026-11-01): the rubric, checked by script (no judge, no model, free). Every scenario's gold reply must pass its
// own rubric (tests/architect/one-v-one-texting.test.ts proves it), so a Trainee failure is a real gap, not a strict check.
//
// What a reply is: the messages the person's phone shows, in order (link-only messages included). The checks follow the
// owner's requirement docs, cited by number only: Q73/Q89 numbered options; Q74/Q581 no markdown on texting channels;
// Q75/Q76/Q91 no filler openers, closers or banned phrases; Q77/Q87/Q88 one to three short sentences a bubble and a few
// bubbles at most; Q79 no emoji; Q94 no internal jargon; Q583-Q585/Q632/Q633 every link is a full URL alone on its own
// line, right after the line that says what it is, and only a link that exists (D-007: nothing invented).
import { findUrls } from "../../../supabase/functions/_shared/channel_text.ts";
import { ALLOWED_LINKS } from "./postings.ts";

export type Channel = "imessage" | "sms" | "whatsapp" | "telegram" | "web";
export const TEXTING: Channel[] = ["imessage", "sms", "whatsapp", "telegram"];

export interface Rubric {
  maxBubbles?: number; // text messages (a message that is only a link is not counted); default 3
  maxBubbleChars?: number; // each text message, links left out; default 320
  maxChars?: number; // all text, links left out; default 480
  maxQuestions?: number; // default 1
  askOne?: boolean; // the reply must ask exactly one question
  links?: number; // at least this many links; default 0
  maxLinks?: number; // default 3
  numbered?: boolean; // options are numbered 1., 2., ... (Q89)
  must?: string[]; // regexes (case-insensitive) that must all match: required facts
  mustNot?: string[]; // regexes that must not match: forbidden claims and invented facts
}

export const CHECKS = ["bubbles", "bubble_len", "length", "markdown", "links_present", "link_format", "links_valid", "questions", "numbered", "facts", "claims", "voice"] as const;
export type Check = typeof CHECKS[number];
export const CHECK_WHAT: Record<Check, string> = {
  bubbles: "too many text bubbles (Q77, Q87, Q88)",
  bubble_len: "a bubble longer than a text (Q77)",
  length: "reply too long overall (Q87, Q88)",
  markdown: "markdown a phone shows raw: **bold**, # headings, tables, [label](url), code fences (Q74, Q581)",
  links_present: "a link the reply needed is missing (Q583, Q587)",
  link_format: "a link not alone on its own line right after the line that says what it is (Q584, Q585, Q632)",
  links_valid: "a link no tool returned and the person did not give (Q633, D-007)",
  questions: "more questions than allowed, or the one needed question missing (one question at most)",
  numbered: "options not numbered (Q73, Q89)",
  facts: "a required fact is missing",
  claims: "a forbidden claim (an action not taken, an invented fact, a wrong promise)",
  voice: "filler opener or closer, banned phrase, emoji, 'as an AI' or internal jargon (Q75, Q76, Q79, Q91, Q94)",
};

const BANNED = [/\bi'?d be happy to\b/i, /\bgreat question\b/i, /^\s*absolutely\b/i, /\blet me know if you need anything( else)?\b/i, /\bi hope this helps\b/i,
  /^\s*(certainly|sure thing|of course)\b/i, /\bthanks for asking\b/i, /\bas an ai\b/i, /\blanguage model\b/i];
// Words from inside the product that mean nothing to the person (Q94).
const JARGON = [/\bpayload\b/i, /\bsource class\b/i, /\bnull\b/, /\bundefined\b/, /\bNaN\b/, /\[object /, /\brouter\b/i, /\bintent\b/i, /\bthe tracker moves\b/i,
  /\bno row\b/i, /\bcompany[- ]file\b/i, /\b20\d\d-\d\d-\d\d\b/, /\bsized by what the sources yield\b/i, /\bheld for your approval\b/i, /\bcontainment\b/i, /\bboundary\b/i];
const EMOJI = /\p{Extended_Pictographic}/u;

const linkOnly = (b: string) => { const t = b.trim(); const u = findUrls(t); return u.length === 1 && u[0].start === 0 && u[0].end === t.length; };
const noUrls = (s: string) => { let out = "", at = 0; for (const u of findUrls(s)) { out += s.slice(at, u.start); at = u.end; } return out + s.slice(at); };
// The text a person reads: Telegram's HTML tags are the platform's formatting, not characters on screen.
export const visible = (b: string, ch: Channel) => ch === "telegram" ? b.replace(/<\/?(b|i|s|u|code|pre|a)( [^>]*)?>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"') : b;

function markdownIn(text: string, ch: Channel): boolean {
  if (/```/.test(text) || /^\s{0,3}#{1,6}\s/m.test(text) || /^\s*\|.*\|\s*$/m.test(text)) return true;
  if (ch === "web") return false;
  return /\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\(https?:\/\//.test(text) || (ch !== "whatsapp" && /(^|\s)\*[^*\s][^*\n]*\*(?=\s|$|[.,!?])/m.test(text)) || /^\s*[*•]\s/m.test(text);
}
function questionCount(text: string): number {
  const t = noUrls(text).replace(/"[^"\n]*"|“[^”\n]*”/g, "");
  return (t.match(/\?/g) || []).length;
}

export interface Graded { pass: boolean; failed: Check[]; why: Partial<Record<Check, string>> }

export function grade(bubbles: string[], ch: Channel, r: Rubric, said = ""): Graded {
  const shown = bubbles.map((b) => visible(String(b ?? ""), ch)).filter((b) => b.trim());
  const text = shown.join("\n");
  const textBubbles = shown.filter((b) => !linkOnly(b));
  const why: Partial<Record<Check, string>> = {};
  const fail = (c: Check, w: string) => { if (!why[c]) why[c] = w; };
  if (!shown.length) fail("bubbles", "no reply");
  const maxB = r.maxBubbles ?? 3;
  if (textBubbles.length > maxB) fail("bubbles", `${textBubbles.length} text bubbles (max ${maxB})`);
  const maxBC = r.maxBubbleChars ?? 320;
  const longest = Math.max(0, ...textBubbles.map((b) => noUrls(b).trim().length));
  if (longest > maxBC) fail("bubble_len", `a bubble of ${longest} chars (max ${maxBC})`);
  const total = noUrls(text).replace(/\s+/g, " ").trim().length;
  if (total > (r.maxChars ?? 480)) fail("length", `${total} chars (max ${r.maxChars ?? 480})`);
  if (markdownIn(text, ch)) fail("markdown", "markdown found");
  const urls = findUrls(text).map((u) => u.url);
  if (urls.length < (r.links ?? 0)) fail("links_present", `${urls.length} links (need ${r.links})`);
  // Each link alone on its line, the line before it says what it is (not a link, not empty), at most maxLinks.
  const lines = shown.flatMap((b) => b.split("\n")).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const u = findUrls(lines[i]);
    if (!u.length) continue;
    if (!linkOnly(lines[i])) { fail("link_format", `a link inside a sentence: "${lines[i].slice(0, 80)}"`); break; }
    if (i === 0 || linkOnly(lines[i - 1])) { fail("link_format", "a link with no line before it saying what it is"); break; }
  }
  if (new Set(urls).size > (r.maxLinks ?? 3)) fail("link_format", `${new Set(urls).size} links (max ${r.maxLinks ?? 3})`);
  {
    const given = new Set(findUrls(said).map((u) => u.url));
    const allowed = ALLOWED_LINKS;
    const bad = urls.filter((u) => !allowed.has(u) && !given.has(u));
    if (bad.length) fail("links_valid", `not from a tool or the person: ${bad[0]}`);
    const q = questionCount(text);
    if (q > (r.maxQuestions ?? 1)) fail("questions", `${q} questions`);
    if (r.askOne && q !== 1) fail("questions", `${q} questions (needs exactly one)`);
    if (r.numbered && !/^\s*1[.)]\s/m.test(text)) fail("numbered", "no numbered list");
    for (const m of r.must ?? []) if (!new RegExp(m, "i").test(text)) { fail("facts", `missing /${m}/`); break; }
    for (const m of r.mustNot ?? []) if (new RegExp(m, "i").test(text)) { fail("claims", `says /${m}/`); break; }
    const first = textBubbles[0] ?? "";
    const v = BANNED.find((b) => b.test(text) || b.test(first)) ?? JARGON.find((j) => j.test(noUrls(text)));
    if (v) fail("voice", `matches ${v}`);
    else if (EMOJI.test(text)) fail("voice", "emoji");
    const failed = CHECKS.filter((c) => why[c]);
    return { pass: failed.length === 0, failed, why };
  }
}
