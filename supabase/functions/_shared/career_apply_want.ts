// WO-066: from chat to applying. When the person asks Trainee to apply, the brain puts real postings into the person's
// own apply queue (career_apply_wanted); the Trainee extension takes them, prepares each in the person's browser and
// shows a card; nothing reaches an employer before they approve that card. A posting is keyed exactly as the extension
// keys it (posting_key.ts), so the same posting is queued once and the extension's own queue never holds it twice.
import { applyUrl, detectPortal, formUrlFor, postingKey } from "./posting_key.ts";
import { COMPANY_COOLDOWN_DAYS, dailyLimit, type Limits, normCompany } from "./career_apply.ts";
import { sameCompany, type TrackedApp } from "./career_mail.ts";

export interface Want { posting_key: string; url: string; company: string; title: string; queued_at: string }
export interface WantRow extends Want { state: "waiting" | "taken" }
export interface WantStore {
  put(userId: string, items: Want[]): Promise<{ added: Want[]; already: string[] }>;
  list(userId: string): Promise<WantRow[]>;
  queuedSince(userId: string, sinceIso: string): Promise<number>;
}

const NEVER = /(^|\.)(linkedin\.com|indeed\.com)$/i;
const host = (url: string) => { try { return new URL(url).hostname; } catch { return ""; } };

export interface Pick { url?: string; job_id?: string; company?: string; title?: string; location?: string }
// WO-091b: a refused pick names the posting and the reason, so the model says exactly what happened. `url` and `why` are
// the same refusal in WO-066's words, kept for its callers.
export interface Refusal { posting: { job_id: string | null; company: string; title: string; url: string }; reason: string; url: string; why: string }
export function refusal(p: Pick, reason: string): Refusal {
  const url = String(p?.url ?? "").trim();
  return { posting: { job_id: p?.job_id ? String(p.job_id) : null, company: String(p?.company ?? ""), title: String(p?.title ?? ""), url }, reason, url, why: reason };
}

// The postings the brain picked, kept when each is a real application link the extension can open; refused with why.
export function wantsFrom(picks: Pick[], now: number): { ok: Want[]; refused: Refusal[] } {
  const ok: Want[] = [], refused: Refusal[] = [], seen = new Set<string>();
  for (const p of picks) {
    // WO-078: a shelf posting is queued at its board's own form, whatever its public link (an employer's careers page).
    const url = formUrlFor(String(p?.job_id ?? "")) ?? String(p?.url ?? "").trim();
    if (NEVER.test(host(url))) { refused.push(refusal({ ...p, url }, "LinkedIn and Indeed are never automated; the person applies there themselves")); continue; }
    const key = detectPortal(url) ? postingKey(url) : null;
    if (!key) { refused.push(refusal({ ...p, url }, "not a Greenhouse, Lever, Ashby or Workday posting link the extension can open")); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    ok.push({ posting_key: key, url: applyUrl(url), company: String(p.company ?? "").slice(0, 200), title: String(p.title ?? "").slice(0, 200), queued_at: new Date(now).toISOString() });
  }
  return { ok, refused };
}

// The start of the person's day (UTC when the zone is unknown), for the daily limit.
export function dayStart(now: number, tz = "UTC"): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(now));
    const n = (t: string) => Number(parts.find((x) => x.type === t)?.value);
    const sinceMidnight = ((n("hour") % 24) * 3600 + n("minute") * 60 + n("second")) * 1000;
    return new Date(now - sinceMidnight - (now % 1000)).toISOString();
  } catch {
    return new Date(now - (now % 86_400_000)).toISOString();
  }
}

