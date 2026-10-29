// Trainee's own plan: Stripe Checkout link, cancel at period end, and the webhook's subscription sync, as functions of
// injected parts (a Stripe-shaped client, a store over user_subscriptions, a referral port) so they run against a fake
// Stripe with no network or keys. No imports on purpose: the edge functions and the chat tools both load this file.
//
// Rules held in code, not in prose:
// - A subscription is Trainee's own only if it carries Trainee's price (or was tagged product=trainee at checkout).
//   The webhook ignores every other subscription; cancel never touches one.
// - Cancel sets cancel_at_period_end on the ONE subscription id stored for this person, after re-reading it from Stripe
//   and checking its price, its supabase_user_id and its customer. It never calls cancel(), never lists subscriptions.
// - The card is typed on Stripe's page only. A card number in chat makes no call and is never echoed.
// - The referral tables are optional: when they are absent the webhook still writes the subscription (tolerantReferrals).

export const TRAINEE_PRODUCT = "trainee";
export interface BillingCfg { priceId: string; siteUrl: string }
export interface SubRow {
  user_id: string; status: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; cancel_at_period_end?: boolean;
  current_period_start?: string | null; current_period_end?: string | null; price_cents?: number; updated_at?: string;
}
export interface BillingStore { get(userId: string): Promise<SubRow | null>; upsert(userId: string, patch: Partial<SubRow>): Promise<void> }
// deno-lint-ignore no-explicit-any
export interface StripeLike { [k: string]: any }
export interface ReferralPort {
  unappliedCredits(userId: string): Promise<{ id: string; amount: number }[]>;
  markApplied(ids: string[]): Promise<void>;
  creditReferrer(refereeId: string): Promise<boolean>;
}
export interface BillingDeps { stripe: StripeLike; store: BillingStore; cfg: BillingCfg; now?: () => number }

