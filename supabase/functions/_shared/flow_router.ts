// Live wiring of the message router and the three proven flows (buy from a text INV-011, cancel BILL-003, pay a person
// back PAY-001) into the agent-chat handler. Phase 1, docs/instinct-spec-series/BUILD-STATUS.md.
//
// What this module does, per message:
//   1. Restore the thread's flow state (agent_flow_state) and decide whether the message could be a flow at all.
//   2. Load the user's real data the flows need (transactions, brokerage accounts) through the caller's RLS-scoped client.
//   3. Build the three sessions with connectors that report every rail that is not live as NOT_WIRED. Nothing here fakes
//      a fill, a cancellation or a send: there is no broker-dealer adapter, no account-page reader and no partner rail,
//      so the flows say so in their own words. A Venmo or Zelle handoff is staged for the person to send, which needs no
//      rail, and is said plainly.
//   4. Call AgentRouter.handle with a model extractor (forced tool call, inside the model budget). The model only
//      extracts; code grounds every span; approvals never come from the model; model failure falls back to the regex net.
//   5. Save the state before the reply goes out, and return route metadata for the gauntlet.
import { AgentRouter, AgentTrade, AgentCancel, AgentSend, Compliance, CapabilityRegistry, REGISTRY_JSON } from "./router_core.js";
import { reserveModelCall, recordModelUsage } from "./model_calls.ts";
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

export interface FlowData {
  ok: boolean;
  missing?: string;
  transactions: any[];
  brokerageAccounts: any[];
  people: any[];
  instruments: any[];
  directory: Record<string, any>;
}

export interface FlowDb {
  loadState(): Promise<any | null>;
  saveState(state: any): Promise<void>;
  loadData(): Promise<FlowData>;
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
  };
}

export function buildSessions(data: FlowData, saved: any, now: () => number) {
  const registry = flowRegistry(), c = liveConnectors(data, now), s = saved || {};
  return {
    trade: AgentTrade.create({ registry, connectors: c.trade, clock: now, instruments: data.instruments, partners: LIVE_PARTNERS, compliance: Compliance, state: s.trade }),
    cancel: AgentCancel.create({ registry, connectors: c.cancel, clock: now, transactions: data.transactions, directory: data.directory, state: s.cancel }),
    send: AgentSend.create({ registry, connectors: c.send, clock: now, people: data.people, partners: LIVE_PARTNERS, compliance: Compliance, limits: { per_day_cents: 100000, per_week_cents: 300000 }, large_cents: 50000, state: s.send }),
  };
}

const PARSERS = { trade: (t: string) => AgentTrade.parse(t), send: (t: string) => AgentSend.parse(t), cancel: (t: string) => AgentCancel.parse(t) };

export function hasLiveCard(saved: any): boolean {
  if (!saved) return false;
  if (saved.trade && saved.trade.pending) return true;
  if (saved.send && saved.send.pending) return true;
  if (saved.cancel && (Number.isInteger(saved.cancel.pending_index) || (saved.cancel.cases || []).some((k: any) => k && k.state === "otp"))) return true;
  return false;
}

// One routed message. Returns null when the message is not a flow, so the existing handler answers it unchanged.
export async function routeFlows(message: string, deps: { db: FlowDb; extract: ((m: string) => Promise<any>) | null; now?: () => number; timeoutMs?: number }): Promise<FlowReply | null> {
  const now = deps.now ?? (() => Date.now());
  const saved = await deps.db.loadState();
  if (!hasLiveCard(saved) && !AgentRouter.maybeFlow(message)) return null;
  const data = await deps.db.loadData();
  if (!data.ok) {
    return { reply: `I can't read your ${data.missing || "linked accounts"} right now, so I can't do that yet. Nothing was changed.`, withhold_user_text: false,
      route: { route: "unavailable", flow: null, source: "deterministic", understood: false, understood_first: false, outcome: "unavailable", canonical: null, ask_reason: null, problems: [data.missing || "data unavailable"] } };
  }
  const sessions = buildSessions(data, saved, now);
  const out = await AgentRouter.handle(message, { extract: deps.extract || undefined, sessions, parsers: PARSERS, timeout_ms: deps.timeoutMs ?? 8000 });
  const state = { trade: sessions.trade.snapshot(), cancel: sessions.cancel.snapshot(), send: sessions.send.snapshot() };
  if (out.route === "fallthrough") {
    // A dropped card is still a state change; keep it, then let the existing handler answer.
    if (JSON.stringify(state) !== JSON.stringify({ trade: saved?.trade ?? state.trade, cancel: saved?.cancel ?? state.cancel, send: saved?.send ?? state.send })) await deps.db.saveState(state);
    return null;
  }
  // Saved before the reply leaves, so a crash never leaves a card the person can see without the state that makes it safe.
  await deps.db.saveState(state);
  const r = out.result || {};
  const reply = typeof r.text === "string" && r.text.trim() ? r.text : r.outcome === "nothing_pending" ? "There's nothing waiting on you." : "Okay.";
  return {
    reply,
    withhold_user_text: !!out.withhold_text,
    route: { route: out.route, flow: out.flow ?? null, source: out.source, understood: !!out.understood, understood_first: !!out.understood_first, outcome: r.outcome ?? null, canonical: out.canonical ?? null, ask_reason: out.ask_reason ?? null, problems: out.problems ?? [] },
  };
}