// Queue what fits under today's limit; what is over is refused with the limit named.
// uncapped (owner, 2026-10-22: no cap on how many applications a person queues): no daily room is computed and nothing is
// refused for volume; the once-per-employer screen, the exact-payload approval on each card and the site limits stand.
export async function queueWants(store: WantStore, userId: string, picks: Pick[], now: number, o: { limits?: Limits; tz?: string; uncapped?: boolean } = {}) {
  const { ok, refused } = wantsFrom(picks, now);
  const cap = o.uncapped ? Infinity : dailyLimit(o.limits);
  const used = o.uncapped ? 0 : await store.queuedSince(userId, dayStart(now, o.tz));
  const room = Math.max(0, cap - used);
  const have = new Set((await store.list(userId)).map((w) => w.posting_key));
  const fresh = ok.filter((w) => !have.has(w.posting_key));
  const take = fresh.slice(0, room);
  for (const w of fresh.slice(room)) refused.push(refusal({ ...w, job_id: w.posting_key }, `over today's limit of ${cap} applications`));
  const r = await store.put(userId, take);
  return { queued: r.added.length, already: ok.length - fresh.length + r.already.length, items: r.added, refused, limit: o.uncapped ? null : cap };
}

// ------------------------------------------------------------------------------------------------ WO-091b: what a pick means
// Audit chat-brain F2 (BR-023, BR-018, BR-019, BR-021): the model's picks were queued as given. Code now checks what each
// one means before it reaches the queue; the extension's card stays the approval of each application.

// Each pick is resolved by its job_id (or its link's own posting key, the same id) through the postings on file, and its
// employer, title and link come from that record, never from the model. One not on file, or closed, is refused. With no
// posting reader (a caller that has none), the picks stay as given.
export async function resolvePicks(picks: Pick[], get?: ((jobId: string) => Promise<any | null>) | null): Promise<{ ok: Pick[]; refused: Refusal[] }> {
  if (!get) return { ok: picks, refused: [] };
  const ok: Pick[] = [], refused: Refusal[] = [];
  for (const p of picks) {
    const id = String(p?.job_id ?? "").trim() || (p?.url ? postingKey(String(p.url)) ?? "" : "");
    const rec = id ? await get(id) : null;
    if (!rec) {
      refused.push(refusal(p, "not found among the postings on file (it may have closed, or was never listed); nothing was queued for it. Search again, or the person can paste its link into the Trainee extension's queue themselves"));
      continue;
    }
    const real: Pick = { job_id: String(rec.job_id ?? id), url: String(rec.url || p.url || ""), company: String(rec.company ?? ""), title: String(rec.title ?? ""), location: String(rec.location ?? "") };
    if (rec.closed_at) { refused.push(refusal(real, `${real.title} at ${real.company} has closed; nothing was queued for it`)); continue; }
    ok.push(real);
  }
  return { ok, refused };
}

// Employer names compared without case, punctuation or "Inc"/"LLC" (career_apply.ts normCompany, the queue's own rule).
// A one-word stand-in for a longer name ("Copperline" for "Copperline Infra") counts only when that word is distinctive.
const COMMON = new Set(("new first general american national united global international data remote software systems digital health bank capital " +
  "financial solutions services technologies technology tech labs energy home city state north south east west central operations jobs job analyst " +
  "engineer engineering grad senior junior early career careers role roles apply platform product design sales marketing research open big blue red " +
  "green smart true next one all best great pacific atlantic summit peak bright clear prime core cloud network media partners consulting associates " +
  "ventures foods insurance medical care community remote work part time full").split(" "));
