// Live wiring of the message router and the flows (buy from a text INV-011, cancel BILL-003, pay a person PAY-001/PAY-002,
// split an expense PAY-004, monthly rent as a standing flow PAY-005 / real-world C110) into the agent-chat handler. Phase 1 and Rail 1, docs/instinct-spec-series/BUILD-STATUS.md.
//
// What this module does, per message:
//   1. Restore the thread's flow state (agent_flow_state) and decide whether the message could be a flow at all.
//   2. Load the user's real data the flows need (transactions, brokerage accounts, saved recipients) through the caller's
//      RLS-scoped client. Pay and split share one recipient book (Rail 1): the same resolution, the same stranger path.
//      The send flow also gets the person's bank balances (agent_financial_accounts), so a send above the cash they
//      have is said before any card, with the number's source and as-of time; an unreadable or stale balance says nothing.
//   3. Build the three sessions with connectors that report every rail that is not live as NOT_WIRED. Nothing here fakes
//      a fill, a cancellation or a send: there is no broker-dealer adapter, no account-page reader and no partner rail,
//      so the flows say so in their own words. A Venmo or Zelle handoff is staged for the person to send, which needs no
//      rail, and is said plainly.
//   4. Call AgentRouter.handle with a model extractor (forced tool call, inside the model budget). The model only
//      extracts; code grounds every span; approvals never come from the model; model failure falls back to the regex net.
//   5. Save the state and any recipient the person saved (a completed send, or an explicit SAVE) before the reply goes
//      out, and return route metadata for the gauntlet.
import { AgentRouter, AgentTrade, AgentCancel, AgentSend, AgentSplit, AgentRecipients, StandingRent, BrokerAccounts, MerchantTerms, MERCHANT_TERMS_JSON, Compliance, CapabilityRegistry, REGISTRY_JSON } from "./router_core.js";
import { reserveModelCall, recordModelUsage, ModelUnavailableError } from "./model_calls.ts";
import { callModel, type CallOptions, type ModelConfig } from "./model_gateway.ts";
import { playbookRegistry } from "../agent-exec/merchant-catalog.ts";

let registryCache: any = null;
export function flowRegistry(): any {
  if (!registryCache) registryCache = CapabilityRegistry.load(REGISTRY_JSON, () => true);
  return registryCache;
}

export class NotWired extends Error {
  constructor(what: string) { super(`NOT_WIRED: ${what}`); }
}

// Every partner record is absent: no adapter exists for any of them. This is code, not configuration, so no environment
// variable can make a rail look live. When an adapter lands, it adds itself here together with its read-back.
export const LIVE_PARTNERS: Record<string, unknown> = Object.freeze({});

import { readRecentTransactions } from "./recent_transactions.ts";

export interface FlowData {
  ok: boolean;
  missing?: string;
  transactions: any[];
  brokerageAccounts: any[];
  people: any[];
  instruments: any[];
  directory: Record<string, any>;
  // Rows of public.saved_recipients. recipients_ok false means the table could not be read: person-to-person flows say
  // so instead of treating everyone as a stranger.
  recipients?: any[];
  recipients_ok?: boolean;
  // Rows of public.standing_payments (the person's rent rule). standing_ok false means the table could not be read: the
  // rent flow says so instead of treating the person as having no rent set up.
  standing?: any[];
  standing_ok?: boolean;
  // The person's own bank rows (agent_financial_accounts, kinds merged from agent_account_preferences), for the send
  // flow's balance check (corpus 1.05). null when they could not be read: then no balance is ever claimed.
  bankAccounts?: any[] | null;
}

export interface FlowDb {
  loadState(): Promise<any | null>;
  saveState(state: any): Promise<void>;
  loadData(): Promise<FlowData>;
  saveRecipients?(rows: any[]): Promise<void>;
  // The rent flow's writes (a rule saved on the person's yes, changed, stopped, or a month staged), applied in order.
  saveStanding?(ops: any[]): Promise<void>;
}

export interface RouteMeta {
  route: string;
  flow: string | null;
  source: string;
  understood: boolean;
  understood_first: boolean;
  outcome: string | null;
  canonical: string | null;
  ask_reason: string | null;
  problems: string[];
}