// The model call: one forced tool call inside the existing budget reservation. Any failure throws, and the router falls
// back to the regex net and marks the result source "regex_net".
export function anthropicRouteExtractor(admin: any, userId: string, threadId: string, model: string, apiKey: string, request: typeof fetch = fetch) {
  return async (message: string) => {
    if (!apiKey) throw new Error("router model is not configured");
    const callId = await reserveModelCall(admin, userId, threadId, crypto.randomUUID(), 1, model);
    const res = await request("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 400, system: AgentRouter.SYSTEM, tools: [AgentRouter.TOOL], tool_choice: { type: "tool", name: AgentRouter.TOOL.name }, messages: [{ role: "user", content: message }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`router model HTTP ${res.status}`);
    const raw = await res.text();
    if (raw.length > 30000) throw new Error("router model response is too large");
    const body = JSON.parse(raw);
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
      const since = new Date(now() - 400 * 86400000).toISOString().slice(0, 10);
      const [tx, accts, snaps] = await Promise.all([
        supabase.from("agent_financial_transactions").select("account_id,provider_transaction_id,amount_cents,posted_on,merchant_raw,is_pending,is_transfer")
          .eq("user_id", userId).gte("posted_on", since).order("posted_on", { ascending: true }).limit(3000),
        supabase.from("brokerage_accounts").select("id,provider,label,paper,status").eq("user_id", userId),
        supabase.from("portfolio_snapshots").select("brokerage_account_id,cash,snapshot_at").eq("user_id", userId).order("snapshot_at", { ascending: false }).limit(50),
      ]);
      const empty = { transactions: [], brokerageAccounts: [], people: [], instruments: [], directory: {} };
      if (tx.error) return { ok: false, missing: "transactions", ...empty };
      if (accts.error || snaps.error) return { ok: false, missing: "brokerage accounts", ...empty };
      return { ok: true, ...mapFlowData(tx.data || [], accts.data || [], snaps.data || []) };
    },
  };
}

// Pure mapping from database rows to what the flows read. Paper accounts are labeled as paper, never presented as live.
export function mapFlowData(txRows: any[], acctRows: any[], snapRows: any[]) {
  const transactions = txRows.filter(t => t.posted_on && !t.is_pending).map(t => ({ id: t.provider_transaction_id, account_id: t.account_id, posted_at: t.posted_on, amount: Number(t.amount_cents) / 100, merchant_raw: t.merchant_raw, is_pending: !!t.is_pending, is_transfer: !!t.is_transfer }));
  const cashOf = (id: string) => { const s = snapRows.find(r => r.brokerage_account_id === id); return s && s.cash !== null && s.cash !== undefined ? Math.round(Number(s.cash) * 100) : undefined; };
  const brokerageAccounts = acctRows.filter(a => a.status !== "revoked").map(a => ({ id: a.id, name: `${a.provider} ${a.label}${a.paper ? " (paper)" : ""}`, paper: !!a.paper, fractional: true, cash_cents: cashOf(a.id), tradable: a.status === "active" }));
  // No saved-recipient table exists yet, so the send flow knows no one: every person is a first-time recipient and is
  // confirmed in full. No instrument list exists yet; orders stop at the compliance gate before needing one.
  const people: any[] = [], instruments: any[] = [];
  return { transactions, brokerageAccounts, people, instruments, directory: merchantDirectory() };
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
  const short = /^\s*(1|2|3|y|yes|n|no|ok|okay|sure|confirm|details?|never ?mind|\d{4,8})\s*[.!?]*\s*$/i.test(message);
  if (!short && !AgentRouter.maybeFlow(message)) return null;
  return { reply: "Something went wrong reading this conversation's pending card or your accounts, so I did nothing. Nothing was changed. Try again in a moment.", withhold_user_text: /^\s*\d{4,8}\s*$/.test(message),
    route: { route: "error", flow: null, source: "deterministic", understood: false, understood_first: false, outcome: "error", canonical: null, ask_reason: null, problems: ["flow layer error"] } };
}
