// FEATURE NEEDS (2026-10-26): the scope guards at each step of a connect, on their own, not only behind the callers'
// checks. Google verification (#196) approves openid, email and gmail.readonly; gmail.send is deferred until the owner
// names it in GOOGLE_APPROVED_EXTRA_SCOPES. A link never stores a deferred scope, a link with nothing to ask is never
// made, and a tap asks Google only for what may be asked at the moment of the tap. Pure; no network.
import assertNode from "node:assert/strict";
import { mintLink } from "../../supabase/functions/_shared/career_connectors.ts";
import { handleConnect } from "../../supabase/functions/_shared/career_connect_flow.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const READ = "https://www.googleapis.com/auth/gmail.readonly";
const SEND = "https://www.googleapis.com/auth/gmail.send";
const env = (extra: Record<string, string> = {}) => ({ get: (k: string) => ({ SUPABASE_URL: "https://p.test", ...extra } as Record<string, string>)[k] });

function issuer() {
  const issued: Record<string, unknown>[] = [];
  const admin = { rpc: (n: string, a: Record<string, unknown>) => { if (n === "career_connect_link_issue") issued.push(a); return Promise.resolve({ data: "t".repeat(32), error: null }); },
    from: () => { throw new Error("no table read"); } };
  return { issued, admin };
}
const mint = (admin: unknown, scopes: string[], e = env()) =>
  mintLink(admin as never, { userId: "u", channel: "telegram", threadId: null, scopes, purpose: "track_replies" as never, now: 0, base: "https://p.test/functions/v1/career-connect", env: e });

Deno.test("a link stores only the approved scopes: a deferred send and a scope beyond Gmail never reach it", async () => {
  const { issued, admin } = issuer();
  const url = await mint(admin, [READ, SEND, "https://www.googleapis.com/auth/calendar.events"]);
  eq(url, "https://p.test/functions/v1/career-connect?t=" + "t".repeat(32));
  eq(issued.length, 1);
  eq(issued[0].p_scopes, ["openid", "email", READ], "exactly the approved set");
});

Deno.test("no link is made when nothing the link is for may be asked (send alone, deferred)", async () => {
  const { issued, admin } = issuer();
  eq(await mint(admin, [SEND]), null);
  eq(issued.length, 0, "nothing issued");
  // Once the owner approves sending, the same ask makes a link for it.
  const approved = issuer();
  await mint(approved.admin, [SEND], env({ GOOGLE_APPROVED_EXTRA_SCOPES: SEND }));
  eq(approved.issued[0]?.p_scopes, ["openid", "email", SEND]);
});

Deno.test("a tap asks Google only for what may be asked now: send withdrawn after the link was made is dropped", async () => {
  // The link was made while sending was approved; the approval has since been withdrawn.
  const admin = {
    rpc: (n: string) => Promise.resolve({ error: null, data: n === "career_connect_link_peek" ? { status: "ok", connector: "google", scopes: ["openid", "email", READ, SEND] }
      : n === "career_connect_link_open" ? { link_id: "11111111-1111-4111-8111-111111111111", scopes: ["openid", "email", READ, SEND] } : null }),
    from: () => { throw new Error("no table read"); },
  };
  const e = env({ GOOGLE_OAUTH_CLIENT_ID: "cid.apps.test", GOOGLE_OAUTH_CLIENT_SECRET: "fake-secret", OAUTH_STATE_SECRET: "fake-state-secret-0000" });
  const fetch = (() => { throw new Error("no network"); }) as unknown as typeof globalThis.fetch;
  const tap = await handleConnect(new Request("https://p.test/functions/v1/career-connect", { method: "POST", body: new URLSearchParams({ t: "t".repeat(32) }) }), { admin, env: e, fetch } as never);
  eq(tap.status, 303);
  const to = new URL(tap.headers.get("location")!);
  eq(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  eq(to.searchParams.get("scope")!.split(" ").sort(), ["email", READ, "openid"].sort(), "the consent asks exactly the approved set");
});

Deno.test("sending deferred: 'connect gmail to send' and an outreach send say it isn't available, with no link of any kind", async () => {
  const { needsTurn, SEND_UNAVAILABLE } = await import("../../supabase/functions/_shared/career_connectors.ts");
  const { connectUrl } = await import("../../supabase/functions/_shared/agent/integrations.ts");
  const tables: Record<string, unknown[]> = { channel_contacts: [{ channel: "telegram" }] };
  const issued: unknown[] = [];
  const q = (t: string) => { const o: any = { select: () => o, eq: () => o, in: () => o, order: () => o, limit: () => o,
    maybeSingle: () => Promise.resolve({ data: (tables[t] ?? [])[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[t] ?? [], error: null }).then(ok) }; return o; };
  const admin = { from: q, rpc: (n: string, a: unknown) => { if (n === "career_connect_link_issue") issued.push(a); return Promise.resolve({ data: n === "career_connect_link_issue" ? "t".repeat(32) : null, error: null }); } };
  const fetch = (() => { throw new Error("no network"); }) as unknown as typeof globalThis.fetch;
  const turn = (message: string, answered: Record<string, unknown> = {}) => needsTurn({ admin, message, userId: "u", threadId: "th", bridge: true, now: 0, profile: null, situation: null, env: env(), fetch, answered } as never);

  const ask = await turn("connect gmail to send");
  eq([ask?.resultStatus, ask?.reply.startsWith(SEND_UNAVAILABLE)], ["unavailable", true], ask?.reply);
  assertNode.ok(!/career-connect|https?:\/\//.test(ask!.reply), ask!.reply);
  eq(issued.length, 0, "no link for sending");

  const app = connectUrl("gmail");
  const outreach = { reply: `I drafted the message to Acme. To send it from your Gmail, connect it in the Trainee app: ${app}`, intent: "career_outreach", status: "needs_user" };
  const out = await turn("send it", { outreach });
  eq([out?.intent, out?.resultStatus], ["career_outreach", "needs_user"]);
  assertNode.ok(out!.reply.endsWith(SEND_UNAVAILABLE) && !out!.reply.includes(app) && !/career-connect/.test(out!.reply), out!.reply);
  eq(issued.length, 0, "still no link");
});
