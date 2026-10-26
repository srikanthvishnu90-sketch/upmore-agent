// Google verification (2026-10-26, review of PR #196, blocker 2): "disconnect gmail" in the chat really disconnects. The
// REAL handler (handleChat, agent-chat/handler-career.ts) on real Postgres (CI's migration order, so 20261012060000 and
// 20261026200011 are there) with the real supabase-js client; the only seams are the HTTP hop to the Supabase project
// (tests/flow/postgrest.ts) and Google's revoke endpoint (a fake that records every request). Outcome checks only:
//   (1) the person's career grant and legacy grant are each revoked at Google with their own refresh token; their
//       connection rows, their Vault tokens and every mail-tracking row read from that Gmail are gone; another person's
//       grant, tokens and mail rows are untouched; the reply says exactly that.
//   (2) Google unreachable: the tokens and rows are still deleted, and the reply says Google didn't confirm and where to
//       remove access by hand; never "confirmed".
//   (3) Asked again with nothing connected: nothing is sent to Google, and the reply says there was nothing to disconnect.
// The same handler answers web, Telegram and SMS (the channel bridges call agent-chat), so this holds on every channel.
// Run: the gate runs it with CI=true. Where esm.sh is unreachable, add --import-map=tests/flow/supabase-npm.json.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, supabaseParity } from "../flow/handler.ts";
import { GOOGLE_REVOKE } from "../../supabase/functions/_shared/google_disconnect.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const PEOPLE: Record<string, string> = {
  "tok-g1": "7b0f8f8e-6a43-4a49-9d2c-0000000004c1",
  "tok-g2": "7b0f8f8e-6a43-4a49-9d2c-0000000004c2",
  "tok-g3": "7b0f8f8e-6a43-4a49-9d2c-0000000004c3",
};
const G1 = PEOPLE["tok-g1"], G2 = PEOPLE["tok-g2"], G3 = PEOPLE["tok-g3"];

// Google's revoke endpoint, faked: every request recorded; the answer set per test.
const google = { calls: [] as string[], answer: 200 as number | "down" };
let pg: Pg | null = null, handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
async function world() {
  if (handler) return { pg: pg!, handler };
  pg = await startPg();
  await supabaseParity(pg);
  for (const id of Object.values(PEOPLE)) {
    await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
      insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
  }
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request && !init ? input : new Request(input as string, init);
    if (req.url !== GOOGLE_REVOKE) return await real(input as any, init);
    google.calls.push(await req.text());
    if (google.answer === "down") throw new TypeError("connection refused");
    return new Response(google.answer === 200 ? "" : JSON.stringify({ error: "invalid_token" }), { status: google.answer });
  }) as typeof fetch;
  handler = await careerHandler(pg, PEOPLE); // the PostgREST double passes every other host to the fake above
  return { pg, handler };
}
const skip = () => {
  if (pgBinDir()) return false;
  if (CI) throw Error("the Google disconnect flow needs Postgres 16 in CI");
  console.log("NOT_RUN locally: no Postgres binaries");
  return true;
};
const n = async (q: string) => Number(await pg!.sql(q));
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
// A person with both Google grants (tokens in the Vault, rows as gmail-oauth writes them) and mail read from that Gmail.
async function connected(id: string, tag: string) {
  await pg!.sql(`select public.oauth_vault_store('oauth_google_career_${id}', ${lit(JSON.stringify({ access_token: `at-c-${tag}`, refresh_token: `rt-c-${tag}` }))});
    select public.oauth_vault_store('oauth_gmail_${id}', ${lit(JSON.stringify({ access_token: `at-l-${tag}`, refresh_token: `rt-l-${tag}` }))});
    insert into public.user_oauth_connections (user_id, provider, vault_name, email, scopes) values
      ('${id}', 'google_career', 'oauth_google_career_${id}', '${tag}@example.test', 'openid email https://www.googleapis.com/auth/gmail.readonly'),
      ('${id}', 'gmail', 'oauth_gmail_${id}', '${tag}@example.test', 'https://www.googleapis.com/auth/gmail.readonly');
    insert into public.career_mail_events (user_id, application_ref, kind, company, stage, evidence, message_hash, mail_at)
      values ('${id}', 'mail:acme', 'received', 'Acme', 'Submitted', 'Acme: we received your application', repeat('${tag.slice(-1)}', 64), now());
    insert into public.career_mail_drafts (user_id, draft_key, application_ref, kind, company, text, basis)
      values ('${id}', 'followup:mail:acme', 'mail:acme', 'followup', 'Acme', 'Hi, following up.', '14 days since received');
    insert into public.career_mail_cursors (user_id, read_through) values ('${id}', now());`);
}
const left = async (id: string) => ({
  rows: await n(`select count(*) from public.user_oauth_connections where user_id = '${id}'`),
  tokens: await n(`select count(*) from vault.secrets where name in ('oauth_google_career_${id}', 'oauth_gmail_${id}')`),
  mail: await n(`select (select count(*) from public.career_mail_events where user_id = '${id}') + (select count(*) from public.career_mail_drafts where user_id = '${id}') + (select count(*) from public.career_mail_cursors where user_id = '${id}')`),
});