export interface FlowReply { reply: string; route: RouteMeta; withhold_user_text: boolean }
// The message was not a flow, but a live card was dropped because of it: the host answers the message as usual and puts
// this note in front of its reply, so the card never stays pending silently and a later "yes" cannot fire it.
export interface FlowFallthrough { fallthrough: true; note: string }

// Brokerage connect (owner decision 2026-10-11): every person trades in THEIR OWN live brokerage account, connected
// through OAuth (supabase/functions/broker-oauth-start, broker-oauth-callback). No shared account, no paper. Every request
// resolves the caller's own connection (packages/domain/73-broker-accounts.js): rows through the caller's RLS client (the
// table's owner-only policy), the token from the Vault through the service-role RPC broker_token_read(p_user, p_account),
// which recomputes the secret name from the caller's id. Nothing is cached between requests. When nothing can be opened,
// the trade flow is told why (connect, reconnect, not_wired, isolation, unavailable) and says it plainly. A 401 from the
// broker marks the row for Reconnect (broker_mark_reconnect wipes the token) before the reply goes out. Every order is
// capped at UPMORE_LIVE_ORDER_CAP_CENTS ($5.00 when unset) until the owner raises it. Log lines start "[LIVE ...]" and
// never carry a token.
export interface UserBroker { connectors?: any; partners?: Record<string, unknown>; label?: string; account?: any; connect?: { code: string; message: string }; flush?: () => Promise<unknown> }
export interface BrokerSource {
  rows(): Promise<any[] | null>;
  token(q: { user_id: string; account: string }): Promise<string | null>;
  markReconnect(q: { user_id: string; account: string }): Promise<unknown>;
}
export function brokerSource(caller: any, admin: any, userId: string): BrokerSource {
  return {
    rows: async () => {
      const r = await caller.from("brokerage_accounts").select("id,user_id,provider,label,paper,account_id,account_mask,status,created_at").eq("user_id", userId);
      return r.error ? null : (r.data || []);
    },
    token: async (q) => {
      const r = await admin.rpc("broker_token_read", { p_user: q.user_id, p_account: q.account });
      if (r.error) throw new Error("broker token read failed");
      return typeof r.data === "string" && r.data ? r.data : null;
    },
    markReconnect: async (q) => {
      const r = await admin.rpc("broker_mark_reconnect", { p_user: q.user_id, p_account: q.account });
      if (r.error) throw new Error("broker reconnect mark failed");
      return r.data;
    },
  };
}
// clock: the as-of on every broker read (positions, assets, the account); the wall clock unless a caller (an eval with a
// stepped clock) supplies its own, so a position's "as of" and the flow's own clock never disagree.
export async function userBroker(env: { get(k: string): string | undefined }, userId: string, src: BrokerSource | null, log: (line: string) => void = () => {}, fetchFn?: typeof fetch, clock?: () => number): Promise<UserBroker> {
  const unavailable = { connect: { code: "unavailable", message: BrokerAccounts.MESSAGES.unavailable } };
  if (!src) return unavailable;
  const rows = await src.rows().catch(() => null);
  if (rows === null) { log("[LIVE] NOT_WIRED: brokerage connections could not be read"); return unavailable; }
  const jobs: Promise<unknown>[] = [];
  const made: any = await BrokerAccounts.resolve({
    user_id: userId, rows, credential: src.token, order_cap_cents: env.get("UPMORE_LIVE_ORDER_CAP_CENTS"),
    on_auth_failure: (q: { user_id: string; account: string }) => { jobs.push(src.markReconnect(q).catch(() => log("[LIVE] reconnect mark failed"))); },
    adapter: { log, ...(fetchFn ? { fetch: fetchFn } : {}), ...(clock ? { clock } : {}) },
    ...(clock ? { clock } : {}),
  });
  if (!made.wired) { log(`[LIVE] ${made.reason}`); return { connect: { code: made.code, message: made.message } }; }
  return { connectors: made.connectors, partners: made.partners, label: made.label, account: made.account, flush: () => Promise.allSettled(jobs) };
}

