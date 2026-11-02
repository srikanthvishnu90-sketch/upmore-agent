// "I want X roles that pay $Y" (owner, 2026-11-01): the pay a posting states, as numbers, held against the floor the person
// named, and the short reply a texting channel gets (the results themselves live on the hosted page, file_page.ts).
//
// Rules that do not move (reqs Q566, Q672, Q684, Q194, Q435):
//   - pay is only ever what the posting (or the search result) states; nothing is estimated, averaged or filled in;
//   - a floor "pays $X" keeps a role only when its listed pay reaches X; a role that lists no pay is never counted as
//     meeting it: it goes in its own "pay not listed" group, and the reply says how many could not be checked;
//   - pay in another currency, or with no period, is shown in its own terms and never compared with a dollar floor;
//   - a figure converted to the floor's period says so, and how (2,080 hours a year).
import { payFrom } from "./posting_pay.ts";

export const HOURS_PER_YEAR = 2080;
export type Period = "hour" | "month" | "year";
export interface Floor { amount: number; period: "hour" | "year" }
// The pay a posting states, as numbers. period: as the posting states it; null when it states none and the figure could be either
// (a bare "$45"); a bare figure of 10,000 or more is read as a year's salary. currency: as written ("$" alone or USD is USD;
// CA$, C$, CAD, A$, AU$, AUD, €, EUR, £, GBP, ₹, INR, Rs are not). text: the posting's own words, for the attribution.
export interface Pay { min: number; max: number; period: Period | null; currency: string; text: string }
export type PayGroup = "meets" | "unlisted" | "below" | "unchecked";

const CURRENCIES: [RegExp, string][] = [
  [/\bCA?\$|\bCAD\b/i, "CAD"], [/\bAU?\$|\bAUD\b/i, "AUD"], [/\bNZ\$|\bNZD\b/i, "NZD"], [/\bS\$|\bSGD\b/i, "SGD"], [/\bHK\$|\bHKD\b/i, "HKD"], [/\bMX\$|\bMXN\b/i, "MXN"],
  [/€|\bEUR\b/i, "EUR"], [/£|\bGBP\b/i, "GBP"], [/₹|\bINR\b|\bRs\.?\s?\d/i, "INR"], [/\bCHF\b/i, "CHF"], [/¥|\bJPY\b/i, "JPY"],
  [/\$|\bUSD\b/i, "USD"],
];
const SYMBOL: Record<string, string> = { USD: "$", CAD: "CA$", AUD: "A$", NZD: "NZ$", SGD: "S$", HKD: "HK$", MXN: "MX$", EUR: "€", GBP: "£", JPY: "¥" };

// `stated` is the posting's own pay field when it has one; the description is read only when it has none (posting_pay.ts payFrom:
// a wage or salary only, never a funding round or a gift card).
export function parsePay(stated: unknown, description?: unknown): Pay | null {
  const raw = String(stated ?? "").replace(/\s+/g, " ").trim();
  const text = raw && /\d/.test(raw) ? raw : payFrom(description);
  if (!text) return null;
  const currency = CURRENCIES.find(([re]) => re.test(text))?.[1] ?? "unknown";
  if (currency === "INR" && /\d,\d{2},\d{3}/.test(text)) return { min: 0, max: 0, period: null, currency, text }; // lakh grouping: shown as written
  const toks = [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s?([kK])?(?![\d,])/g)].slice(0, 2).map((m) => ({ n: Number(m[1].replace(/,/g, "")), k: !!m[2] })).filter((t) => t.n > 0);
  if (!toks.length) return null;
  // "$90-120k": the k on the upper figure belongs to the lower one too.
  if (toks.length === 2 && toks[1].k && !toks[0].k && toks[0].n < 1000) toks[0].k = true;
  const nums = toks.map((t) => (t.k ? t.n * 1000 : t.n));
  const min = Math.min(...nums), max = Math.max(...nums);
  const period: Period | null = /\b(?:per\s+|an?\s+|\/\s*)?(?:hour|hr|hourly)\b|\/\s*h\b/i.test(text) ? "hour"
    : /\b(?:month|mo|monthly)\b/i.test(text) ? "month"
    : /\b(?:year|yr|annum|annual(?:ly)?|salary)\b/i.test(text) ? "year"
    : max >= 10000 ? "year" : null;
  return { min, max, period, currency, text };
}