const LIVE = new Set(["active", "trialing", "past_due"]);
const DEAD = new Set(["canceled", "incomplete_expired"]);
const day = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : null);
const customerId = (c: unknown): string | null => (typeof c === "string" ? c : c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" ? (c as { id: string }).id : null);

// A card number (13-19 digits that pass the Luhn check), however it is spaced or dashed, even with more digits (an expiry
// or cvc) running on after it.
export function luhnWindow(digits: string): boolean {
  for (let len = 13; len <= Math.min(19, digits.length); len++) {
    for (let at = 0; at + len <= digits.length; at++) {
      const d = digits.slice(at, at + len);
      let sum = 0;
      for (let i = 0; i < d.length; i++) {
        let n = Number(d[d.length - 1 - i]);
        if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
        sum += n;
      }
      if (sum % 10 === 0) return true;
    }
  }
  return false;
}
export function cardNumberIn(text: unknown): boolean {
  for (const m of String(text ?? "").matchAll(/\d(?:[ -]?\d){12,}/g)) if (luhnWindow(m[0].replace(/\D/g, ""))) return true;
  return false;
}

export function isTraineeSubscription(sub: any, cfg: BillingCfg): boolean {
  if (!sub) return false;
  if (sub.metadata?.product === TRAINEE_PRODUCT) return true;
  const items = sub.items?.data ?? [];
  return !!cfg.priceId && items.some((i: any) => i?.price?.id === cfg.priceId);
}

export async function subscriptionStatus(store: BillingStore, userId: string) {
  const row = await store.get(userId);
  const active = !!row && LIVE.has(row.status) && (!row.current_period_end || Date.parse(row.current_period_end) > 0);
  return {
    subscribed: !!row && LIVE.has(row.status), active, status: row?.status ?? "none",
    cancel_at_period_end: !!row?.cancel_at_period_end, ends_on: day(row?.current_period_end),
  };
}

// ---------------------------------------------------------------- checkout
export async function startCheckout(d: BillingDeps, who: { userId: string; email?: string | null }):
  Promise<{ ok: true; url: string; price: string } | { ok: false; reason: "not_configured" | "already_subscribed" | "no_link" }> {
  if (!d.cfg.priceId || !d.cfg.siteUrl) return { ok: false, reason: "not_configured" };
  const row = await d.store.get(who.userId);
  if (row && LIVE.has(row.status) && !row.cancel_at_period_end) return { ok: false, reason: "already_subscribed" };
  let customer = row?.stripe_customer_id ?? null;
  if (!customer) {
    const c = await d.stripe.customers.create(
      { ...(who.email ? { email: who.email } : {}), metadata: { supabase_user_id: who.userId, product: TRAINEE_PRODUCT } },
      { idempotencyKey: `trainee-customer:${who.userId}` },
    );
    customer = c.id as string;
    await d.store.upsert(who.userId, { stripe_customer_id: customer });
  }
  const price = await d.stripe.prices.retrieve(d.cfg.priceId);
  const bucket = Math.floor((d.now ? d.now() : Date.now()) / 600000);
  const session = await d.stripe.checkout.sessions.create({
    customer, mode: "subscription", line_items: [{ price: d.cfg.priceId, quantity: 1 }],
    success_url: `${d.cfg.siteUrl}/?subscribed=1`, cancel_url: `${d.cfg.siteUrl}/?subscribe=cancelled`,
    metadata: { supabase_user_id: who.userId, product: TRAINEE_PRODUCT },
    subscription_data: { metadata: { supabase_user_id: who.userId, product: TRAINEE_PRODUCT } },
  }, { idempotencyKey: `trainee-checkout:${who.userId}:${bucket}` });
  if (!session?.url) return { ok: false, reason: "no_link" };
  const amount = typeof price?.unit_amount === "number" ? `$${(price.unit_amount / 100).toFixed(2)}` : "";
  const per = price?.recurring?.interval ? ` / ${price.recurring.interval}` : "";
  return { ok: true, url: session.url as string, price: `${amount}${per}`.trim() };
}

// ---------------------------------------------------------------- cancel
export type CancelResult =
  | { ok: true; cancel_at_period_end: true; ends_on: string | null }
  | { ok: false; reason: "no_subscription" | "not_trainee_subscription" | "already_canceling"; ends_on?: string | null };
export async function cancelAtPeriodEnd(d: BillingDeps, who: { userId: string }): Promise<CancelResult> {
  const row = await d.store.get(who.userId);
  if (!row?.stripe_subscription_id) return { ok: false, reason: "no_subscription" };
  let sub: any;
  try { sub = await d.stripe.subscriptions.retrieve(row.stripe_subscription_id); } catch { return { ok: false, reason: "no_subscription" }; }
  // The stored id is not trusted on its own: Stripe's object must be Trainee's, this person's and this customer's.
  const ours = isTraineeSubscription(sub, d.cfg) && sub.metadata?.supabase_user_id === who.userId && customerId(sub.customer) === (row.stripe_customer_id ?? null);
  if (!ours) return { ok: false, reason: "not_trainee_subscription" };
  if (DEAD.has(sub.status)) return { ok: false, reason: "no_subscription" };
  const ends_on = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10) : null;
  if (sub.cancel_at_period_end) return { ok: false, reason: "already_canceling", ends_on };
  const updated = await d.stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  await d.store.upsert(who.userId, { cancel_at_period_end: true, status: updated?.status ?? sub.status, updated_at: new Date().toISOString() });
  return { ok: true, cancel_at_period_end: true, ends_on };
}

// ---------------------------------------------------------------- the referral port, tolerant of dropped tables
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (["42P01", "42883", "PGRST205", "PGRST202"].includes(String(err.code))) return true;
  return /does not exist|could not find the (table|function)|schema cache/i.test(String(err.message ?? ""));
}
// deno-lint-ignore no-explicit-any
export function tolerantReferrals(admin: any): ReferralPort {
  let told = false;
  const absent = () => { if (!told) { told = true; console.error("billing: referral tables or function are absent; referral credits are skipped"); } };
  const check = (error: { code?: string; message?: string } | null) => {
    if (!error) return true;
    if (isMissingTable(error)) { absent(); return false; }
    throw new Error(String(error.message ?? "referral query failed"));
  };
  return {
    async unappliedCredits(userId) {
      const r = await admin.from("referral_credits").select("id, amount").eq("user_id", userId).eq("applied", false);
      if (!check(r.error)) return [];
      return (r.data ?? []).map((c: { id: string; amount: unknown }) => ({ id: String(c.id), amount: Number(c.amount) }));
    },
    async markApplied(ids) {
      if (!ids.length) return;
      const r = await admin.from("referral_credits").update({ applied: true }).in("id", ids);
      check(r.error);
    },
    async creditReferrer(refereeId) {
      const r = await admin.rpc("credit_pending_referral", { p_referee_id: refereeId });
      if (!check(r.error)) return false;
      return !!(r.data && r.data.ok);
    },
  };
}

// ---------------------------------------------------------------- the webhook's work
export interface EventDeps { stripe: StripeLike; store: BillingStore; cfg: BillingCfg; referrals: ReferralPort }
type Outcome = { handled: boolean; ignored?: string; userId?: string };