export function liveConnectors(data: FlowData, now: () => number) {
  const notWired = (what: string) => async () => { throw new NotWired(what); };
  return {
    trade: {
      read: async (kind: string) => {
        if (kind === "brokerage_accounts") {
          if (!data.brokerageAccounts.length) throw new NotWired("no brokerage account linked");
          return { value: data.brokerageAccounts, source: "your linked brokerage accounts", as_of: now() };
        }
        throw new NotWired(`${kind}: no market-data or brokerage adapter`);
      },
      write: notWired("order placement: no broker-dealer adapter"),
      verify: notWired("order read-back: no broker-dealer adapter"),
    },
    cancel: {
      read: async (kind: string) => { throw new NotWired(`${kind}: no account-page reader for this merchant`); },
      write: notWired("cancellation from chat: the runner is not connected to this flow"),
      verify: notWired("merchant record read-back"),
    },
    send: {
      read: async (kind: string) => { throw new NotWired(`${kind}: no payment-rail read`); },
      write: notWired("money movement: no partner rail"),
      verify: notWired("payment read-back: no partner rail"),
    },
    split: {
      read: async (kind: string) => { throw new NotWired(`${kind}: no payment-rail read`); },
      write: notWired("money requests: staged for the person to tap Request; no rail is written"),
      verify: notWired("request read-back: no partner rail"),
    },
  };
}

// Rail 3: the merchants' published terms pages, configured as data (packages/connectors/merchant-terms.json, embedded in
// the bundle). Read with the function's own fetch; a page that fails or hangs (6 s) is said plainly, never filled in.
let termsConfig: any = null;
export function termsReader(fetchFn: typeof fetch, now: () => number) {
  if (!termsConfig) termsConfig = MerchantTerms.load(MERCHANT_TERMS_JSON);
  return { read: (merchant: string) => MerchantTerms.read(merchant, { config: termsConfig, fetch: fetchFn, clock: now, timeout_ms: 6000 }), facts: (r: any) => MerchantTerms.facts(r, { config: termsConfig }) };
}

// The person's local date for a time zone, or null (an unknown zone falls back to the session's own UTC day).
export function localDate(ms: number, tz: string | null | undefined): string | null {
  if (!tz) return null;
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); } catch { return null; }
}

export function buildSessions(data: FlowData, saved: any, now: () => number, channel: string | null = null, broker: UserBroker | null = null, termsFetch: typeof fetch | null = null, tz: string | null = null) {
  const registry = flowRegistry(), c = liveConnectors(data, now), s = saved || {};
  // One recipient book for every person-to-person flow in this message.
  const recipients = AgentRecipients.book({ rows: data.recipients || [], people: data.people || [], unavailable: data.recipients_ok === false, clock: now, channel });
  return {
    // Buy and cancel count "today", refund windows and the undo window in the person's own day (their time zone).
    trade: AgentTrade.create({ registry, connectors: broker && broker.connectors ? broker.connectors : c.trade, clock: now, tz, instruments: data.instruments, partners: broker && broker.partners ? broker.partners : LIVE_PARTNERS, connect: broker && broker.connect ? broker.connect : null, compliance: Compliance, state: s.trade }),
    cancel: (() => { const tr = termsFetch ? termsReader(termsFetch, now) : null; return AgentCancel.create({ registry, connectors: c.cancel, clock: now, tz, transactions: data.transactions, directory: data.directory, state: s.cancel, terms_reader: tr ? tr.read : undefined, terms_facts: tr ? tr.facts : undefined }); })(),
    send: AgentSend.create({ registry, connectors: c.send, clock: now, recipients, partners: LIVE_PARTNERS, compliance: Compliance, limits: { per_day_cents: 100000, per_week_cents: 300000 }, large_cents: 50000, state: s.send, balances: () => data.bankAccounts ?? null }),
    split: AgentSplit.create({ registry, connectors: c.split, clock: now, recipients, partners: LIVE_PARTNERS, compliance: Compliance, state: s.split }),
    // Saved nicknames ("mom is Anita Srikanth"): restated, then saved on a yes, only for someone already saved.
    nickname: AgentRecipients.nicknames({ book: recipients, clock: now, state: s.nickname }),
    // Rent stages each month for the person to send in their own app; it has no connector because it writes to no rail.
    // Rent's month is the person's own (their time zone), the same day the proactive rent offer counts in.
    rent: StandingRent.create({ clock: now, today: localDate(now(), tz) || undefined, rule: StandingRent.activeRule(data.standing || []), unavailable: data.standing_ok === false, recipients, state: s.rent }),
    recipients,
  };
}

