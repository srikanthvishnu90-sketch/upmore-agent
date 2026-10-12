// The megadoc's 240 messages through the chat's settings commands and then the REAL flow router (the chat's own order),
// offline, one fresh thread each: what Upmore does today with
// the first message, as evidence for the hand verdicts in evals/scenarios/verdicts.json. Not a pass/fail grader: many
// megadoc MSG lines describe a situation ("buy NVDA and it was rejected") rather than quote a person, and the verdicts
// say so. World: the corpus world (evals/corpus/replay.ts: mock Alpaca inside this eval only, cash $1,340.22, PLTR held,
// Netflix/Hulu/Spotify charges) plus every @handle a scenario's DO names as saved, so "send maya 40" can resolve.
import { routeFlows, mapFlowData, userBroker, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";
import { parseCommand } from "../../supabase/functions/_shared/proactive.ts";
import { PEOPLE, T0, txs, mockAlpaca, EXECUTED } from "../corpus/replay.ts";
import mega from "./megadoc.json" with { type: "json" };

const title = (h: string) => h.replace(/^@/, "").replace(/\d+$/, "").split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
// Saved people a scenario names: "@maya-k (Maya K.)", "saved @dad-s". Look-alikes and new handles are not saved.
export function peopleOf(s: any) {
  const out: any[] = []; const seen = new Set<string>();
  const re = /(saved\s+)?(@[a-z][\w-]*)(?:\s+\(([^)]+)\))?/gi; let m;
  const text = `${s.do} ${s.msg}`;
  while ((m = re.exec(text))) {
    const h = m[2].toLowerCase(), near = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    if (seen.has(h) || /new|first-time|not in your saved|look-alike|lookalike/.test(near) || /\d$/.test(h) && !m[1]) continue;
    // A parenthetical is a name only when it looks like one ("Maya K."), not a note ("single match", "inside a forwarded email").
    const named = m[3] && /^[A-Z][a-z]+(?: [A-Z][a-z]*\.?){0,2}$/.test(m[3].trim());
    // Only a handle the doc calls saved, or shows with a person's name, is a saved person.
    if (!m[1] && !named && !/\bsaved\b/i.test(near)) continue;
    const nm = named ? m[3].trim() : title(h);
    seen.add(h); out.push({ id: "m" + out.length, handle: h, display_name: nm.replace(/\.$/, ""), channel: "in-app", source: "completed_send", rail: "venmo", last_used_at: "2026-10-01T00:00:00Z" });
  }
  return out;
}
// The words a person would type: a trailing "(context)" is the doc's note, not the message.
export const typed = (msg: string) => msg.replace(/\s*\([^)]*\)\s*$/, "").trim();

// One world for all 240: the corpus people plus every saved handle any scenario names (so "send maya 40" in A06 resolves
// to the @maya-k that A01 describes). Handles under 3 characters are notes ("@x"), not people.
export const MEGA_PEOPLE = (() => {
  const seen = new Set(PEOPLE.map(p => p.handle)), out: any[] = [];
  for (const sc of (mega as any).scenarios) for (const p of peopleOf(sc)) if (!seen.has(p.handle) && p.handle.length > 3) { seen.add(p.handle); out.push(Object.assign({}, p, { id: "m" + out.length })); }
  return PEOPLE.concat(out);
})();
export async function simulate(s: any) {
  let state: any = null; const now = T0;
  const people = MEGA_PEOPLE;
  const db: FlowDb = {
    async loadState() { return state ? JSON.parse(JSON.stringify(state)) : null; },
    async saveState(x: any) { state = JSON.parse(JSON.stringify(x)); },
    async loadData() { return { ok: true, ...mapFlowData(txs(), [], [], people) }; },
    async saveRecipients() {},
  } as FlowDb;
  const alpaca = mockAlpaca(() => now, true);
  const row = { id: "row-u", user_id: "u", provider: "alpaca", label: "main", paper: false, account_id: "acct-mock", account_mask: "****4417", status: "active", created_at: "2026-10-01" };
  const brokerFactory = () => userBroker({ get: () => undefined }, "u", { rows: async () => [row], token: async () => JSON.stringify({ access_token: "mock-token" }), markReconnect: async () => true } as any, () => {}, alpaca.f, () => now);
  const text = typed(s.msg);
  // The chat handler answers the person's settings commands before the flows ("set a late fee alert", "pay maya 40
  // tomorrow at 9", reminders, budgets, IOUs): the same order here, so the evidence is what the person would see.
  const sc: any = parseCommand(text, { time_zone: "America/New_York", watches: [] } as any, now);
  // A saved setting is recorded (the chat writes it before replying, and a failed write says nothing changed), but it is
  // never an execution: nothing moves money.
  if (sc) { const saved = Object.keys(sc.settings || {}).length > 0; return { typed: text, flow: "settings", outcome: saved ? "settings_saved" : "settings_reply", reply: sc.reply, executed: false, recorded: saved, mock_orders: alpaca.orders.length }; }
  const r: any = await routeFlows(text, { db, extract: async () => { throw new Error("router model off (offline)"); }, now: () => now, brokerFactory, termsFetch: null } as any);
  if (!r || r.fallthrough) return { typed: text, flow: null, outcome: "needs_model", reply: null, executed: false, mock_orders: alpaca.orders.length };
  return { typed: text, flow: r.route.flow, outcome: r.route.outcome, reply: r.reply, executed: EXECUTED.has(r.route.outcome), mock_orders: alpaca.orders.length };
}

if (import.meta.main) {
  const rows: any[] = [];
  for (const s of (mega as any).scenarios) rows.push({ id: s.id, ...(await simulate(s)) });
  await Deno.writeTextFile(new URL("./results/sim.json", import.meta.url), JSON.stringify({ note: "offline, router model off, mock Alpaca; evidence only", rows }, null, 1) + "\n");
  const c: Record<string, number> = {}; for (const r of rows) c[r.outcome] = (c[r.outcome] || 0) + 1;
  console.log(`megadoc sim: ${rows.length} first messages; outcomes ${JSON.stringify(c)}; executed ${rows.filter(r => r.executed).length}, mock orders ${rows.reduce((a, r) => a + r.mock_orders, 0)}`);
}
