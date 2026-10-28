// V1 TEXTING VOICE (2026-10-27): channel-native delivery. How a reply looks and arrives on each texting channel, the way a
// person texts: links on their own line, messages split where a person would split them (between paragraphs, list items or
// sentences, never inside a sentence or a link, never a "1/3" counter), no markdown on SMS and iMessage, light formatting
// on WhatsApp and Telegram, a typing indicator while Trainee works, and a quick "on it" when a turn runs long, followed
// by the result. Voice spec: docs/architect/specs/TEXTING-VOICE-2026-10-27.md.
//
// This module only shapes and paces what the existing delivery path already sends (channel_adapters.ts and each adapter,
// the outbox and deliverDue in channel.ts, runInbound in channel_inbound.ts). It is switched on per deploy with
// CAREER_TEXTING_NATIVE=on; off, every adapter renders exactly as before.

export type VoiceChannel = "imessage" | "sms" | "whatsapp" | "telegram" | "web";
export const textingNativeOn = (env: { get(k: string): string | undefined }) => env.get("CAREER_TEXTING_NATIVE") === "on";

const URL_RX = /https?:\/\/[^\s<>()\]"']+/g;
const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, "");

// "Data Analyst at Acme (https://x/1) — Chicago" becomes "Data Analyst at Acme — Chicago" then the link on its own line,
// so it previews and taps cleanly; a markdown link [label](url) becomes the label, then the link.
export function linksOnOwnLine(text: string): string {
  const out: string[] = [];
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => `${label} ${url}`);
    const urls = (line.match(URL_RX) ?? []).map(trimUrl);
    if (!urls.length) { out.push(raw); continue; }
    let rest = line;
    for (const u of urls) rest = rest.split(`(${u})`).join("").split(u).join("");
    rest = rest.replace(/\(\s*\)/g, "").replace(/\s+([,.;:!?—–-])(?=\s|$)/g, "$1").replace(/\s{2,}/g, " ").replace(/\s*[:—–-]\s*$/, "").trim();
    const bare = !rest || /^[-*•\d.)\s]*$/.test(rest);
    if (!bare) out.push(rest);
    for (const u of urls) out.push(u);
  }
  return out.join("\n");
}

// A part counter ("(1/3)", "1/3 ") at the start or end of a line is never sent.
export function stripCounters(text: string): string {
  return String(text ?? "").split("\n").map((l) => l.replace(/^\s*\(?\d+\s*\/\s*\d+\)\s+/, "").replace(/\s+\(\d+\s*\/\s*\d+\)\s*$/, "")).join("\n");
}

