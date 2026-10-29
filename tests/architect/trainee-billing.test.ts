// Trainee's own plan, subscribed and cancelled by text, with a fake Stripe (no network, no keys). Covers: the Checkout link
// for Trainee's own price only, no card numbers in chat, cancel-by-text cancels OUR subscription only (never another one on
// the same customer or account), the webhook writing user_subscriptions incl. cancel_at_period_end, and the webhook no
// longer depending on the dropped referral tables. Run: deno test -A --no-check tests/architect/trainee-billing.test.ts
import {
  type BillingCfg, type BillingStore, cancelAtPeriodEnd, cardNumberIn, handleStripeEvent, isMissingTable, isTraineeSubscription, type ReferralPort, startCheckout,
  subscriptionStatus, tolerantReferrals,
} from "../../supabase/functions/_shared/trainee_billing.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import SRC_WEBHOOK from "../../supabase/functions/stripe-webhook/index.ts" with { type: "text" };
import SRC_CHECKOUT from "../../supabase/functions/stripe-checkout/index.ts" with { type: "text" };

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
async function rejects(f: () => Promise<unknown>, re: RegExp) { try { await f(); } catch (e) { assert(re.test(String((e as Error).message)), `wrong error: ${(e as Error).message}`); return; } throw new Error("did not reject"); }

const CFG: BillingCfg = { priceId: "price_TRAINEE", siteUrl: "https://trainee.test" };
const OTHER_PRICE = "price_SOMETHING_ELSE";
const T0 = Date.UTC(2026, 9, 28, 12);
const PERIOD_END = Math.floor(Date.UTC(2026, 10, 28) / 1000);

// ---- a fake Stripe: in-memory customers and subscriptions, every call recorded
function fakeStripe() {
  const calls: { fn: string; args: any[] }[] = [];
  const subs: Record<string, any> = {};
  const customers: Record<string, any> = {};
  let n = 0;
  const rec = (fn: string, ...args: any[]) => calls.push({ fn, args });
  const stripe = {
    customers: {
      create: async (p: any, o?: any) => { rec("customers.create", p, o); const id = `cus_${++n}`; customers[id] = { id, ...p }; return { id }; },
      retrieve: async (id: string) => { rec("customers.retrieve", id); return customers[id]; },
      createBalanceTransaction: async (id: string, p: any) => { rec("customers.createBalanceTransaction", id, p); return {}; },
    },
    checkout: { sessions: { create: async (p: any, o?: any) => { rec("checkout.sessions.create", p, o); return { id: `cs_${++n}`, url: `https://checkout.stripe.test/c/pay/cs_${n}` }; } } },
    subscriptions: {
      retrieve: async (id: string) => { rec("subscriptions.retrieve", id); if (!subs[id]) throw new Error("no such subscription"); return structuredClone(subs[id]); },
      update: async (id: string, p: any) => { rec("subscriptions.update", id, p); Object.assign(subs[id], p); return structuredClone(subs[id]); },
      cancel: async (id: string) => { rec("subscriptions.cancel", id); throw new Error("cancel() must never be called: cancel by text only sets cancel_at_period_end"); },
      list: async () => { rec("subscriptions.list"); throw new Error("never list a customer's subscriptions to cancel them"); },
    },
    prices: { retrieve: async (id: string) => { rec("prices.retrieve", id); return { id, unit_amount: 1000, currency: "usd", recurring: { interval: "month" } }; } },
  };
  return { stripe, calls, subs, customers };
}
function sub(id: string, o: { user?: string | null; customer?: string; price?: string; status?: string; cancelAtEnd?: boolean; product?: string } = {}) {
  return {
    id, object: "subscription", status: o.status ?? "active", customer: o.customer ?? "cus_1",
    metadata: { ...(o.user === null ? {} : { supabase_user_id: o.user ?? "U1" }), ...(o.product ? { product: o.product } : {}) },
    items: { data: [{ price: { id: o.price ?? CFG.priceId, unit_amount: 1000 } }] },
    cancel_at_period_end: o.cancelAtEnd ?? false, cancel_at: null, current_period_start: PERIOD_END - 30 * 86400, current_period_end: PERIOD_END,
  };
}
function memStore(): BillingStore & { rows: Record<string, any> } {
  const rows: Record<string, any> = {};
  return {
    rows,
    async get(u) { return rows[u] ? { ...rows[u] } : null; },
    async upsert(u, patch) { rows[u] = { user_id: u, status: "incomplete", cancel_at_period_end: false, ...rows[u], ...patch }; },
  };
}
function memReferrals(): ReferralPort & { log: string[] } {
  const log: string[] = [];
  return { log, unappliedCredits: async () => { log.push("credits"); return []; }, markApplied: async () => { log.push("applied"); }, creditReferrer: async (u) => { log.push(`credit:${u}`); return false; } };
}