const PARSERS = { trade: (t: string) => AgentTrade.parse(t), send: (t: string) => AgentSend.parse(t), cancel: (t: string) => AgentCancel.parse(t), split: (t: string) => AgentSplit.parse(t) };

// The router also takes the answer to a flow's own question ("Do you mean $4.50?") and, for a few minutes after a card
// settles, a second "yes" or a "cancel that" about it (they are answered from what happened, never by the model).
export function needsRouter(saved: any, now: number): boolean {
  if (hasLiveCard(saved)) return true;
  if (saved && saved.send && (saved.send.amount_check || saved.send.funds_check)) return true;
  if (saved && saved.split && saved.split.waiting_names) return true;
  return !!(saved && saved.router && saved.router.settled && now - saved.router.settled.at < 30 * 60000);
}
export function hasLiveCard(saved: any): boolean {
  if (!saved) return false;
  if (saved.router && saved.router.pair) return true;
  if (saved.trade && (saved.trade.pending || saved.trade.suggestion)) return true;
  // The balance question ("... less than $900.00. Set up $900.00 anyway?") waits on a yes like a card does, so a proactive
  // offer never takes that yes.
  if (saved.send && (saved.send.pending || saved.send.identity || saved.send.save_offer || saved.send.funds_check)) return true;
  if (saved.split && (saved.split.pending || saved.split.identity || (saved.split.save_offers || []).length)) return true;
  if (saved.rent && (saved.rent.pending || saved.rent.asking)) return true;
  if (saved.cancel && (Number.isInteger(saved.cancel.pending_index) || (saved.cancel.cases || []).some((k: any) => k && k.state === "otp"))) return true;
  if (saved.nickname && saved.nickname.pending) return true;
  return false;
}

// What each rent write means if it never reached the database, said instead of the flow's own reply.
const RENT_WRITES: Record<string, string> = { rent_set: "nothing was set up", rent_changed: "your rent stays as it was", rent_stopped: "rent is still on", staged: "nothing was staged" };

// One routed message. Returns null when the message is not a flow, so the existing handler answers it unchanged.
// What a live card is, in a few words, for the note that says it was dropped.
function liveCardWords(sessions: any): string[] {
  const out: string[] = [], m = (c: number) => "$" + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (sessions.send && sessions.send.pending) out.push(`the ${m(sessions.send.pending.amount_cents)} to ${sessions.send.pending.recipient}`);
  if (sessions.split && sessions.split.pending) out.push(`the ${m(sessions.split.pending.amount_cents)} split request`);
  if (sessions.trade && sessions.trade.pending) out.push(`the ${sessions.trade.pending.symbol} order`);
  if (sessions.cancel && sessions.cancel.pending) out.push("the cancellation");
  if (sessions.nickname && sessions.nickname.pending) out.push(`the "${sessions.nickname.pending.nickname}" nickname`);
  if (sessions.rent && sessions.rent.pending) out.push("the rent card");
  return out;
}