// Plain text with no markdown at all (SMS, iMessage). List lines keep a plain "- " or "1. ".
export function stripMarkdown(text: string): string {
  let t = String(text ?? "");
  t = t.replace(/```[a-z]*\n?([\s\S]*?)```/g, "$1");
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s{0,3}>\s?/gm, "");
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1").replace(/~~([^~\n]+)~~/g, "$1");
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1$2").replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1$2");
  t = t.replace(/`([^`\n]+)`/g, "$1").replace(/^(\s*)[*•]\s+/gm, "$1- ");
  return t;
}
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Telegram, with parse_mode HTML: bold, italic and code only (links stay bare on their own line, where Telegram previews
// them). Everything else is escaped, so no text of the person's or an employer's can open a tag.
export function telegramHtml(text: string): string {
  let t = escapeHtml(String(text ?? ""));
  t = t.replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, "<b>$1</b>").replace(/^\s{0,3}&gt;\s?/gm, "");
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/__([^_\n]+)__/g, "<b>$1</b>");
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>");
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/^(\s*)[*•]\s+/gm, "$1- ");
  return t;
}
// The same text without markup, for when Telegram refuses the HTML ("can't parse entities"): sent again as plain text.
export function telegramPlain(html: string): string {
  return String(html ?? "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
// WhatsApp's own formatting: *bold*, _italic_, `code`.
function whatsappMarks(text: string): string {
  return String(text ?? "").replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, "*$1*").replace(/\*\*([^*\n]+)\*\*/g, "*$1*").replace(/__([^_\n]+)__/g, "*$1*").replace(/^(\s*)•\s+/gm, "$1- ");
}

export function formatForChannel(text: string, channel: VoiceChannel): string {
  const base = stripCounters(linksOnOwnLine(String(text ?? "").replace(/<!--[\s\S]*?-->/g, ""))).replace(/\n{3,}/g, "\n\n").trim();
  if (channel === "sms" || channel === "imessage") return stripMarkdown(base);
  if (channel === "whatsapp") return whatsappMarks(base);
  if (channel === "telegram") return telegramHtml(base);
  return base.replace(/^\s{0,3}#{1,6}\s+(.+)$/gm, "**$1**");
}

// Sentences of one line: split after . ! ? (not inside a link, an abbreviation like "e.g." or a number like 2.5).
export function sentences(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const tok of String(line).split(/(\s+)/)) {
    buf += tok;
    if (/[.!?]["”’)]*$/.test(tok) && !/^https?:\/\//.test(tok) && !/^(e\.g|i\.e|etc|vs|mr|ms|mrs|dr|st|no)\.$/i.test(tok) && !/^\d+\.$/.test(tok)) { out.push(buf.trim()); buf = ""; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// Natural splitting: whole paragraphs while they fit; a longer paragraph splits between its lines (list items, links),
// then between sentences; a link is never cut. Only a single sentence longer than a whole message is cut, at a space.
export function splitNatural(text: string, max: number): string[] {
  const clean = stripCounters(String(text ?? "")).trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  // Units in reading order, each with the separator that joins it to the one before when they share a message.
  const units: { s: string; sep: string }[] = [];
  const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  paras.forEach((p, pi) => {
    const paraSep = pi === 0 ? "" : "\n\n";
    if (p.length <= max) { units.push({ s: p, sep: paraSep }); return; }
    p.split("\n").map((l) => l.trim()).filter(Boolean).forEach((l, li) => {
      const lineSep = li === 0 ? paraSep : "\n";
      if (l.length <= max) { units.push({ s: l, sep: lineSep }); return; }
      sentences(l).forEach((s, si) => {
        const pieces = s.length <= max ? [s] : cutAtSpaces(s, max);
        pieces.forEach((x, xi) => units.push({ s: x, sep: si === 0 && xi === 0 ? lineSep : " " }));
      });
    });
  });
  const out: string[] = [];
  let buf = "";
  for (const u of units) {
    if (buf && buf.length + u.sep.length + u.s.length <= max) buf += u.sep + u.s;
    else { if (buf) out.push(buf); buf = u.s; }
  }
  if (buf) out.push(buf);
  return out.map((b) => b.trim()).filter(Boolean);
}
function cutAtSpaces(s: string, max: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (const w of s.split(/(?<=\s)/)) {
    if (buf && (buf + w).length > max) { out.push(buf.trim()); buf = ""; }
    if (w.length > max && !/^https?:\/\//.test(w)) { let r = w; while (r.length > max) { out.push(r.slice(0, max)); r = r.slice(max); } buf = r; } else buf += w;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// What an adapter renders when CAREER_TEXTING_NATIVE is on: split on the reply's own words, then each message formatted
// for its channel (formatting after splitting, so no bold or tag ever spans two messages).
export function nativeRender(channel: VoiceChannel, max: number): (text: string) => string[] {
  return (text: string) => splitNatural(linksOnOwnLine(String(text ?? "").replace(/<!--[\s\S]*?-->/g, "")), max).map((b) => formatForChannel(b, channel)).filter((b) => b.trim());
}

// ---------------------------------------------------------------------------------------------------------------------
// While Trainee works: a typing indicator, refreshed while the turn runs, and one quick acknowledgement when the turn takes
// longer than a few seconds. The ack only says what Trainee is doing now; it never claims a result.

export function ackFor(message: string): string {
  const m = String(message ?? "").toLowerCase();
  if (/\b(find|search|look(ing)? for|show me|any)\b.*\b(jobs?|roles?|openings?|internships?|positions?|postings?)\b|\bjobs?\b.*\bin\b/.test(m)) return "on it — looking for roles now";
  if (/\bapply\b|\bapplications?\b/.test(m) && /\b(status|where|did|go through|heard)\b/.test(m)) return "on it — checking your applications";
  if (/\bapply\b/.test(m)) return "on it — getting that ready";
  if (/\bresume\b|\bcv\b/.test(m)) return "on it — reading that now";
  if (/\b(email|write|draft|message)\b/.test(m)) return "on it — writing that now";
  if (/\b(interview|mock|prep|practice)\b/.test(m)) return "on it — one sec";
  return "on it — one sec";
}

export interface WorkingOptions {
  typing?: (() => Promise<unknown>) | null; // show the indicator once (it lasts a few seconds on the platform)
  typingEveryMs?: number; // refresh it this often while the turn runs (Telegram's lasts 5 s, WhatsApp's 25 s)
  ackAfterMs?: number | null; // send the ack when the turn is still running after this long; null: never
  ack?: (() => Promise<unknown>) | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}
// Runs `work` with the indicator on and the ack armed; whatever happens to them, the turn's own result (or error) is what
// comes back. Returns whether the ack went.
export async function whileWorking<T>(o: WorkingOptions, work: () => Promise<T>): Promise<{ value: T; acked: boolean }> {
  const setT = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = o.clearTimer ?? ((h: unknown) => clearTimeout(h as number));
  let done = false, acked = false;
  const timers: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  const quiet = (p: (() => Promise<unknown>) | null | undefined) => { if (!p) return; try { pending.push(Promise.resolve(p()).catch(() => {})); } catch { /* never fails the turn */ } };
  if (o.typing) {
    quiet(o.typing);
    const every = o.typingEveryMs ?? 4000;
    const tick = () => { if (done) return; quiet(o.typing); timers.push(setT(tick, every)); };
    timers.push(setT(tick, every));
  }
  if (o.ack && o.ackAfterMs !== null && o.ackAfterMs !== undefined && o.ackAfterMs >= 0) {
    timers.push(setT(() => { if (done) return; acked = true; quiet(o.ack); }, o.ackAfterMs));
  }
  try {
    const value = await work();
    return { value, acked };
  } finally {
    done = true;
    for (const t of timers) clearT(t);
    // The ack, if it started, finishes before the result goes, so they arrive in order.
    await Promise.all(pending);
  }
}
