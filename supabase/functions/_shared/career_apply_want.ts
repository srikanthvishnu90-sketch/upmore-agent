// WO-066: from chat to applying. When the person asks Trainee to apply, the brain puts real postings into the person's
// own apply queue (career_apply_wanted); the Trainee extension takes them, prepares each in the person's browser and
// shows a card; nothing reaches an employer before they approve that card. A posting is keyed exactly as the extension
// keys it (posting_key.ts), so the same posting is queued once and the extension's own queue never holds it twice.
import { applyUrl, detectPortal, formUrlFor, postingKey } from "./posting_key.ts";
import { dailyLimit, type Limits } from "./career_apply.ts";

export interface Want { posting_key: string; url: string; company: string; title: string; queued_at: string }
export interface WantRow extends Want { state: "waiting" | "taken" }
export interface WantStore {
  put(userId: string, items: Want[]): Promise<{ added: Want[]; already: string[] }>;
  list(userId: string): Promise<WantRow[]>;
  queuedSince(userId: string, sinceIso: string): Promise<number>;
}

const NEVER = /(^|\.)(linkedin\.com|indeed\.com)$/i;
const host = (url: string) => { try { return new URL(url).hostname; } catch { return ""; } };

// The postings the brain picked, kept when each is a real application link the extension can open; refused with why.
export function wantsFrom(picks: { url: string; job_id?: string; company?: string; title?: string }[], now: number): { ok: Want[]; refused: { url: string; why: string }[] } {
  const ok: Want[] = [], refused: { url: string; why: string }[] = [], seen = new Set<string>();
  for (const p of picks) {
    // WO-078: a shelf posting is queued at its board's own form, whatever its public link (an employer's careers page).
    const url = formUrlFor(String(p?.job_id ?? "")) ?? String(p?.url ?? "").trim();
    if (NEVER.test(host(url))) { refused.push({ url, why: "LinkedIn and Indeed are never automated; the person applies there themselves" }); continue; }
    const key = detectPortal(url) ? postingKey(url) : null;
    if (!key) { refused.push({ url, why: "not a Greenhouse, Lever, Ashby or Workday posting link the extension can open" }); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    // WO-076: one millisecond apart, so the queue reads back in the order the brain chose (the fit proxy when no fit is carried).
    ok.push({ posting_key: key, url: applyUrl(url), company: String(p.company ?? "").slice(0, 200), title: String(p.title ?? "").slice(0, 200), queued_at: new Date(now + ok.length).toISOString() });
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

// WO-076 (the owner, 2026-10-20: "Queue at 4× the daily limit as candidates, sends capped at 25"): a day's queue holds up to
// 4× the person's daily limit as candidates (100 at the default 25, 200 at 50), so the extension can choose, within the same
// fit, the forms Trainee can finish. Sends stay at the daily limit, enforced where they always were (career_apply_enqueue
// raises daily_cap; admitApplication). What is over the candidates is refused with both numbers named.
export const CANDIDATES_PER_SEND = 4;
export const candidateLimit = (l?: Limits) => CANDIDATES_PER_SEND * dailyLimit(l);
export async function queueWants(store: WantStore, userId: string, picks: { url: string; job_id?: string; company?: string; title?: string }[], now: number, o: { limits?: Limits; tz?: string } = {}) {
  const { ok, refused } = wantsFrom(picks, now);
  const cap = dailyLimit(o.limits), candidates = candidateLimit(o.limits);
  const used = await store.queuedSince(userId, dayStart(now, o.tz));
  const room = Math.max(0, candidates - used);
  const have = new Set((await store.list(userId)).map((w) => w.posting_key));
  const fresh = ok.filter((w) => !have.has(w.posting_key));
  const take = fresh.slice(0, room);
  for (const w of fresh.slice(room)) refused.push({ url: w.url, why: `over today's ${candidates} candidates (${CANDIDATES_PER_SEND}× the daily limit of ${cap} applications)` });
  const r = await store.put(userId, take);
  return { queued: r.added.length, already: ok.length - fresh.length + r.already.length, items: r.added, refused, limit: cap, candidates };
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
      // The SQL takes at most 100 postings a call; 4× the highest limit is 200 (WO-076).
      const keys = new Set<string>();
      for (let i = 0; i < items.length; i += 100) {
        const { data, error } = await admin.rpc("career_apply_want_put_for", { p_user: userId, p_items: items.slice(i, i + 100) });
        if (error) throw new Error(`the apply queue could not be saved: ${error.message}`);
        for (const k of (data?.added ?? []) as string[]) keys.add(k);
      }
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