// ---- Checkout
Deno.test("billing/C1 checkout: a Stripe Checkout link for Trainee's own price, tied to this user, with no card data of ours", async () => {
  const f = fakeStripe(), store = memStore();
  const r = await startCheckout({ stripe: f.stripe, store, cfg: CFG, now: () => T0 }, { userId: "U1" });
  assert(r.ok, "link made");
  assert(/^https:\/\/checkout\.stripe\.test\//.test((r as any).url), "the link is Stripe's own page");
  eq((r as any).price, "$10.00 / month", "the price shown comes from Stripe's price, not from our prose");
  const s = f.calls.find((c) => c.fn === "checkout.sessions.create")!;
  eq(s.args[0].mode, "subscription");
  eq(s.args[0].line_items, [{ price: "price_TRAINEE", quantity: 1 }], "only Trainee's own price");
  eq(s.args[0].metadata.supabase_user_id, "U1");
  eq(s.args[0].subscription_data.metadata, { supabase_user_id: "U1", product: "trainee" }, "the subscription itself is tagged ours");
  assert(typeof s.args[1]?.idempotencyKey === "string", "a double ask in the same minutes reuses the session");
  assert(!JSON.stringify(s.args[0]).match(/card|\b\d{13,19}\b/i), "no card field is ever sent");
  eq(store.rows.U1.stripe_customer_id, "cus_1", "the customer is remembered");
  assert(!("email" in f.customers.cus_1), "no email is sent to Stripe when the person has none (a Telegram user)");
});
Deno.test("billing/C2 checkout: not configured, or already subscribed, makes no link", async () => {
  const f = fakeStripe(), store = memStore();
  eq(await startCheckout({ stripe: f.stripe, store, cfg: { ...CFG, priceId: "" }, now: () => T0 }, { userId: "U1" }), { ok: false, reason: "not_configured" });
  store.rows.U1 = { user_id: "U1", status: "active", stripe_customer_id: "cus_9", stripe_subscription_id: "sub_1", cancel_at_period_end: false, current_period_end: new Date(PERIOD_END * 1000).toISOString() };
  const r: any = await startCheckout({ stripe: f.stripe, store, cfg: CFG, now: () => T0 }, { userId: "U1" });
  eq([r.ok, r.reason], [false, "already_subscribed"]);
  assert(!f.calls.some((c) => c.fn === "checkout.sessions.create"), "no second session for an active subscriber");
});
Deno.test("billing/C3 a returning customer reuses their Stripe customer", async () => {
  const f = fakeStripe(), store = memStore();
  store.rows.U1 = { user_id: "U1", status: "canceled", stripe_customer_id: "cus_old", cancel_at_period_end: false };
  const r: any = await startCheckout({ stripe: f.stripe, store, cfg: CFG, now: () => T0 }, { userId: "U1" });
  assert(r.ok);
  assert(!f.calls.some((c) => c.fn === "customers.create"));
  eq(f.calls.find((c) => c.fn === "checkout.sessions.create")!.args[0].customer, "cus_old");
});
Deno.test("billing/C4 card numbers are recognised (Luhn) and never stored or echoed", () => {
  assert(cardNumberIn("my card is 4242 4242 4242 4242 exp 12/30"));
  assert(cardNumberIn("4242-4242-4242-4242"));
  assert(!cardNumberIn("call me on 415 555 0100 or order 1234567890123"), "phone numbers and non-Luhn digit runs are not cards");
  assert(!cardNumberIn("I want to subscribe"));
});

// ---- Cancel
Deno.test("billing/X1 cancel by text sets cancel_at_period_end on OUR subscription and nothing else", async () => {
  const f = fakeStripe(), store = memStore();
  f.subs.sub_ours = sub("sub_ours"); f.subs.sub_other = sub("sub_other", { price: OTHER_PRICE });
  store.rows.U1 = { user_id: "U1", status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_ours", cancel_at_period_end: false };
  const r: any = await cancelAtPeriodEnd({ stripe: f.stripe, store, cfg: CFG }, { userId: "U1" });
  eq([r.ok, r.cancel_at_period_end], [true, true]);
  eq(r.ends_on, "2026-11-28", "access runs to the end of the paid period");
  const updates = f.calls.filter((c) => c.fn === "subscriptions.update");
  eq(updates.map((u) => [u.args[0], u.args[1]]), [["sub_ours", { cancel_at_period_end: true }]], "one update, ours, nothing but the flag");
  eq(f.subs.sub_other.cancel_at_period_end, false, "the other subscription on the same customer is untouched");
  eq(store.rows.U1.cancel_at_period_end, true, "recorded");
  eq((await cancelAtPeriodEnd({ stripe: f.stripe, store, cfg: CFG }, { userId: "U1" }) as any).reason, "already_canceling", "asking twice changes nothing");
});
Deno.test("billing/X2 cancel refuses any subscription that is not Trainee's own, even if the stored id points at it", async () => {
  for (const [label, s] of [
    ["another price", sub("sub_x", { price: OTHER_PRICE })],
    ["another user's metadata", sub("sub_x", { user: "U2" })],
    ["another customer", sub("sub_x", { customer: "cus_stranger" })],
    ["no metadata, other price", sub("sub_x", { user: null, price: OTHER_PRICE })],
  ] as const) {
    const f = fakeStripe(), store = memStore();
    f.subs.sub_x = s;
    store.rows.U1 = { user_id: "U1", status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_x", cancel_at_period_end: false };
    const r: any = await cancelAtPeriodEnd({ stripe: f.stripe, store, cfg: CFG }, { userId: "U1" });
    eq([label, r.ok, r.reason], [label, false, "not_trainee_subscription"]);
    assert(!f.calls.some((c) => c.fn === "subscriptions.update"), `${label}: nothing was changed at Stripe`);
  }
});
Deno.test("billing/X3 cancel with no subscription of ours says so and touches nothing", async () => {
  const f = fakeStripe(), store = memStore();
  eq(((await cancelAtPeriodEnd({ stripe: f.stripe, store, cfg: CFG }, { userId: "U1" })) as any).reason, "no_subscription");
  store.rows.U1 = { user_id: "U1", status: "canceled", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_gone", cancel_at_period_end: false };
  f.subs.sub_gone = sub("sub_gone", { status: "canceled" });
  eq(((await cancelAtPeriodEnd({ stripe: f.stripe, store, cfg: CFG }, { userId: "U1" })) as any).reason, "no_subscription");
  assert(!f.calls.some((c) => c.fn === "subscriptions.update"));
});

// ---- Webhook
Deno.test("billing/W1 the webhook writes user_subscriptions incl. cancel_at_period_end, from Stripe's current object", async () => {
  const f = fakeStripe(), store = memStore(), referrals = memReferrals();
  f.subs.sub_ours = sub("sub_ours", { cancelAtEnd: true });
  const deps = { stripe: f.stripe, store, cfg: CFG, referrals };
  // the event carries a stale copy (not cancelling); Stripe's current object says cancelling
  const out = await handleStripeEvent({ id: "evt_1", type: "customer.subscription.updated", data: { object: sub("sub_ours", { cancelAtEnd: false }) } }, deps);
  eq(out.handled, true);
  eq(store.rows.U1.cancel_at_period_end, true);
  eq(store.rows.U1.status, "active");
  eq(store.rows.U1.stripe_subscription_id, "sub_ours");
  eq(store.rows.U1.current_period_end, new Date(PERIOD_END * 1000).toISOString());
  eq(store.rows.U1.price_cents, 1000);
  // replay: the same event again changes nothing (idempotent)
  const strip = (r: any) => JSON.stringify({ ...r, updated_at: undefined });
  const before = strip(store.rows.U1);
  await handleStripeEvent({ id: "evt_1", type: "customer.subscription.updated", data: { object: sub("sub_ours") } }, deps);
  eq(strip(store.rows.U1), before);
});
Deno.test("billing/W2 the webhook ignores subscriptions that are not Trainee's", async () => {
  const f = fakeStripe(), store = memStore(), referrals = memReferrals();
  f.subs.sub_other = sub("sub_other", { price: OTHER_PRICE });
  const out = await handleStripeEvent({ id: "evt_2", type: "customer.subscription.deleted", data: { object: sub("sub_other", { price: OTHER_PRICE, status: "canceled" }) } }, { stripe: f.stripe, store, cfg: CFG, referrals });
  eq(out.handled, false);
  eq(store.rows, {}, "nothing written for someone else's plan");
  assert(isTraineeSubscription(sub("s", { price: OTHER_PRICE, product: "trainee" }), CFG), "tagged ours at checkout");
  assert(!isTraineeSubscription(sub("s", { price: OTHER_PRICE }), CFG));
});
Deno.test("billing/W3 an old subscription ending does not cancel a newer active one", async () => {
  const f = fakeStripe(), store = memStore(), referrals = memReferrals();
  store.rows.U1 = { user_id: "U1", status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_new", cancel_at_period_end: false };
  f.subs.sub_old = sub("sub_old", { status: "canceled" });
  const out = await handleStripeEvent({ id: "evt_3", type: "customer.subscription.deleted", data: { object: f.subs.sub_old } }, { stripe: f.stripe, store, cfg: CFG, referrals });
  eq(out.handled, false);
  eq([store.rows.U1.status, store.rows.U1.stripe_subscription_id], ["active", "sub_new"]);
});
Deno.test("billing/W4 checkout.session.completed and invoice.payment_succeeded sync and credit the referrer through the port", async () => {
  const f = fakeStripe(), store = memStore(), referrals = memReferrals();
  f.subs.sub_ours = sub("sub_ours");
  const deps = { stripe: f.stripe, store, cfg: CFG, referrals };
  await handleStripeEvent({ id: "e1", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_ours", metadata: { supabase_user_id: "U1" } } } }, deps);
  await handleStripeEvent({ id: "e2", type: "invoice.payment_succeeded", data: { object: { id: "in_1", subscription: "sub_ours", customer: "cus_1", amount_paid: 1000 } } }, deps);
  eq(store.rows.U1.status, "active");
  assert(referrals.log.includes("credit:U1"));
  // an invoice for someone else's subscription does not credit anyone
  referrals.log.length = 0;
  f.subs.sub_other = sub("sub_other", { price: OTHER_PRICE });
  await handleStripeEvent({ id: "e3", type: "invoice.payment_succeeded", data: { object: { id: "in_2", subscription: "sub_other", customer: "cus_1", amount_paid: 500 } } }, deps);
  eq(referrals.log, []);
});
Deno.test("billing/W5 the dropped referral tables never break the webhook", async () => {
  const f = fakeStripe(), store = memStore();
  f.subs.sub_ours = sub("sub_ours");
  // a Supabase-shaped admin client whose referral tables and function are gone, as in production
  const gone = { code: "42P01", message: 'relation "public.referral_credits" does not exist' };
  const admin: any = {
    from: (_t: string) => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: gone }) }) }), update: () => ({ in: () => Promise.resolve({ error: gone }) }) }),
    rpc: () => Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.credit_pending_referral in the schema cache" } }),
  };
  const referrals = tolerantReferrals(admin);
  const deps = { stripe: f.stripe, store, cfg: CFG, referrals };
  const out = await handleStripeEvent({ id: "e1", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_ours", metadata: {} } } }, deps);
  eq(out.handled, true);
  eq(store.rows.U1.status, "active", "the subscription is written whatever the referral tables are doing");
  assert(!f.calls.some((c) => c.fn === "customers.createBalanceTransaction"), "no credit is pushed when there is none");
  // the postgREST "table not in schema cache" shape is tolerated too; any other error is NOT swallowed
  assert(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.referrals' in the schema cache" }));
  assert(!isMissingTable({ code: "57014", message: "canceling statement due to statement timeout" }));
  const broken: any = { from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }) }) }) }), rpc: () => Promise.resolve({ data: null, error: null }) };
  await rejects(() => tolerantReferrals(broken).unappliedCredits("U1"), /timeout/);
});
Deno.test("billing/W6 referral credits still apply when the tables exist", async () => {
  const f = fakeStripe(), store = memStore();
  f.subs.sub_ours = sub("sub_ours");
  const applied: string[][] = [];
  const referrals: ReferralPort = { unappliedCredits: async () => [{ id: "c1", amount: 10 }, { id: "c2", amount: 10 }], markApplied: async (ids) => { applied.push(ids); }, creditReferrer: async () => true };
  await handleStripeEvent({ id: "e1", type: "customer.subscription.created", data: { object: sub("sub_ours") } }, { stripe: f.stripe, store, cfg: CFG, referrals });
  const bt = f.calls.find((c) => c.fn === "customers.createBalanceTransaction")!;
  eq([bt.args[0], bt.args[1].amount], ["cus_1", -2000]);
  eq(applied, [["c1", "c2"]]);
});
Deno.test("billing/W7 the deployed functions use the shared core and no longer read the referral tables directly", () => {
  for (const [name, src] of [["stripe-webhook", SRC_WEBHOOK], ["stripe-checkout", SRC_CHECKOUT]] as const) {
    assert(!/\.from\(\s*["']referral(s|_credits)["']\s*\)/.test(src), `${name} must reach the referral tables only through the tolerant port`);
    assert(/_shared\/trainee_billing\.ts/.test(src), `${name} uses the shared billing core`);
  }
  assert(/constructEventAsync/.test(SRC_WEBHOOK), "the signature is still verified");
});

// ---- The chat tools
const ctxFor = (message: string, before = "") => ({ userId: "U1", threadId: "T1", now: T0, state: {} as Record<string, any>, turn: { message, added: [] as string[], before } });
function toolsWith(f: ReturnType<typeof fakeStripe>, store: BillingStore) {
  const tools = careerTools({ postings: async () => [], billing: { stripe: f.stripe as any, store, cfg: CFG, now: () => T0 } } as any);
  return Object.fromEntries(tools.map((t) => [t.name, t])) as Record<string, any>;
}
Deno.test("billing/T1 subscribe by text: the tool returns Stripe's link and Trainee's own price; nothing is charged", async () => {
  const f = fakeStripe(), store = memStore(), t = toolsWith(f, store);
  eq([t.subscribe_to_trainee.effect, t.get_trainee_subscription.effect, t.cancel_trainee_subscription.effect], ["write_own", "read", "write_own"]);
  const r = await t.subscribe_to_trainee.run({}, ctxFor("I want to subscribe to Trainee"));
  assert(/^https:\/\/checkout\.stripe\.test\//.test(r.link) && r.price === "$10.00 / month");
  assert(/never|do not|don't/i.test(r.note) && /card/i.test(r.note), "the model is told: no card numbers in chat");
  assert(!f.calls.some((c) => /balance|cancel|update/.test(c.fn)));
});
Deno.test("billing/T2 a card number in the message makes no link and is not repeated back", async () => {
  const f = fakeStripe(), store = memStore(), t = toolsWith(f, store);
  const r = await t.subscribe_to_trainee.run({}, ctxFor("subscribe me, card 4242 4242 4242 4242 12/30 cvc 123"));
  eq(r.link, undefined);
  eq(r.card_number_in_chat, true);
  assert(!JSON.stringify(r).includes("4242"), "the number is never echoed in tool output");
  assert(!f.calls.length, "no Stripe call at all");
  const c = await t.cancel_trainee_subscription.run({ confirm: true }, ctxFor("yes cancel, card 4242424242424242"));
  eq(c.card_number_in_chat, true);
});
Deno.test("billing/T3 cancel by text needs the person's own yes this turn, after being asked, and only then changes Stripe", async () => {
  const f = fakeStripe(), store = memStore(), t = toolsWith(f, store);
  f.subs.sub_ours = sub("sub_ours"); f.subs.sub_other = sub("sub_other", { price: OTHER_PRICE });
  store.rows.U1 = { user_id: "U1", status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_ours", cancel_at_period_end: false, current_period_end: new Date(PERIOD_END * 1000).toISOString() };
  const ask = await t.cancel_trainee_subscription.run({}, ctxFor("cancel my trainee subscription"));
  eq(ask.needs_confirmation, true);
  assert(/2026-11-28/.test(JSON.stringify(ask)) && /only/i.test(ask.note), "says when it ends and that nothing else is touched");
  await rejects(() => t.cancel_trainee_subscription.run({ confirm: true }, ctxFor("cancel my trainee subscription")), /yes/i);
  await rejects(() => t.cancel_trainee_subscription.run({ confirm: true }, ctxFor("yes", "")), /asked|confirm/i);
  assert(!f.calls.some((c) => c.fn === "subscriptions.update"), "still nothing changed");
  const done = await t.cancel_trainee_subscription.run({ confirm: true }, ctxFor("yes, cancel it", "Cancel Trainee? It ends on 2026-11-28. Reply yes to cancel."));
  eq([done.cancelled, done.cancel_at_period_end, done.ends_on], [true, true, "2026-11-28"]);
  eq(f.calls.filter((c) => c.fn === "subscriptions.update").map((u) => u.args[0]), ["sub_ours"]);
  eq(f.subs.sub_other.cancel_at_period_end, false);
});
Deno.test("billing/T4 status reads the stored row; with no row it says there is no plan", async () => {
  const f = fakeStripe(), store = memStore(), t = toolsWith(f, store);
  eq((await t.get_trainee_subscription.run({}, ctxFor("am I subscribed"))).subscribed, false);
  store.rows.U1 = { user_id: "U1", status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "s", cancel_at_period_end: true, current_period_end: new Date(PERIOD_END * 1000).toISOString() };
  const s = await t.get_trainee_subscription.run({}, ctxFor("am I subscribed"));
  eq([s.subscribed, s.cancel_at_period_end, s.ends_on], [true, true, "2026-11-28"]);
  eq((await subscriptionStatus(store, "U1")).active, true);
  assert(!JSON.stringify(s).includes("cus_"), "Stripe ids are not shown");
});
Deno.test("billing/T5 without billing configured the tools are absent (the existing tool set is unchanged)", () => {
  assert(!careerTools({ postings: async () => [] }).some((t) => /trainee_subscription|subscribe_to_trainee/.test(t.name)));
});