export async function routeFlows(message: string, deps: { db: FlowDb; extract: ((m: string) => Promise<any>) | null; now?: () => number; timeoutMs?: number; channel?: string | null; broker?: UserBroker | null; brokerFactory?: () => Promise<UserBroker>; termsFetch?: typeof fetch | null; tz?: string | null }): Promise<FlowReply | FlowFallthrough | null> {
  const now = deps.now ?? (() => Date.now());
  const saved = await deps.db.loadState();
  if (!needsRouter(saved, now()) && !AgentRouter.maybeFlow(message)) return null;
  const data = await deps.db.loadData();
  if (!data.ok) {
    return { reply: `I can't read your ${data.missing || "linked accounts"} right now, so I can't do that yet. Nothing was changed.`, withhold_user_text: false,
      route: { route: "unavailable", flow: null, source: "deterministic", understood: false, understood_first: false, outcome: "unavailable", canonical: null, ask_reason: null, problems: [data.missing || "data unavailable"] } };
  }
  // The brokerage connection (a row read and a Vault token read) is resolved only here, after the message is known to be
  // a flow or a live card exists: small talk never touches it.
  const broker = deps.broker ?? (deps.brokerFactory ? await deps.brokerFactory() : null);
  const built = buildSessions(data, saved, now, deps.channel ?? null, broker, deps.termsFetch === undefined ? fetch : deps.termsFetch, deps.tz ?? null);
  const { recipients, ...sessions } = built;
  // Money that landed since the last message: a staged send whose debit posted is complete (and saves its recipient);
  // a split request whose credit posted is paid. Said once, ahead of the reply.
  const notes = [...sessions.send.landed(data.transactions).map((x: any) => x.text), ...sessions.split.paid(data.transactions).map((x: any) => x.text), ...sessions.rent.landed(data.transactions).map((x: any) => x.text)];
  const memo = JSON.parse(JSON.stringify((saved && saved.router) || {}));
  const out = await AgentRouter.handle(message, { extract: deps.extract || undefined, sessions, parsers: PARSERS, timeout_ms: deps.timeoutMs ?? 8000, memo, now });
  // A message that is not a flow, sent while a card is live, drops the card (CORE-009 S10): nothing stays pending silently.
  let dropNote: string | null = null;
  if (out.route === "fallthrough") {
    const words = liveCardWords(sessions);
    if (words.length) {
      for (const k of Object.keys(sessions)) if ((sessions as any)[k] && (sessions as any)[k].pending) await (sessions as any)[k].reply("never mind");
      dropNote = `(I dropped ${words.join(" and ")} since you moved on; nothing was sent. Say it again when you want it.)`;
    }
  }
  const state = { trade: sessions.trade.snapshot(), cancel: sessions.cancel.snapshot(), send: sessions.send.snapshot(), split: sessions.split.snapshot(), nickname: sessions.nickname.snapshot(), rent: sessions.rent.snapshot(), router: out.memo || memo };
  // Recipients saved on evidence (a completed send, or a handle typed back and SAVE) are written before the reply.
  const rows = recipients.drain();
  let saveError = false;
  if (rows.length) {
    try { if (!deps.db.saveRecipients) throw new Error("no recipient store"); await deps.db.saveRecipients(rows); } catch { saveError = true; }
  }
  // The rent rule's writes go to the database before the reply too; a write that fails is never claimed (below).
  const standingOps = sessions.rent.drain();
  let standingError = false;
  if (standingOps.length) {
    try { if (!deps.db.saveStanding) throw new Error("no standing store"); await deps.db.saveStanding(standingOps); } catch { standingError = true; }
  }
  if (out.route === "fallthrough") {
    // A dropped card is still a state change; keep it, then let the existing handler answer.
    if (JSON.stringify(state) !== JSON.stringify({ trade: saved?.trade ?? state.trade, cancel: saved?.cancel ?? state.cancel, send: saved?.send ?? state.send, split: saved?.split ?? state.split, nickname: saved?.nickname ?? state.nickname, rent: saved?.rent ?? state.rent, router: saved?.router ?? state.router })) await deps.db.saveState(state);
    return dropNote ? { fallthrough: true, note: dropNote } : null;
  }
  // Saved before the reply leaves, so a crash never leaves a card the person can see without the state that makes it safe.
  await deps.db.saveState(state);
  const r = out.result || {};
  let reply = typeof r.text === "string" && r.text.trim() ? r.text : r.outcome === "nothing_pending" ? "There's nothing waiting on you." : "Okay.";
  // Never claim a save that did not reach the database.
  if (saveError && r.outcome === "saved") reply = "I couldn't save that right now, so nothing was saved. Reply SAVE again in a moment.";
  if (saveError && r.outcome === "nickname_saved") reply = `I couldn't save "${r.nickname}" right now, so nothing was saved. Say it again in a moment.`;
  // A rent rule, change, stop or staged month that did not reach the database is not claimed: nothing changed.
  const rentLost = standingError && !!RENT_WRITES[r.outcome];
  if (rentLost) reply = `I couldn't save that right now, so ${RENT_WRITES[r.outcome]}. Nothing was sent. Try again in a moment.`;
  if (notes.length) reply = `${notes.join(" ")} ${reply}`;
  const problems = [...(out.problems ?? []), ...(saveError ? ["recipient save failed"] : []), ...(standingError ? ["standing payment save failed"] : [])];
  return {
    reply,
    withhold_user_text: !!out.withhold_text,
    route: { route: out.route, flow: out.flow ?? null, source: out.source, understood: !!out.understood, understood_first: !!out.understood_first, outcome: (saveError && (r.outcome === "saved" || r.outcome === "nickname_saved")) || rentLost ? "not_saved" : r.outcome ?? null, canonical: out.canonical ?? null, ask_reason: out.ask_reason ?? null, problems },
  };
}

