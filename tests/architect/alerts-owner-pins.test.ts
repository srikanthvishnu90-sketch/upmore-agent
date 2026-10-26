// SERIAL-1521 (a) and (b), held in writing (docs/architect/DECISIONS.md D-032) and pinned here:
// (a) one owner of career_alert_prefs on the live path: the watch bridge (career_watch_alerts.ts through the alert
//     store, from the handler after the save). The brain's set_job_alerts tool also writes the row, and the brain is
//     off (AGENT_BRAIN_RELEASED = false); when it is released the tool must write through the watch or go. No third
//     production writer exists.
// (b) the product's scheduled reader is career-proactive, reading career_alert_prefs through supabaseAlertStore and
//     the watch records only to verify; the legacy one-account host (scripts/career/alerts-host.mjs, career_watch_kv
//     only) is not imported by anything the product schedules.
import assertNode from "node:assert/strict";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const read = (p: string) => Deno.readTextFile(`${ROOT}/${p}`);

Deno.test("(a) the writers of career_alert_prefs are the watch bridge and the brain's tool, and the brain is off", async () => {
  const handler = await read("supabase/functions/agent-chat/handler-career.ts");
  const brain = await read("supabase/functions/agent-chat/career_brain.ts");
  assertNode.match(brain, /export const AGENT_BRAIN_RELEASED = false;/, "the brain is pinned off");
  const hook = handler.indexOf("await syncWatchAlerts(");
  assertNode.ok(hook > handler.indexOf("await persistence.commit("), "the bridge runs after the save");
  assertNode.ok(hook > handler.indexOf("AGENT_BRAIN_RELEASED && chooseBrain"), "and outside the brain branch");
  const writers: string[] = [];
  for await (const e of walk(`${ROOT}/supabase/functions`)) {
    const src = await Deno.readTextFile(e);
    if (/from\("career_alert_prefs"\)\s*\.\s*(upsert|insert|update|delete)|career_alert_prefs"\)\.(upsert|insert|update|delete)/.test(src)) writers.push(e.slice(ROOT.length + 1));
  }
  assertNode.deepEqual(writers.sort(), ["supabase/functions/_shared/career_alert_store.ts"], `only the alert store writes the table: ${writers}`);
  const store = await read("supabase/functions/_shared/career_alert_store.ts");
  const callers: string[] = [];
  for await (const e of walk(`${ROOT}/supabase/functions`)) {
    const src = await Deno.readTextFile(e);
    if (e.endsWith("career_alert_store.ts")) continue;
    if (/\bstore\.save\(|\.save\(row\)|alerts\.save\(|store\.remove\(/.test(src) && /career_alert_store|AlertStore/.test(src)) callers.push(e.slice(ROOT.length + 1));
  }
  // The run (career_proactive_run.ts) writes only the day's counters and removes a stale copy whose watch record is gone;
  // it never sets a person's watches.
  assertNode.deepEqual(callers.sort(), ["supabase/functions/_shared/agent/career_tools.ts", "supabase/functions/_shared/career_proactive_run.ts", "supabase/functions/_shared/career_watch_alerts.ts"], `the store's writers: ${callers}`);
  const run = await read("supabase/functions/_shared/career_proactive_run.ts");
  assertNode.ok(!/store\.save\(\{[^}]*interests/.test(run), "the run never writes watches");
  assertNode.ok(store.includes("upsert"), "the store is the one upsert");
});

Deno.test("(b) the scheduled reader is career-proactive over career_alert_prefs; the legacy host is not what the product schedules", async () => {
  const index = await read("supabase/functions/career-proactive/index.ts");
  assertNode.match(index, /supabaseAlertStore/, "reads the alert settings row");
  assertNode.match(index, /career_watch_kv/, "and the watch records, to verify each row");
  assertNode.doesNotMatch(index, /alerts-host/, "never the legacy one-account host");
  for await (const e of walk(`${ROOT}/supabase/functions`)) {
    const src = await Deno.readTextFile(e);
    assertNode.doesNotMatch(src, /alerts-host\.mjs|alerts-scheduler\.mjs/, `${e}: the legacy host is not part of the product's functions`);
  }
});

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const d of Deno.readDir(dir)) {
    const p = `${dir}/${d.name}`;
    if (d.isDirectory) { if (d.name === "node_modules") continue; yield* walk(p); }
    else if (/\.(ts|js)$/.test(d.name)) yield p;
  }
}