Deno.test({ name: "google disconnect (1): \"disconnect gmail\" revokes both grants at Google and deletes the tokens, rows and mail rows; nobody else's", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (skip()) return;
  await world();
  await connected(G1, "g1"); await connected(G2, "g2");
  eq(await left(G1), { rows: 2, tokens: 2, mail: 3 }, "before: both grants, both tokens, three mail rows");
  google.calls.length = 0; google.answer = 200;
  const r = await handler!.chat("tok-g1").say("disconnect gmail");
  eq(r.status, 200, r.reply);
  eq(google.calls.sort(), ["token=rt-c-g1", "token=rt-l-g1"], "each grant's own refresh token went to Google's revoke endpoint, once");
  eq(await left(G1), { rows: 0, tokens: 0, mail: 0 }, "after: no row, no token, no mail row");
  eq(await left(G2), { rows: 2, tokens: 2, mail: 3 }, "another person's grant, tokens and mail rows are untouched");
  eq(r.intent, "career_google_disconnect", "the disconnect turn answered");
  assert(/^Gmail is disconnected\. Google confirmed Trainee's access is revoked\. I deleted the stored access and the application updates I had read from your Gmail\./.test(r.reply), r.reply);
}});

Deno.test({ name: "google disconnect (2): Google unreachable: still deleted, and the reply says Google didn't confirm", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (skip()) return;
  await world();
  await connected(G3, "g3");
  google.calls.length = 0; google.answer = "down";
  const r = await handler!.chat("tok-g3").say("Disconnect my Google account");
  eq(r.status, 200, r.reply);
  eq(google.calls.length, 12, "3 tries for each of 2 tokens, for each of the 2 grants");
  eq(await left(G3), { rows: 0, tokens: 0, mail: 0 }, "the person asked to disconnect: everything is deleted anyway");
  assert(/Google didn't confirm that Trainee's access is revoked, so please remove Trainee at myaccount\.google\.com\/permissions/.test(r.reply), r.reply);
  assert(!/Google confirmed/.test(r.reply), "never claims a revoke Google didn't confirm");
}});

Deno.test({ name: "google disconnect (3): nothing connected: nothing sent to Google, and said so", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (skip()) return;
  await world();
  google.calls.length = 0; google.answer = 200;
  const r = await handler!.chat("tok-g1").say("disconnect gmail");
  eq(google.calls, [], "no request to Google");
  eq(r.reply, "No Google account is connected to Trainee, so there was nothing to disconnect.", r.reply);
  eq(await left(G2), { rows: 2, tokens: 2, mail: 3 }, "still nobody else's rows");
}});