// The model call: one forced tool call inside the existing budget reservation, through the model gateway (OpenAI or
// Anthropic, same request). Any failure throws, and the router falls back to the regex net and marks the result source
// "regex_net".
export function routeExtractor(admin: any, userId: string, threadId: string, cfg: ModelConfig, o: CallOptions = {}) {
  return async (message: string) => {
    if (!cfg.apiKey) throw new Error("router model is not configured");
    const callId = await reserveModelCall(admin, userId, threadId, crypto.randomUUID(), 1, cfg.model);
    let body: any;
    try {
      body = await callModel(cfg, { max_tokens: 400, system: AgentRouter.SYSTEM, tools: [AgentRouter.TOOL], tool_choice: { type: "tool", name: AgentRouter.TOOL.name }, messages: [{ role: "user", content: message }] }, Object.assign({ timeoutMs: 10000 }, o, { role: "router" }));
    } catch (e) {
      if (e instanceof ModelUnavailableError) { console.error(`[model] router ${e.summary()}`); throw new Error(`router model ${e.summary()}`); }
      throw e;
    }
    await recordModelUsage(admin, callId, body.usage);
    const block = (body.content || []).find((b: any) => b && b.type === "tool_use" && b.name === AgentRouter.TOOL.name);
    if (!block || typeof block.input !== "object") throw new Error("router model returned no route_message call");
    return block.input;
  };
}

