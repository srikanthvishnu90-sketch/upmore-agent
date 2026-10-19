// The scheduled delivery run (WO-013b-1), as a function of its inputs so it is testable without a database or a provider.
// pg_cron calls it every minute (scripts/launch/schedule-trainee-deliver.sql, run by the owner) with the shared secret.
// It sends what career_outbox has due through LoopMessage under the channel's rules (channel.ts deliverDue): STOP holds,
// at most once, retried with backoff, the daily contact cap. Without the LoopMessage key it is NOT_WIRED and sends nothing.
import { equalSecret } from "../_shared/message_service.ts";
import { deliverDue, type Send } from "../_shared/channel.ts";
import type { DeliveryStore } from "../_shared/channel_store.ts";

export const ROWS_PER_RUN = 20; // 20 rows x up to 4 bubbles x ~0.6 s stays well inside a function's wall clock
export const DEFAULT_DAILY_CONTACTS = 300; // LoopMessage's smaller plan; set LOOPMESSAGE_DAILY_CONTACTS for the larger one
export type DeliveryRun = { delivered: number; failed: number; retried: number; skipped_opt_out: number; capped: number; swept: number; ms: number; error: string | null; at: string };
export interface DeliverDeps {
  env: { get(k: string): string | undefined };
  store: () => DeliveryStore;
  send: (apiKey: string) => Send;
  recordRun: (r: DeliveryRun) => Promise<void>;
  now: () => number;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function handleDeliver(req: Request, d: DeliverDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = d.env.get("TRAINEE_DELIVER_SECRET") || "";
  if (secret.length < 32) return json({ error: "not configured: TRAINEE_DELIVER_SECRET must be set, 32 characters or more" }, 503);
  if (!equalSecret(req.headers.get("x-trainee-deliver-secret") || "", secret)) return json({ error: "Unauthorized" }, 401);
  const apiKey = d.env.get("LOOPMESSAGE_API_KEY") || "";
  if (!apiKey) return json({ error: "NOT_WIRED: LOOPMESSAGE_API_KEY is not set; nothing was sent" }, 503);
  const capRaw = d.env.get("LOOPMESSAGE_DAILY_CONTACTS");
  const cap = capRaw === undefined || capRaw === "" ? DEFAULT_DAILY_CONTACTS : Number(capRaw);
  if (!Number.isInteger(cap) || cap < 1) return json({ error: "not configured: LOOPMESSAGE_DAILY_CONTACTS must be a whole number of contacts a day" }, 503);
  const started = d.now(), at = new Date(started).toISOString();
  const store = d.store();
  let swept = 0;
  try {
    swept = await store.sweep(started);
    const r = await deliverDue({ store, send: d.send(apiKey), now: started, limit: ROWS_PER_RUN, dailyContactCap: cap });
    // Only a run that finished puts back what it claimed and did not send (capped rows). After a failure mid-run a claimed
    // row may already be with the provider, so it stays "sending" and the next sweep fails it instead of resending it.
    await store.release();
    const run = { ...r, swept, ms: d.now() - started, error: null, at };
    await d.recordRun(run);
    return json(run);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("trainee-deliver failed:", error);
    try { await d.recordRun({ delivered: 0, failed: 0, retried: 0, skipped_opt_out: 0, capped: 0, swept, ms: d.now() - started, error, at }); } catch { /* the failure is already logged */ }
    return json({ error: "delivery run failed", detail: error }, 500);
  }
}
