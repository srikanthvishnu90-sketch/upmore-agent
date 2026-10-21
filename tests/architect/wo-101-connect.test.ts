// WO-101 (architect): connectors a person can actually use from the chat. Found by the design audit: no caller of
// gmail-oauth's career consent existed, the only connect link carried no person (a grant would land on whoever was signed
// in to the finance app), "disconnect gmail" promised a host step nothing ran, the connect reply promised sends and a
// calendar Trainee does not have, and "connect my linkedin" offered a reusable LinkedIn session.
//
// Now: a signed, single-use link bound to the person of the turn (minted by the service, consumed once by gmail-oauth,
// which starts the consent for the token's user and ends on Trainee's own page); "disconnect gmail" asks, and only a yes
// on the next turn revokes that person's grant; LinkedIn, Indeed and Handshake are never signed in to.
// Modules are loaded per test so that each test fails on its own where a module is missing.
const at = (p: string) => new URL(p, import.meta.url).href;
const ROOT = new URL("../../", import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, ROOT));
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const A = "00000000-0000-4000-8000-0000000101a1", B = "00000000-0000-4000-8000-0000000101b2";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345"; // a made-up 32-character token shape (test only)
const SECRET = "test-state-secret"; // test only
const FN = "https://project.example.test/functions/v1/gmail-oauth";

