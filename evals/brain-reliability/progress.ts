// Aggregate-only view of the durable journal. Importing this reader never calls a provider.
import { costMicros } from "../../supabase/functions/_shared/model_gateway.ts";
import { recoverJournal } from "./run-comparison.ts";

const BRAINS = ["gpt-5-mini", "gpt-5"], JUDGES = ["gpt-5-mini", "gpt-4.1-mini"];
const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const insist = (ok: unknown) => { if (!ok) throw Error("INVALID_JOURNAL"); };
const shape = (e: any) => JSON.stringify([e.call_id, e.case_id, e.category, e.role, e.model, e.turn, e.reserve_micros]);
const usageOk = (u: any) => !!u && typeof u === "object" && !Array.isArray(u) &&
  [u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0].every(integer);
type Status = "WAITING" | "RUNNING" | "HALTED" | "COMPLETE" | "RETRY_SNAPSHOT" | "INVALID_SNAPSHOT";
function unavailable(status: Status) {
  return { status, settled_calls: null, completed_cases: null, processed_cases: null, known_cost_usd: null,
    held_reservations_usd: null, unknown_charges: null, unsettled_calls: null, total_cost_final: false };
}

export function journalProgress(raw: string) {
  // durableAppend writes newline + fsync per event. A reader racing a write must retry the whole snapshot.
  if (raw && !raw.endsWith("\n")) return unavailable("RETRY_SNAPSHOT");
  if (!raw.trim()) return { status: "WAITING" as Status, settled_calls: 0, completed_cases: 0, processed_cases: 0,
    known_cost_usd: 0, held_reservations_usd: 0, unknown_charges: 0, unsettled_calls: 0, total_cost_final: false };
  try {
    const events = raw.slice(0, -1).split("\n").map(line => JSON.parse(line));
    insist(events[0]?.type === "arm");
    const arm = events[0]; insist(BRAINS.includes(arm.model));
    const cap = arm.approval?.cap_usd * 1000000, prior = arm.approval?.comparison_spent_usd * 1000000;
    insist(integer(cap) && cap > 0 && integer(prior) && cap + prior <= 20000000 &&
      (arm.model !== "gpt-5-mini" || cap <= 5000000 && prior === 0));
    const open = new Map<number, any>(), reserved = new Set<number>(), settled = new Set<number>(), cases = new Set<string>();
    const callsByCase = new Map<string, any[]>();
    let charged = 0, unknown = 0, completed = 0, halted = false, finished = false, preflight = false;
    for (let n = 1; n < events.length; n++) {
      const e = events[n]; insist(e && typeof e === "object" && !finished);
      if (e.type === "preflight") { insist(!preflight && !reserved.size && e.status === "available"); preflight = true; }
      else if (e.type === "reserved") {
        insist(preflight && !halted && integer(e.call_id) && e.call_id === reserved.size + 1 && !reserved.has(e.call_id) &&
          integer(e.reserve_micros) && e.reserve_micros > 0 && integer(e.turn) && typeof e.case_id === "string" && !!e.case_id &&
          typeof e.category === "string" && !!e.category && (e.role === "brain" ? e.model === arm.model : e.role === "judge" && JUDGES.includes(e.model)));
        reserved.add(e.call_id); open.set(e.call_id, e);
      } else if (e.type === "settlement") {
        const reservation = open.get(e.call_id);
        insist(reservation && !settled.has(e.call_id) && shape(reservation) === shape(e) && Number.isFinite(e.latency_ms) && e.latency_ms >= 0);
        settled.add(e.call_id);
        if (e.status === "unknown") { insist(e.usd_micros === null && e.usage === null); unknown++; halted = true; }
        else { insist(e.status === "settled" && usageOk(e.usage) && integer(e.usd_micros) &&
          costMicros(e.model, e.usage) === e.usd_micros && e.usd_micros <= e.reserve_micros);
          charged += e.usd_micros; open.delete(e.call_id); }
        callsByCase.set(e.case_id, [...callsByCase.get(e.case_id) ?? [], e]);
      } else if (e.type === "item") {
        const i = e.item; insist(i && typeof i.id === "string" && !cases.has(i.id)); cases.add(i.id);
        const calls = callsByCase.get(i.id) ?? [];
        insist(integer(i.usd_micros) && i.usd_micros === calls.reduce((sum, c) => sum + (c.usd_micros ?? 0), 0));
        if (i.pass === null) halted = true;
        else {
          insist(typeof i.pass === "boolean" && !i.error && Array.isArray(i.judges) && i.judges.length === 2 &&
            JUDGES.every(model => i.judges.filter((j: any) => j.model === model && typeof j.pass === "boolean").length === 1) &&
            JUDGES.every(model => calls.filter(c => c.role === "judge" && c.model === model && c.status === "settled").length === 1));
          completed++;
        }
      } else if (e.type === "complete") {
        const s = e.summary, ledger = s?.ledger;
        insist(s && ["SCORED", "NOT_SCORED"].includes(s.status) && s.completed === cases.size &&
          ledger?.usd_micros === charged && ledger.unknown_charges === unknown && ledger.unsettled_calls === open.size &&
          ledger.reserved_micros === [...open.values()].reduce((sum, c) => sum + c.reserve_micros, 0));
        if (s.status === "SCORED") insist(!halted && !open.size && !unknown && completed === 320 && settled.size >= 640 &&
          ledger.stopped === false && ledger.unpriced_calls === 0);
        else halted = true;
        finished = true;
      } else insist(false);
      insist(charged + [...open.values()].reduce((sum, c) => sum + c.reserve_micros, 0) <= cap);
    }
    const recovered = recoverJournal(raw);
    insist(recovered.charged_micros === charged && recovered.unknown_charges === unknown && recovered.unsettled_calls === open.size);
    return { status: (halted ? "HALTED" : finished ? "COMPLETE" : "RUNNING") as Status,
      settled_calls: settled.size - unknown, completed_cases: completed, processed_cases: cases.size,
      known_cost_usd: charged / 1000000, held_reservations_usd: recovered.reserved_micros / 1000000,
      unknown_charges: unknown, unsettled_calls: open.size, total_cost_final: finished && recovered.charges_reconciled };
  } catch { return unavailable("INVALID_SNAPSHOT"); }
}

if (import.meta.main) {
  const path = Deno.args[0];
  let result: ReturnType<typeof journalProgress>;
  try { result = path ? journalProgress(await Deno.readTextFile(path)) : unavailable("INVALID_SNAPSHOT"); }
  catch { result = unavailable("INVALID_SNAPSHOT"); }
  // This explicit object is the public field whitelist. No event, source, case ID, error text or packet is printed.
  console.log(JSON.stringify(result));
  if (["RETRY_SNAPSHOT", "INVALID_SNAPSHOT"].includes(result.status)) Deno.exitCode = 2;
}
