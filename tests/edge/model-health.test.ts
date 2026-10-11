// Model health (live finding 2026-10-11: every model call failed for hours and nothing noticed). An uptime monitor calls
// model-health with a token; a dead provider answers 503 within one probe, with the provider's cause, and leaves one
// founder alert per hour. The provider and the database are stubs here.
import { handleHealth, tokenOk } from "../../supabase/functions/_shared/model_health.ts";
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
const TOKEN = "health-token-0123456789abcdef";
const KEY = "sk-proj-TESTKEY-should-never-appear-anywhere-0000";
const env = (o: Record<string, string> = {}) => ({ get: (k: string) => ({ HEALTH_CHECK_TOKEN: TOKEN, OPENAI_API_KEY: KEY, ...o } as Record<string, string>)[k] });
function db(verdict: any, alertsInLastHour = 0) {
  const events: any[] = [], alerts: any[] = [];
  return { events, alerts, async rpc(name: string) { assert(name === "model_health"); return { data: verdict, error: null }; },
    from(t: string) {
      if (t === "agent_provider_events") return { async insert(r: any) { events.push(r); return { error: null }; } };
      const q: any = { select() { return q; }, eq() { return q; }, gte() { return Promise.resolve({ count: alertsInLastHour, error: null }); }, async insert(r: any) { alerts.push(r); return { error: null }; } };
      return q;
    } };
}
const ok = async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "OK" } }], usage: { prompt_tokens: 12, completion_tokens: 2 } });
const dead = async () => Response.json({ error: { message: `Incorrect API key provided: ${KEY.slice(0, 10)}****0000.`, type: "invalid_request_error", code: "invalid_api_key" } }, { status: 401 });
const get = (q: string) => new Request(`https://x.supabase.co/functions/v1/model-health${q}`);

Deno.test("no token or a wrong token: 401, nothing probed, nothing read", async () => {
  let sent = 0; const d = db({ status: "ok" });
  for (const q of ["?probe=1", "?probe=1&token=wrong", `?probe=1&token=${TOKEN}x`]) {
    const r = await handleHealth(get(q), { env: env(), admin: d, request: (async () => { sent++; return ok(); }) as any });
    assert(r.status === 401, q);
  }
  assert(sent === 0 && d.events.length === 0);
  assert(!tokenOk(TOKEN, "short"), "a short configured token never authorizes");
});

Deno.test("a working provider: the probe answers, the call is recorded, 200 ok with the provider and model named", async () => {
  const d = db({ status: "ok", calls: 5, errors: 0 });
  const r = await handleHealth(get(`?probe=1&token=${TOKEN}`), { env: env(), admin: d, request: ok as any });
  const b = await r.json();
  assert(r.status === 200 && b.status === "ok" && b.provider === "OpenAI" && b.model === "gpt-5-nano" && b.probe.ok && b.probe.reply === "OK", JSON.stringify(b));
  assert(d.events.length === 1 && d.events[0].role === "probe" && d.events[0].ok === true, JSON.stringify(d.events));
  assert(d.alerts.length === 0);
});

Deno.test("a dead key: 503 down on the first probe, the provider's cause without the key, one founder alert per hour", async () => {
  const d = db({ status: "idle", calls: 0, errors: 0 });
  const r = await handleHealth(get(`?probe=1&token=${TOKEN}`), { env: env(), admin: d, request: dead as any });
  const b = await r.json(); const text = JSON.stringify(b) + JSON.stringify(d.events) + JSON.stringify(d.alerts);
  assert(r.status === 503 && b.status === "down", JSON.stringify(b));
  assert(/HTTP 401 invalid_request_error: Incorrect API key provided: \[key\]/.test(b.probe.error), b.probe.error);
  assert(!text.includes("sk-proj"), "no key fragment anywhere");
  assert(d.alerts.length === 1 && d.alerts[0].kind === "model_down", JSON.stringify(d.alerts));
  const again = db({ status: "down" }, 1);
  const r2 = await handleHealth(get(`?probe=1&token=${TOKEN}`), { env: env(), admin: again, request: dead as any });
  assert(r2.status === 503 && again.alerts.length === 0, "the alert is not repeated within the hour");
});

Deno.test("without a probe, real traffic decides: degraded and down page (503), idle and ok do not", async () => {
  for (const [status, code] of [["down", 503], ["degraded", 503], ["idle", 200], ["ok", 200]] as const) {
    const r = await handleHealth(get(`?token=${TOKEN}`), { env: env(), admin: db({ status }), request: (async () => { throw new Error("no probe was asked for"); }) as any });
    assert(r.status === code, `${status} -> ${r.status}`);
  }
});