const words = (s: unknown) => normCompany(s).split(" ").filter(Boolean);
export function namesEmployer(text: unknown, company: unknown): boolean {
  const co = words(company), t = words(text);
  if (!co.length || !t.length) return false;
  if (` ${t.join(" ")} `.includes(` ${co.join(" ")} `)) return true;
  for (let n = 1; n <= Math.min(4, co.length + 1); n++) {
    for (let i = 0; i + n <= t.length; i++) {
      const g = t.slice(i, i + n);
      if (n === 1 && (g[0].length < 4 || COMMON.has(g[0]))) continue;
      if (sameCompany(g.join(" "), co.join(" "))) return true;
    }
  }
  return false;
}
// The employers a message names after "at" ("the operations role at Quickhire Remote Jobs"), capitalized as names are.
export function employersNamed(message: string): string[] {
  const out: string[] = [];
  for (const clause of String(message ?? "").split(/[!?;,\n]|\.(?=\s|$)/)) {
    for (const m of clause.matchAll(/\bat\s+((?:[A-Z][\w&.'’-]*)(?:[ \t]+(?:[A-Z][\w&.'’-]*|&|of|and))*)/g)) {
      const name = m[1].replace(/(\s+(and|of|&))+$/i, "").trim();
      if (name) out.push(name);
    }
  }
  return out;
}
// A pick by position from what was shown ("the first one", "#2", "1 and 3", "these"): it must be one the previous turn
// showed. A broad ask ("apply me to 25 data analyst jobs") leaves the employers to the search. Anything else that names
// no employer ("the operations role", "yes") refers to what was shown too.
const BY_POSITION = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last (one|two|three|\d+)|top (one|two|three|four|five|\d+)|both|these|those|them|all of (them|these|those)|above|you (showed|listed|found|sent))\b|#\s?\d+\b|\b(number|no\.)\s?\d+\b|\b\d+(st|nd|rd|th)\b|\b\d+\s*(,|and|&)\s*\d+\b/i;
const BROAD = /\b(\d+|a few|some|several|all|any|every|more|many)\b|\b(jobs|roles|positions|postings|openings|internships)\b/i;

// A confirmed fact (D-007) that says the person works at this employer now. Drafts, past jobs and wishes do not count.
const NOW_WORDS = /\b(current(ly)?|presently|present|now|still|i work|i'?m working|i am working|i'?m employed|i am employed|works? (at|for)|working (at|for)|employed (at|by))\b/i;
const PAST_WORDS = /\b(former(ly)?|previous(ly)?|used to|ex|left|until|interned|worked|was|were)\b/i;
const WISH_WORDS = /\b(want|wants|hope|goal|dream|would like|aspire|target|interested)\b/i;
export function currentEmployerFact(company: string, facts: any[]): any | null {
  return (facts ?? []).find((f) => {
    if (!f || f.needs_confirmation || f.status === "draft") return false;
    const text = String(f.text ?? f.value ?? "");
    if (f.key === "current_employer" || f.kind === "current_employer") return namesEmployer(text, company);
    if (["goal", "preference", "skill", "education", "location"].includes(String(f.kind))) return false;
    return NOW_WORDS.test(text) && !PAST_WORDS.test(text) && !WISH_WORDS.test(text) && namesEmployer(text, company);
  }) ?? null;
}
// Their knowing go-ahead, in their own words this turn ("I know I work there, apply anyway").
const GO_AHEAD = /\b(anyway|regardless|even though|internal(ly)?|knowing|i know (i|it|that|they|this))\b/i;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const SOURCE: Record<string, string> = { tracker: "in their tracker", queue: "through Trainee", mail: "found in their mail" };
// D-011: one application per company per 30 days. Their applications from every source the server reads (the tracker in
// every thread and Trainee's own sends: mail.applications, as where_do_i_stand reads them). "Saved" was never sent.
export function recentApplication(company: string, apps: TrackedApp[], now: number): TrackedApp | null {
  const window = COMPANY_COOLDOWN_DAYS * 86400_000;
  const at = (a: TrackedApp) => Date.parse(String(a.applied_at ?? ""));
  return (apps ?? [])
    .filter((a) => a && a.stage !== "Saved" && (normCompany(a.company) === normCompany(company) || sameCompany(a.company, company)))
    .filter((a) => !Number.isFinite(at(a)) || now - at(a) < window)
    .sort((a, b) => (Number.isFinite(at(b)) ? at(b) : Infinity) - (Number.isFinite(at(a)) ? at(a) : Infinity))[0] ?? null;
}