// The real data, read through the caller's RLS-scoped client. Every read failure is reported as unavailable, never
// treated as "you have nothing", so a database hiccup cannot turn into "I don't see a Netflix charge".
export function supabaseFlowDb(supabase: any, userId: string, threadId: string, now: () => number = () => Date.now()): FlowDb {
  return {
    async loadState() {
      const r = await supabase.from("agent_flow_state").select("state").eq("thread_id", threadId).eq("user_id", userId).maybeSingle();
      if (r.error) throw new Error("Flow state unavailable.");
      return r.data ? r.data.state : null;
    },
    async saveState(state: any) {
      const r = await supabase.from("agent_flow_state").upsert({ thread_id: threadId, user_id: userId, state, updated_at: new Date(now()).toISOString() }, { onConflict: "thread_id" });
      if (r.error) throw new Error("Flow state could not be saved.");
    },
    async loadData(): Promise<FlowData> {
      // Newest first, so the cap drops the oldest rows and never this month (_shared/recent_transactions.ts); the flows
      // get them oldest first, as before. A failed read is the "transactions" gap, never an answer from part of them.
      const [tx, accts, snaps, recsRead, standing, bank, prefs] = await Promise.all([
        readRecentTransactions(supabase, userId, now()).then((rows) => ({ data: rows.slice().reverse(), error: null }), (error) => ({ data: null, error })),
        supabase.from("brokerage_accounts").select("id,provider,label,paper,status").eq("user_id", userId),
        supabase.from("portfolio_snapshots").select("brokerage_account_id,cash,snapshot_at").eq("user_id", userId).order("snapshot_at", { ascending: false }).limit(50),
        supabase.from("saved_recipients").select("id,handle,display_name,channel,source,rail,last_used_at,nickname").eq("user_id", userId).limit(500),
        supabase.from("standing_payments").select("id,kind,payee_name,payee_handle,rail,amount_cents,day_of_month,funding,status,created_at,updated_at,last_staged_month").eq("user_id", userId).eq("kind", "rent").eq("status", "active").limit(5),
        supabase.from("agent_financial_accounts").select("account_id,name,institution,currency,account_kind,balance_cents,available_cents,balance_as_of,fetched_at,sync_error,status").eq("user_id", userId).eq("status", "active"),
        supabase.from("agent_account_preferences").select("account_id,account_kind").eq("user_id", userId),
      ]);
      let recs: any = recsRead;
      // Until the owner applies 20261012030000_saved_recipient_nicknames.sql the nickname column does not exist (Postgres
      // 42703): read the rows without it, so sends keep working and nobody has a nickname yet.
      if (recs.error && (recs.error.code === "42703" || /nickname/i.test(String(recs.error.message || "")))) {
        recs = await supabase.from("saved_recipients").select("id,handle,display_name,channel,source,rail,last_used_at").eq("user_id", userId).limit(500);
      }
      const empty = { transactions: [], brokerageAccounts: [], people: [], instruments: [], directory: {} };
      if (tx.error) return { ok: false, missing: "transactions", ...empty };
      if (accts.error || snaps.error) return { ok: false, missing: "brokerage accounts", ...empty };
      // An unreadable recipient table (or one not yet migrated) blocks only person-to-person flows, and they say so.
      // An unreadable standing table (or one not yet migrated) blocks only the rent flow, and it says so.
      // Unreadable bank rows only switch the send flow's balance check off (null); they never block a flow.
      return { ok: true, ...mapFlowData(tx.data || [], accts.data || [], snaps.data || [], recs.error ? null : recs.data || [], standing.error ? null : standing.data || [], bank.error ? null : mergeAccountKinds(bank.data || [], prefs.error ? [] : prefs.data || [])) };
    },
    async saveRecipients(rows: any[]) {
      for (const row of rows) {
        // A nickname the person said yes to: moved off any other row first (one nickname per person per word, enforced by
        // the unique index), then written on exactly one of this person's rows. Zero rows written is a failure, never "saved".
        if (row.op === "nickname") {
          if ((row.clear_row_ids || []).length) {
            const clr = await supabase.from("saved_recipients").update({ nickname: null }).eq("user_id", userId).in("id", row.clear_row_ids);
            if (clr.error) throw new Error("Nickname could not be moved.");
          }
          const set = await supabase.from("saved_recipients").update({ nickname: row.nickname }).eq("user_id", userId).eq("id", row.row_id).select("id");
          if (set.error || !Array.isArray(set.data) || set.data.length !== 1) throw new Error("Nickname could not be saved.");
          continue;
        }
        const at = row.last_used_at ?? new Date(now()).toISOString();
        if (row.op === "insert") {
          const ins = await supabase.from("saved_recipients").insert({ user_id: userId, handle: row.handle, display_name: row.display_name, channel: row.channel, source: row.source, rail: row.rail, evidence_ref: row.evidence_ref, last_used_at: at, ...(row.nickname ? { nickname: row.nickname } : {}) });
          if (!ins.error) continue;
          if (ins.error.code !== "23505") throw new Error("Recipient could not be saved.");
        }
        // Already saved (or saved by a concurrent message): touch it, and a completed send upgrades a confirmed save.
        // A nickname kept with SAVE goes on that row too, and must land on exactly one row (never claimed otherwise).
        const touch: Record<string, unknown> = row.source === "completed_send" ? { last_used_at: at, source: "completed_send" } : { last_used_at: at };
        if (row.op === "insert" && row.nickname) touch.nickname = row.nickname;
        let q = supabase.from("saved_recipients").update(touch).eq("user_id", userId);
        q = row.handle ? q.ilike("handle", String(row.handle).replace(/[\\%_]/g, (c: string) => "\\" + c)) : q.eq("display_name", row.display_name);
        if (row.rail) q = q.eq("rail", row.rail);
        const up = touch.nickname ? await q.select("id") : await q;
        if (up.error) throw new Error("Recipient could not be updated.");
        if (touch.nickname && (!Array.isArray(up.data) || up.data.length !== 1)) throw new Error("Nickname could not be saved.");
      }
    },
    // Through the caller's RLS client (owner-only policies); every write names the caller's own user id.
    async saveStanding(ops: any[]) {
      const at = new Date(now()).toISOString();
      for (const op of ops) {
        if (op.op === "insert") {
          const ins = await supabase.from("standing_payments").insert(Object.assign({}, op.row, { user_id: userId, created_at: at, updated_at: at }));
          if (ins.error) throw new Error("Standing payment could not be saved.");
        } else if (op.op === "update" && op.id) {
          const up = await supabase.from("standing_payments").update(Object.assign({}, op.set, { updated_at: at })).eq("id", op.id).eq("user_id", userId);
          if (up.error) throw new Error("Standing payment could not be updated.");
        }
      }
    },
  };
}

