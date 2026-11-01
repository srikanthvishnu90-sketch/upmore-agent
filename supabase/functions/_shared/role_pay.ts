// "I want X roles that pay $Y" (owner, 2026-11-01): the pay a posting states, as numbers, held against the floor the person
// named, and the short reply a texting channel gets (the results themselves live on the hosted page, file_page.ts).
//
// Rules that do not move (reqs Q566, Q672, Q684, Q194, Q435):
//   - pay is only ever what the posting (or the search result) states; nothing is estimated, averaged or filled in;
//   - a floor "pays $X" keeps a role only when its listed pay reaches X; a role that lists no pay is never counted as
//     meeting it: it goes in its own "pay not listed" group, and the reply says how many could not be checked;
//   - pay in another currency is shown as written and is not compared with a dollar floor.
import { payFrom } from "./posting_pay.ts";

export const HOURS_PER_YEAR = 2080;
export type Period = "hour" | "year";
export interface Floor { amount: number; period: Period }
export interface Pay { lo: number; hi: number; period: Period; usd: boolean; text: string }
export type PayGroup = "meets" | "unlisted" | "below" | "unchecked";

// The pay a posting states, read into numbers. `stated` is the posting's own pay field when it has one; the description is read
// only when it has none (posting_pay.ts payFrom: a wage or salary only, never a funding round or a gift card).
export function parsePay(stated: unknown, description?: unknown): Pay | null {
  const raw = String(stated ?? "").replace(/\s+/g, " ").trim();
  const text = raw && /\d/.test(raw) ? raw : payFrom(description);
  if (!text) return null;
  const usd = !/[€£]|\b(?:EUR|GBP|CAD|AUD|INR)\b/i.test(text);
  const nums = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?(k)?\b/gi)].map((m) => Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1)).filter((n) => n > 0);
  if (!nums.length) return null;
  const hourly = /hour|\bhr\b|\/\s*h\b|hourly/i.test(text);
  const period: Period = hourly ? "hour" : /month|\bmo\b/i.test(text) ? "year" : nums[0] < 500 ? "hour" : "year";
  const monthly = /month|\bmo\b/i.test(text);
  const scale = monthly ? 12 : 1;
  const lo = Math.min(...nums.slice(0, 2)) * scale, hi = Math.max(...nums.slice(0, 2)) * scale;
  return { lo, hi, period, usd, text };
}

const perYear = (n: number, p: Period) => (p === "year" ? n : n * HOURS_PER_YEAR);
// Where a role stands against the floor. "meets": its listed pay reaches the floor (the top of a range counts; the page says when
// the range starts below it). No floor: every role with a dollar figure "meets".
export function payGroup(pay: Pay | null, floor: Floor | null): PayGroup {
  if (!pay) return "unlisted";
  if (!pay.usd) return "unchecked";
  if (!floor) return "meets";
  return perYear(pay.hi, pay.period) >= perYear(floor.amount, floor.period) ? "meets" : "below";
}
export const startsBelow = (pay: Pay | null, floor: Floor | null) => !!pay && pay.usd && !!floor && perYear(pay.lo, pay.period) < perYear(floor.amount, floor.period);

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
// One format everywhere (Q566): "$30-40/hr", "$30/hr", "$90-120k", "$95k". Another currency: as the posting writes it.
export function payText(p: Pay): string {
  if (!p.usd) return p.text;
  if (p.period === "hour") return p.lo === p.hi ? `$${money(p.lo)}/hr` : `$${money(p.lo)}-${money(p.hi)}/hr`;
  const k = (n: number) => (n >= 1000 ? `${money(Math.round(n / 100) / 10)}` : money(n));
  const unit = p.hi >= 1000 ? "k" : "";
  return p.lo === p.hi ? `$${k(p.lo)}${unit}` : `$${k(p.lo)}-${k(p.hi)}${unit}`;
}
export const floorText = (f: Floor) => f.period === "hour" ? `$${money(f.amount)}/hr` : f.amount >= 1000 ? `$${money(Math.round(f.amount / 100) / 10)}k` : `$${money(f.amount)}/yr`;

// ---------------------------------------------------------------- the reply on a texting channel
// SMS, iMessage and WhatsApp (reqs Q74, Q584, Q585, Q620): plain text only (no markdown, no bullets, no bold), one or two short
// sentences that answer on their own, then the link alone on its own line, introduced by the sentence before it.
export const TEXTING = new Set(["sms", "imessage", "whatsapp"]);
export interface What { one: string; many: string }
export function resultsReply(o: { what: What; floor: Floor | null; meets: number; unlisted: number; unchecked?: number; url: string }): string {
  const total = o.meets + o.unlisted + (o.unchecked ?? 0);
  const n = (k: number) => `${k} ${k === 1 ? o.what.one : o.what.many}`;
  let first: string;
  if (!o.floor) first = `I found ${n(total)}.`;
  else if (o.meets && o.unlisted) first = `I found ${n(o.meets)} that ${o.meets === 1 ? "lists" : "list"} pay of ${floorText(o.floor)} or more, plus ${o.unlisted} that don't list pay, so I couldn't check ${o.unlisted === 1 ? "it" : "those"}.`;
  else if (o.meets) first = `I found ${n(o.meets)} that ${o.meets === 1 ? "lists" : "list"} pay of ${floorText(o.floor)} or more.`;
  else first = `I found ${n(o.unlisted)}, but ${o.unlisted === 1 ? "it doesn't" : "none of them"} list pay, so I couldn't check ${o.unlisted === 1 ? "it" : "them"} against ${floorText(o.floor)}.`;
  if (o.unchecked) first += ` ${o.unchecked} ${o.unchecked === 1 ? "lists" : "list"} pay in another currency.`;
  return `${first} Here they are by fit, with Apply on each:\n${o.url}`;
}
// The reply may carry nothing a texting app would show as formatting: no markdown emphasis, headings, bullets or link syntax.
export const MARKDOWN = /\*\*|__|^\s*[#>*-]\s|\[[^\]]*\]\([^)]*\)|`/m;