async function applyPendingCredits(d: EventDeps, userId: string, customer: string) {
  const credits = await d.referrals.unappliedCredits(userId);
  const cents = credits.reduce((s, c) => s + Math.round(c.amount * 100), 0);
  if (!credits.length || cents <= 0) return;
  await d.stripe.customers.createBalanceTransaction(customer, {
    amount: -cents, currency: "usd", description: `Referral credit applied (${credits.length} referral${credits.length === 1 ? "" : "s"})`,
  });
  await d.referrals.markApplied(credits.map((c) => c.id));
}

async function userOf(d: EventDeps, sub: any): Promise<string | null> {
  if (sub.metadata?.supabase_user_id) return String(sub.metadata.supabase_user_id);
  const cid = customerId(sub.customer);
  if (!cid) return null;
  const cust = await d.stripe.customers.retrieve(cid);
  return cust?.metadata?.supabase_user_id ? String(cust.metadata.supabase_user_id) : null;
}

// Reads Stripe's current copy of the subscription (an event can be stale or out of order), keeps only Trainee's own, and
// writes the row. A newer live subscription is never overwritten by an older one ending.
async function syncSubscription(d: EventDeps, fromEvent: any): Promise<Outcome> {
  let sub = fromEvent;
  try { sub = await d.stripe.subscriptions.retrieve(fromEvent.id); } catch { /* the event's own copy stands */ }
  if (!isTraineeSubscription(sub, d.cfg)) return { handled: false, ignored: "not a Trainee subscription" };
  const userId = await userOf(d, sub);
  if (!userId) { console.error("billing: no supabase_user_id for subscription", sub.id); return { handled: false, ignored: "no user" }; }
  const row = await d.store.get(userId);
  if (row?.stripe_subscription_id && row.stripe_subscription_id !== sub.id && LIVE.has(row.status) && DEAD.has(sub.status)) {
    return { handled: false, ignored: "an older subscription ended; the current one stands", userId };
  }
  const customer = customerId(sub.customer);
  await d.store.upsert(userId, {
    status: sub.status, stripe_customer_id: customer, stripe_subscription_id: sub.id,
    cancel_at_period_end: !!(sub.cancel_at_period_end || sub.cancel_at),
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    price_cents: sub.items?.data?.[0]?.price?.unit_amount ?? 1000, updated_at: new Date().toISOString(),
  });
  if (sub.status === "active" && customer) await applyPendingCredits(d, userId, customer);
  return { handled: true, userId };
}

export async function handleStripeEvent(event: { id?: string; type: string; data: { object: any } }, d: EventDeps): Promise<Outcome> {
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      if (typeof o.subscription !== "string") return { handled: false, ignored: "not a subscription checkout" };
      const out = await syncSubscription(d, { id: o.subscription });
      if (out.handled && out.userId) await d.referrals.creditReferrer(out.userId);
      return out;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return await syncSubscription(d, o);
    case "invoice.payment_succeeded": {
      if (typeof o.subscription !== "string") return { handled: false, ignored: "not a subscription invoice" };
      let sub: any;
      try { sub = await d.stripe.subscriptions.retrieve(o.subscription); } catch { return { handled: false, ignored: "subscription not readable" }; }
      if (!isTraineeSubscription(sub, d.cfg)) return { handled: false, ignored: "not a Trainee subscription" };
      const userId = await userOf(d, sub);
      if (userId) await d.referrals.creditReferrer(userId);
      return { handled: !!userId, userId: userId ?? undefined };
    }
    default:
      return { handled: false, ignored: `unhandled event ${event.type}` };
  }
}

// ---------------------------------------------------------------- Supabase adapter (service-role client)
// deno-lint-ignore no-explicit-any
export function supabaseBillingStore(admin: any): BillingStore {
  return {
    async get(userId) {
      const r = await admin.from("user_subscriptions").select("*").eq("user_id", userId).maybeSingle();
      if (r.error) throw new Error(`read subscription: ${r.error.message}`);
      return r.data ?? null;
    },
    async upsert(userId, patch) {
      const r = await admin.from("user_subscriptions").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
      if (r.error) throw new Error(`write subscription: ${r.error.message}`);
    },
  };
}
export function billingCfgFromEnv(env: { get(k: string): string | undefined }): BillingCfg {
  return {
    priceId: (env.get("TRAINEE_STRIPE_PRICE_ID") || env.get("STRIPE_PRICE_ID") || "").trim(),
    siteUrl: (env.get("TRAINEE_SITE_URL") || "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app").trim().replace(/\/$/, ""),
  };
}