// ---------------------------------------------------------------------------------------------------- the signed link
Deno.test("WO-101/1 the link starts the consent for the token's user: consumed once, the state signed for that user", async () => {
  const { startFromLink, CONNECT_PURPOSE } = await import(at("../../supabase/functions/gmail-oauth/link.ts"));
  const { verifyState } = await import(at("../../supabase/functions/gmail-oauth/career.ts"));
  eq(CONNECT_PURPOSE, "connect_google_career");
  const consumed: string[] = [];
  const res: Response = await startFromLink(TOKEN, {
    consume: async (t: string, purpose: string) => { consumed.push(`${t}|${purpose}`); return { user_id: A }; },
    clientId: "test-client", stateSecret: SECRET, redirectUri: FN,
  });
  eq(consumed, [`${TOKEN}|connect_google_career`], "consumed once, for its purpose");
  eq(res.status, 302);
  const to = new URL(res.headers.get("Location")!);
  eq(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  eq(to.searchParams.get("redirect_uri"), FN, "Google comes back to the function itself");
  const v = await verifyState(to.searchParams.get("state")!, SECRET);
  eq([v.userId, v.purpose], [A, "career"], "the state binds the user the token named, for the career grant");
  assert(to.searchParams.get("scope")!.includes("gmail.readonly"));
});

Deno.test("WO-101/2 a bad, expired or used token never reaches Google and ends on Trainee's own page", async () => {
  const { startFromLink } = await import(at("../../supabase/functions/gmail-oauth/link.ts"));
  const deps = (r: unknown) => ({ consume: async () => r, clientId: "test-client", stateSecret: SECRET, redirectUri: FN });
  const cases: [string, unknown, number, RegExp][] = [
    [TOKEN, { error: "expired" }, 410, /expired/],
    [TOKEN, { error: "used" }, 410, /already used/],
    [TOKEN, { error: "invalid" }, 400, /doesn't work/],
    ["short", { user_id: A }, 400, /doesn't work/],
  ];
  for (const [t, r, status, words] of cases) {
    const res: Response = await startFromLink(t, deps(r));
    eq(res.status, status, `${t} ${JSON.stringify(r)}`);
    const html = await res.text();
    assert(words.test(html) && /Trainee/.test(html) && !res.headers.get("Location"), `${JSON.stringify(r)}: ${html.slice(0, 200)}`);
  }
  let called = false;
  const off: Response = await startFromLink(TOKEN, { consume: async () => { called = true; return { user_id: A }; }, clientId: "", stateSecret: SECRET, redirectUri: FN });
  assert(off.status === 503 && !called, "without a client the token is not burned");
});

Deno.test("WO-101/3 the pages are Trainee's: the success words, the wordmark and colours, no other product", async () => {
  const { pageHtml } = await import(at("../../supabase/functions/gmail-oauth/link.ts"));
  const ok: string = pageHtml("connected");
  assert(ok.includes("Gmail is connected to Trainee.") && ok.includes("You can close this tab and go back to the chat."), "the success words");
  for (const c of ["#9B7BB8", "#4A2F5E", "#F2F2F4"]) assert(ok.includes(c), `the colour ${c}`);
  assert(/>Trainee</.test(ok), "the wordmark");
  for (const k of ["connected", "declined", "expired", "used", "invalid", "unavailable", "error"]) {
    const h: string = pageHtml(k);
    assert(!/upmore|vercel\.app|<script/i.test(h), `${k}: no other product, no script`);
  }
  assert(/didn't allow/.test(pageHtml("declined")) && /15 minutes/.test(pageHtml("expired")), "declined and expired say what happened");
});

Deno.test("WO-101/4 gmail-oauth serves the link; the career callback ends on Trainee's page; the finance path is unchanged", () => {
  const src = read("supabase/functions/gmail-oauth/index.ts");
  assert(/searchParams\.has\("t"\)/.test(src) && /connect_link_consume/.test(src) && /startFromLink\(/.test(src), "GET ?t= consumes the token");
  assert(!/#you\?career=/.test(src), "a career grant never lands on the finance app");
  assert(/page\("declined"\)/.test(src) && /page\(ok \? "connected" : "error"\)/.test(src), "declined, connected and failed pages");
  assert(/#you\?gmail=\$\{ok \? "connected" : "error"\}/.test(src), "the legacy gmail landing is untouched");
  assert(!/searchParams\.get\("(user|user_id|uid)"\)/.test(src), "no query parameter names a user");
});

Deno.test("WO-101/5 the service mints the link for the user of the turn; a mint that fails gives no link, never an unsigned one", async () => {
  const m = await import(at("../../supabase/functions/_shared/agent/integrations.ts"));
  const calls: any[] = [];
  const admin = (ret: any) => ({ rpc: async (fn: string, args: any) => { calls.push([fn, args]); return ret; } });
  const link = await m.mintConnectLink(admin({ data: TOKEN, error: null }), A, "https://project.example.test/", Date.UTC(2026, 9, 21));
  eq(link, `${FN}?t=${TOKEN}`);
  eq(calls[0][0], "connect_link_issue");
  eq([calls[0][1].p_user, calls[0][1].p_purpose], [A, "connect_google_career"]);
  eq(await m.mintConnectLink(admin({ data: null, error: { message: "permission denied" } }), A, "https://project.example.test"), null);
  eq(await m.mintConnectLink(admin({ data: "not a token", error: null }), A, "https://project.example.test"), null);
  assert(m.missingIntegration("gmail", { link }).endsWith(`\n\n${link}`), "the degrade line can carry the signed link");
});

// ------------------------------------------------------------------------------------------------ the router's words
async function careerHost() {
  const core = await import(at("../../supabase/functions/_shared/router_core.career.js"));
  const { CareerHost } = await import(at("../../supabase/functions/_shared/career_host.js"));
  const host = CareerHost.createCareerHost(core);
  return { core, host };
}
const SIGNED = `${FN}?t=${TOKEN}`;

Deno.test("WO-101/6 'connect my gmail' carries the signed link and claims only what is true: read job mail, draft for approval", async () => {
  const { host } = await careerHost();
  for (const ask of ["connect my gmail", "connect gmail", "connect my google", "Connect my Gmail please"]) {
    const ctx: any = host.createTurnCtx({ userId: A, threadId: A, now: Date.UTC(2026, 9, 21) });
    const asked: string[] = [];
    ctx.secureLinkFor = (s: string) => { asked.push(s); return s === "google_career" ? SIGNED : null; };
    const out = host.runTurn(ask, ctx);
    eq(out.intent, "connect_google", ask);
    assert(out.reply.includes(SIGNED), `${ask}: the link rides the reply: ${out.reply}`);
    assert(/read/i.test(out.reply) && /job mail/i.test(out.reply) && /draft/i.test(out.reply) && /approv/i.test(out.reply), `${ask}: ${out.reply}`);
    // Sends are disabled (SEND_DISABLED) and Calendar is not a Trainee capability.
    assert(!/\bsend|test email|calendar|self-test/i.test(out.reply), `${ask}: a false claim: ${out.reply}`);
    assert(!JSON.stringify(out.result?.payload ?? {}).includes("self_test"), "no self-test is planned");
    eq(asked, ["google_career"]);
  }
});

Deno.test("WO-101/7 with no link minted the reply says so and shows no link", async () => {
  const { host } = await careerHost();
  const ctx: any = host.createTurnCtx({ userId: A, threadId: A, now: Date.UTC(2026, 9, 21) });
  ctx.secureLinkFor = () => null;
  const out = host.runTurn("connect my gmail", ctx);
  assert(!/https?:\/\//.test(out.reply) && /couldn't make a connect link/i.test(out.reply), out.reply);
  assert(!/\bsend|test email|calendar/i.test(out.reply), out.reply);
});

Deno.test("WO-101/8 LinkedIn, Indeed and Handshake: never signed in to, no session offered, no link", async () => {
  const { host } = await careerHost();
  for (const ask of ["connect my linkedin", "connect linkedin", "link my indeed", "connect handshake", "I sign in once to Handshake and you reuse that session"]) {
    const ctx: any = host.createTurnCtx({ userId: A, threadId: A, now: Date.UTC(2026, 9, 21) });
    const asked: string[] = [];
    ctx.secureLinkFor = (s: string) => { asked.push(s); return SIGNED; };
    const out = host.runTurn(ask, ctx);
    assert(/never signs in to/i.test(out.reply) && /LinkedIn or Indeed/.test(out.reply), `${ask}: ${out.reply}`);
    assert(!/sign in once|reuses? (it|that|the) session|shown session|open the session|https?:\/\//i.test(out.reply), `${ask}: a session offer: ${out.reply}`);
    assert(out.result?.method !== "cloud_browser_user_sign_in", ask);
    eq(asked, [], `${ask}: no link is asked for`);
  }
});

// --------------------------------------------------------------------------------------------------------- disconnect
Deno.test("WO-101/9 'disconnect gmail' asks and changes nothing; only a yes on the next turn revokes", async () => {
  const { disconnectTurn, memoryConnectStore, DISCONNECT_ASK } = await import(at("../../supabase/functions/_shared/career_connect.ts"));
  eq(DISCONNECT_ASK, "Disconnect Gmail? Trainee will stop reading your job mail and can't draft from it. Reply yes to disconnect.");
  const store = memoryConnectStore();
  store.connect(A);
  let now = Date.UTC(2026, 9, 21, 15);
  const turn = async (message: string) => {
    const r = await disconnectTurn({ message, userId: A, threadId: "t-a", now, store });
    if (r) store.setLast("t-a", r.intent, now);
    now += 60_000;
    return r;
  };
  const ask = await turn("disconnect gmail");
  eq(ask?.reply, DISCONNECT_ASK);
  eq(store.revoked, [], "asking revokes nothing");
  for (const notYes of ["ok", "sure", "y", "yes later", "no"]) eq(await disconnectTurn({ message: notYes, userId: A, threadId: "t-a", now, store }), null, notYes);
  eq(store.revoked, [], "no revoke without yes");
  const done = await turn("yes");
  eq(store.revoked, [A], "the yes revokes the person's own grant");
  assert(/disconnected/i.test(done!.reply) && /token/i.test(done!.reply) && /record of the connection/i.test(done!.reply), `says what was removed: ${done!.reply}`);
  eq(await store.connected(A), false);
});

Deno.test("WO-101/10 a yes after an unrelated turn, or after 10 minutes, revokes nothing", async () => {
  const { disconnectTurn, memoryConnectStore, DISCONNECT_INTENT } = await import(at("../../supabase/functions/_shared/career_connect.ts"));
  const store = memoryConnectStore();
  store.connect(A);
  const t0 = Date.UTC(2026, 9, 21, 15);
  await disconnectTurn({ message: "disconnect gmail", userId: A, threadId: "t-a", now: t0, store });
  store.setLast("t-a", DISCONNECT_INTENT, t0);
  store.setLast("t-a", "career_discovery", t0 + 60_000); // the person asked something else in between
  eq(await disconnectTurn({ message: "yes", userId: A, threadId: "t-a", now: t0 + 120_000, store }), null, "the yes is not ours");
  store.setLast("t-a", DISCONNECT_INTENT, t0);
  const late = await disconnectTurn({ message: "yes", userId: A, threadId: "t-a", now: t0 + 11 * 60_000, store });
  assert(late && /Nothing was disconnected/.test(late.reply), "a stale yes is refused");
  eq(store.revoked, []);
  const none = memoryConnectStore();
  const r = await disconnectTurn({ message: "disconnect gmail", userId: B, threadId: "t-b", now: t0, store: none });
  assert(r && /isn't connected/.test(r.reply) && r.intent !== DISCONNECT_INTENT, "nothing connected: said, and no question");
});

Deno.test("WO-101/11 the revoke touches only this person's grant: Google, the vault entry and the connection row", async () => {
  const { disconnectTurn, supabaseConnectStore, memoryConnectStore, DISCONNECT_INTENT } = await import(at("../../supabase/functions/_shared/career_connect.ts"));
  const mem = memoryConnectStore();
  mem.connect(A); mem.connect(B);
  mem.setLast("t-a", DISCONNECT_INTENT, 0);
  await disconnectTurn({ message: "yes", userId: A, threadId: "t-a", now: 60_000, store: mem });
  eq([await mem.connected(A), await mem.connected(B)], [false, true], "B's connection is untouched");

  const log: string[] = [];
  const vault: Record<string, string> = {
    [`oauth_google_career_${A}`]: JSON.stringify({ refresh_token: "test-refresh-a" }),
    [`oauth_google_career_${B}`]: JSON.stringify({ refresh_token: "test-refresh-b" }),
  };
  const q = (table: string) => {
    const f: string[] = [];
    const chain: any = {
      select: () => chain, eq: (k: string, v: string) => { f.push(`${k}=${v}`); return chain; }, in: (k: string, v: string[]) => { f.push(`${k} in ${v}`); return chain; },
      order: () => chain, limit: () => chain, delete: () => { f.push("DELETE"); return chain; },
      maybeSingle: async () => { log.push(`${table} ${f.join(" ")}`); return { data: { provider: "google_career" }, error: null }; },
      then: (ok: any) => { log.push(`${table} ${f.join(" ")}`); return Promise.resolve({ data: [], error: null }).then(ok); },
    };
    return chain;
  };
  const admin = {
    from: q,
    rpc: async (fn: string, a: any) => { log.push(`${fn} ${a.p_name}`); return { data: fn === "oauth_vault_read" ? vault[a.p_name] : null, error: null }; },
  };
  const revoked: string[] = [];
  const fetchStub = (async (url: string, init: any) => { revoked.push(`${url} ${String(init.body)}`); return new Response("", { status: 200 }); }) as typeof fetch;
  const store = supabaseConnectStore(admin, { fetch: fetchStub });
  const r = await store.revoke(A);
  eq(r.google, "revoked");
  eq(revoked, ["https://oauth2.googleapis.com/revoke token=test-refresh-a"], "Google revokes A's token only");
  assert(log.every((l) => !l.includes(B)), `nothing of B's is read or written: ${log.join(" | ")}`);
  assert(log.includes(`oauth_vault_delete oauth_google_career_${A}`), "A's vault entry is deleted");
  assert(log.some((l) => l.startsWith("user_oauth_connections") && l.includes("DELETE") && l.includes(`user_id=${A}`)), "A's row is deleted, by A's id");
  const failing = supabaseConnectStore(admin, { fetch: (async () => new Response("", { status: 400 })) as typeof fetch });
  eq((await failing.revoke(A)).google, "not_confirmed");
});

Deno.test("WO-101/12 the chat runs it: the link is minted for the turn's user and disconnect runs before any brain", () => {
  const src = read("supabase/functions/agent-chat/handler-career.ts");
  assert(/disconnectTurn\(\{ message, userId: user\.id/.test(src), "disconnect is code's, for this user");
  assert(/mintConnectLink\(admin, user\.id/.test(src), "the link is minted for this user");
  assert(/secureLinkFor = /.test(src), "the router's seam is filled");
  const go = read("scripts/launch/trainee-go-live.sh");
  assert(go.includes("20261023110000_connect_link_nonces.sql") && go.includes("proname = 'connect_link_consume'"), "go-live applies the migration");
  assert(read("tests/db/run.sh").includes("20261023110000_connect_link_nonces.sql"), "the DB suite applies it");
});