// Pure mapping from database rows to what the flows read. Everything is live (owner rule 2026-10-11): a paper account row
// is never shown or offered, and only active, live connections are listed.
// The person's own account types (agent_account_preferences) win over the provider's, which SimpleFIN leaves "unknown"
// (the same merge as mergeKinds in agent-chat/_shared/money_answers.ts, kept here so _shared does not import agent-chat).
export function mergeAccountKinds(accounts: any[], prefs: { account_id: string; account_kind: string }[]): any[] {
  const by = new Map((prefs || []).map((p) => [p.account_id, p.account_kind]));
  return (accounts || []).map((a) => (by.has(a.account_id) ? { ...a, account_kind: by.get(a.account_id) } : a));
}

export function mapFlowData(txRows: any[], acctRows: any[], snapRows: any[], recipientRows: any[] | null = [], standingRows: any[] | null = [], bankRows: any[] | null = []) {
  const transactions = txRows.filter(t => t.posted_on && !t.is_pending).map(t => ({ id: t.provider_transaction_id, account_id: t.account_id, posted_at: t.posted_on, amount: Number(t.amount_cents) / 100, merchant_raw: t.merchant_raw, is_pending: !!t.is_pending, is_transfer: !!t.is_transfer }));
  const cashOf = (id: string) => { const s = snapRows.find(r => r.brokerage_account_id === id); return s && s.cash !== null && s.cash !== undefined ? Math.round(Number(s.cash) * 100) : undefined; };
  const brokerageAccounts = acctRows.filter(a => a.status !== "revoked" && a.paper !== true).map(a => ({ id: a.id, name: `${a.provider} ${a.label}`, paper: !!a.paper, fractional: true, cash_cents: cashOf(a.id), tradable: a.status === "active" }));
  // People come only from public.saved_recipients (rows saved on evidence); anyone else is a stranger and is confirmed in
  // full. No instrument list exists yet; orders stop at the compliance gate before needing one.
  const people: any[] = [], instruments: any[] = [];
  // Bank rows pass through as read (the send flow's fundsCheck decides what is known); disconnected ones are left out.
  const bankAccounts = bankRows === null ? null : bankRows.filter(a => a && a.status !== "disconnected");
  return { transactions, brokerageAccounts, people, instruments, directory: merchantDirectory(), recipients: recipientRows || [], recipients_ok: recipientRows !== null, standing: standingRows || [], standing_ok: standingRows !== null, bankAccounts };
}

// Where each known merchant's own cancellation page is, from the researched catalog. Used only to point the person at
// the page when the flow cannot act; every playbook is unverified until a live authenticated run succeeds.
export function merchantDirectory(): Record<string, any> {
  const out: Record<string, any> = {};
  for (const p of Object.values(playbookRegistry as Record<string, any>)) {
    if (!p || !p.merchant_key) continue;
    out[String(p.merchant_key).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()] = { kind: "portal", url: p.account_url, verified: p.verified === true, display_name: p.display_name };
  }
  return out;
}

// When the flow layer itself fails (state or data unreadable), a message that could be a flow, or a short reply that
// could answer a card, gets one honest line; anything else falls through to the existing handler.
export function flowErrorReply(message: string): FlowReply | null {
  const short = /^\s*(1|2|3|y|ya|yes|n|no|ok|okay|sure|confirm|details?|never ?mind|save|new|\d{4,8})\s*[.!?]*\s*$/i.test(message) || /^\s*[@$][\w.-]{1,40}\s*$/.test(message);
  if (!short && !AgentRouter.maybeFlow(message)) return null;
  return { reply: "Something went wrong reading this conversation's pending card or your accounts, so I did nothing. Nothing was changed. Try again in a moment.", withhold_user_text: /^\s*\d{4,8}\s*$/.test(message),
    route: { route: "error", flow: null, source: "deterministic", understood: false, understood_first: false, outcome: "error", canonical: null, ask_reason: null, problems: ["flow layer error"] } };
}