// Each resolved pick, checked against what the person said this turn (`message`), what the previous turn showed them
// (`before`; undefined when the caller has no history), their applications and their confirmed facts.
export function screenPicks(picks: Pick[], o: { message?: string; before?: string; apps: TrackedApp[]; facts: any[]; now: number }): { ok: Pick[]; refused: Refusal[] } {
  const ok: Pick[] = [], refused: Refusal[] = [];
  const message = o.message ?? "";
  const named = o.message === undefined ? [] : employersNamed(message);
  const byReference = o.message !== undefined && (BY_POSITION.test(message) || !BROAD.test(message));
  for (const p of picks) {
    const co = String(p.company ?? ""), what = `${p.title || "this posting"} at ${co || "an employer not on record"}`;
    if (o.message !== undefined && !namesEmployer(message, co)) {
      if (named.length && !named.some((n) => namesEmployer(n, co))) {
        refused.push(refusal(p, `${what} is not the employer they named (${named.join(", ")}); nothing was queued for it. Search for ${named[0]}, or ask them for its link`));
        continue;
      }
      if (!named.length && byReference && o.before !== undefined && !namesEmployer(o.before, co)) {
        refused.push(refusal(p, `they did not name ${co || "this employer"}, and ${what} was not among the postings shown to them last turn; nothing was queued for it. Ask which posting they mean`));
        continue;
      }
    }
    const job = currentEmployerFact(co, o.facts);
    if (job && !GO_AHEAD.test(message)) {
      refused.push(refusal(p, `${co} is their current employer (their confirmed fact: "${String(job.text ?? job.value ?? "").slice(0, 160)}"); nothing was queued. Ask them first, and queue it only if they say to go ahead knowing that`));
      continue;
    }
    const prior = recentApplication(co, o.apps, o.now);
    if (prior) {
      const t = Date.parse(String(prior.applied_at ?? ""));
      const when = Number.isFinite(t) ? `on ${isoDay(t)}` : "(date not on record)";
      const next = Number.isFinite(t) ? `; the first day they can apply there again is ${isoDay(t + COMPANY_COOLDOWN_DAYS * 86400_000)}` : "";
      refused.push(refusal(p, `they already applied to ${prior.company}${prior.role ? ` (${prior.role})` : ""} ${when}, ${SOURCE[prior.source] ?? "on record"} (stage: ${prior.stage}). Trainee applies once per company every ${COMPANY_COOLDOWN_DAYS} days${next}; nothing was queued`));
      continue;
    }
    ok.push(p);
  }
  return { ok, refused };
}

export function memoryWantStore(): WantStore & { dump(): Record<string, WantRow[]> } {
  const rows: Record<string, WantRow[]> = {};
  return {
    async put(userId, items) {
      const mine = (rows[userId] ??= []);
      const added: Want[] = [], already: string[] = [];
      for (const w of items) {
        if (mine.some((x) => x.posting_key === w.posting_key)) { already.push(w.posting_key); continue; }
        mine.push({ ...w, state: "waiting" });
        added.push(w);
      }
      return { added, already };
    },
    async list(userId) { return (rows[userId] ?? []).map((w) => ({ ...w })); },
    async queuedSince(userId, sinceIso) { return (rows[userId] ?? []).filter((w) => w.queued_at >= sinceIso).length; },
    dump() { return JSON.parse(JSON.stringify(rows)); },
  };
}

// Service role, acting for the person whose chat this is: writes go through career_apply_want_put_for only.
export function supabaseWantStore(admin: any): WantStore {
  return {
    async put(userId, items) {
      if (!items.length) return { added: [], already: [] };
      const { data, error } = await admin.rpc("career_apply_want_put_for", { p_user: userId, p_items: items });
      if (error) throw new Error(`the apply queue could not be saved: ${error.message}`);
      const keys = new Set<string>((data?.added ?? []) as string[]);
      return { added: items.filter((w) => keys.has(w.posting_key)), already: items.filter((w) => !keys.has(w.posting_key)).map((w) => w.posting_key) };
    },
    async list(userId) {
      const { data, error } = await admin.from("career_apply_wanted").select("posting_key,url,company,title,queued_at,state").eq("user_id", userId).order("queued_at", { ascending: true }).limit(500);
      if (error) throw new Error(`the apply queue could not be read: ${error.message}`);
      return (data ?? []) as WantRow[];
    },
    async queuedSince(userId, sinceIso) {
      const { count, error } = await admin.from("career_apply_wanted").select("posting_key", { count: "exact", head: true }).eq("user_id", userId).gte("queued_at", sinceIso);
      if (error) throw new Error(`the apply queue could not be read: ${error.message}`);
      return count ?? 0;
    },
  };
}