const perYear = (n: number, p: Period) => (p === "year" ? n : p === "month" ? n * 12 : n * HOURS_PER_YEAR);
// Where a role stands against the floor. "meets": its listed pay reaches the floor (the top of a range counts; the page says when
// the range starts below it). "unchecked": another currency, or no period stated: shown, never compared. No floor: "meets".
export function payGroup(pay: Pay | null, floor: Floor | null): PayGroup {
  if (!pay) return "unlisted";
  if (pay.currency !== "USD" || !pay.period) return "unchecked";
  if (!floor) return "meets";
  return perYear(pay.max, pay.period) >= perYear(floor.amount, floor.period) ? "meets" : "below";
}
export const startsBelow = (pay: Pay | null, floor: Floor | null) => !!pay && payGroup(pay, floor) === "meets" && !!floor && perYear(pay.min, pay.period!) < perYear(floor.amount, floor.period);

const money = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2));
const thousands = (n: number) => { const k = Math.round(n / 100) / 10; return Number.isInteger(k) ? String(k) : k.toFixed(1); };
const span = (a: string, b: string) => (a === b ? a : `${a}-${b}`);
// One format everywhere (Q566), in the posting's own period and currency: "$30-40/hr", "$5,000/mo", "$90-120k/yr", "CA$60-75k/yr".
// Without a period, or in a currency without a symbol here: the posting's own words.
export function payText(p: Pay): string {
  const sym = SYMBOL[p.currency];
  if (!sym || !p.period) return p.text;
  if (p.period === "hour") return `${sym}${span(money(p.min), money(p.max))}/hr`;
  if (p.period === "month") return `${sym}${span(money(p.min), money(p.max))}/mo`;
  return p.max >= 1000 ? `${sym}${span(thousands(p.min), thousands(p.max))}k/yr` : `${sym}${span(money(p.min), money(p.max))}/yr`;
}
// A figure in another period than the floor's, converted so the two can be compared, and saying how (Q672: an estimate is never
// presented as the employer's figure). Null when nothing was converted (same period, or not compared at all).
export function conversionNote(p: Pay | null, floor: Floor | null): string | null {
  if (!p || !floor || p.currency !== "USD" || !p.period || p.period === floor.period) return null;
  const a = perYear(p.min, p.period), b = perYear(p.max, p.period);
  if (floor.period === "hour") return `≈ $${span(String(Math.round(a / HOURS_PER_YEAR)), String(Math.round(b / HOURS_PER_YEAR)))}/hr, assuming 2,080 hrs/yr`;
  return `≈ $${span(String(Math.round(a / 1000)), String(Math.round(b / 1000)))}k/yr, assuming 2,080 hrs/yr`;
}
export const floorText = (f: Floor) => f.period === "hour" ? `$${money(f.amount)}/hr` : f.amount >= 1000 ? `$${thousands(f.amount)}k` : `$${money(f.amount)}/yr`;

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
  else if (o.meets && o.unlisted) first = `I found ${n(o.meets)} that ${o.meets === 1 ? "lists" : "list"} pay of ${floorText(o.floor)} or more, plus ${o.unlisted} that ${o.unlisted === 1 ? "doesn't" : "don't"} list pay, so I couldn't check ${o.unlisted === 1 ? "it" : "those"}.`;
  else if (o.meets) first = `I found ${n(o.meets)} that ${o.meets === 1 ? "lists" : "list"} pay of ${floorText(o.floor)} or more.`;
  else first = `I found ${n(o.unlisted)}, but ${o.unlisted === 1 ? "it doesn't" : "none of them"} list pay, so I couldn't check ${o.unlisted === 1 ? "it" : "them"} against ${floorText(o.floor)}.`;
  if (o.unchecked) first += ` ${o.unchecked} ${o.unchecked === 1 ? "lists" : "list"} pay in another currency.`;
  return `${first} Here they are by fit, with Apply on each:\n${o.url}`;
}
// The reply may carry nothing a texting app would show as formatting: no markdown emphasis, headings, bullets or link syntax.
export const MARKDOWN = /\*\*|__|^\s*[#>*-]\s|\[[^\]]*\]\([^)]*\)|`/m;
