// The texting channel's store over Supabase (WO-013b-1): the ChannelStore of channel.ts over career_outbox and
// channel_contacts (supabase/migrations/20261019020000_channel_delivery.sql). due() claims rows, so two overlapping runs
// never send the same one; release() puts back what a run claimed and did not finish (a capped row); sweep() fails a row
// a dead run left "sending", never resending it (the provider may already have it: at most once beats twice).
import type { ChannelStore, DeliveryMark, OutboxRow } from "./channel.ts";

export const SENDING_TIMEOUT_MS = 10 * 60000; // longer than any run can last (a function's wall clock is shorter)
export const UNKNOWN_OUTCOME = "delivery outcome unknown: the run stopped before recording it; not resent";
const DAY_MS = 86400000;
const dayRange = (day: string) => { const t = Date.parse(`${day}T00:00:00Z`); return [new Date(t).toISOString(), new Date(t + DAY_MS).toISOString()]; };
const iso = (t: number) => new Date(t).toISOString();
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

export type DeliveryStore = ChannelStore & { release(): Promise<number>; sweep(now: number): Promise<number> };

// deno-lint-ignore no-explicit-any
export function supabaseChannelStore(admin: any): DeliveryStore {
  const claimed = new Map<string, { prior: string; attempts: number }>();
  return {
    async due(now, limit) {
      const rows = must<any[]>(await admin.rpc("career_outbox_claim", { p_now: iso(now), p_limit: limit }), "claim due messages") || [];
      const out: OutboxRow[] = rows.map((r) => ({ id: String(r.id), userId: r.user_id, contact: r.contact, key: r.key, text: r.text, deliver_at: Date.parse(r.deliver_at), attempts: r.attempts }));
      for (const r of rows) claimed.set(String(r.id), { prior: r.prior_status, attempts: r.attempts });
      return out.sort((a, b) => a.deliver_at - b.deliver_at || Number(a.id) - Number(b.id));
    },
    async optedOut(contact) {
      const r = must<any>(await admin.from("channel_contacts").select("opted_out").eq("contact", contact).maybeSingle(), "read opt-out");
      return r?.opted_out === true;
    },
    async setOptOut(contact, out, at) {
      must(await admin.from("channel_contacts").upsert({ contact, opted_out: out, opted_out_at: out ? iso(at) : null, updated_at: iso(at) }, { onConflict: "contact" }), "save opt-out");
    },
    async contactsSentOn(day) {
      return Number(must<number>(await admin.rpc("career_outbox_contacts_on", { p_day: day }), "count today's contacts")) || 0;
    },
    async sentTo(contact, day) {
      const [from, to] = dayRange(day);
      const r = must<any[]>(await admin.from("career_outbox").select("id").eq("contact", contact).eq("status", "delivered").gte("delivered_at", from).lt("delivered_at", to).limit(1), "read today's sends");
      return (r || []).length > 0;
    },
    async mark(id, m: DeliveryMark) {
      const c = claimed.get(id);
      const base = { status: m.status, claimed_at: null, error: m.error ? m.error.slice(0, 500) : null };
      const patch = m.status === "delivered" ? { ...base, delivered_at: iso(m.at), provider_id: m.providerId ? m.providerId.slice(0, 200) : null, retry_at: null }
        : m.status === "failed" ? { ...base, attempts: (c?.attempts ?? 0) + 1, retry_at: m.retryAt ? iso(m.retryAt) : null }
        : { ...base, retry_at: null };
      must(await admin.from("career_outbox").update(patch).eq("id", id).eq("status", "sending"), "record delivery");
      claimed.delete(id);
    },
    async release() {
      let n = 0;
      for (const [id, c] of claimed) {
        must(await admin.from("career_outbox").update({ status: c.prior, claimed_at: null, contact: null }).eq("id", id).eq("status", "sending"), "release a claimed message");
        claimed.delete(id); n++;
      }
      return n;
    },
    async sweep(now) {
      const r = must<any[]>(await admin.from("career_outbox").update({ status: "failed", retry_at: null, claimed_at: null, error: UNKNOWN_OUTCOME })
        .eq("status", "sending").lt("claimed_at", iso(now - SENDING_TIMEOUT_MS)).select("id"), "fail abandoned sends") || [];
      return r.length;
    },
  };
}
