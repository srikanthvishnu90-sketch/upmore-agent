// A new sign-in is told in the person's own chat (reqs Q509, Q717, Q510). One phone sign-in to the jobs page (link -> number ->
// texted code) queues exactly ONE notice into that person's thread: when (their clock, zone named), how (a code to the number
// ending in two digits) and the way to undo it ("sign out everywhere"). A refresh, a wrong code, or another person's sign-in queues
// nothing more for them; a notice that can't be queued never undoes the sign-in. "sign out everywhere" in the chat ends every open
// page sign-in. Through the real handleFile and runInbound; memory stores, a fixed clock, fake texts: no network, no database.
import assertNode from "node:assert/strict";
import { mintFileToken } from "../../supabase/functions/_shared/file_link.ts";
import { sha256 } from "../../supabase/functions/_shared/file_session.ts";
import { handleFile, type FileDeps, type FileStore } from "../../supabase/functions/trainee-file/handler.ts";
import { runInbound } from "../../supabase/functions/_shared/channel_inbound.ts";
import { SIGN_OUT_EVERYWHERE, signedOutReply, signinNoticeText, supabaseNoticeQueue, type NoticeQueue } from "../../supabase/functions/_shared/signin_notice.ts";
import { buildFileDeps } from "../../supabase/functions/trainee-file/deps.ts";
import { jobViewOf, refOf } from "../../supabase/functions/_shared/telegram_jobs.ts";
import { fakePhone, memSessions } from "./file-session-fakes.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const SECRET = "file-link-secret-0123456789-abcdef";
const U = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222";
const U_PHONE = "+15125550147", V_PHONE = "+15125550199";
const NOW = Date.parse("2026-11-01T15:04:00Z"); // Sunday Nov 1: 9:04 AM in Chicago (CST from 2 AM that morning), 10:04 AM in New York
const LIST = "0123456789";
const HIT = { job_id: "greenhouse:acme:1", company: "Acme", title: "Data Analyst", location: "Austin, TX", url: "https://boards.greenhouse.io/acme/jobs/1", pay: "$90k" };
const ROW = { job_id: HIT.job_id, provider: "greenhouse", description: "<p>Build dashboards.</p>", posted_at: "2026-10-30T12:00:00Z" };

function world(o: { tz?: Record<string, string | null>; queue?: NoticeQueue } = {}) {
  const queued: { userId: string; key: string; text: string; at: number }[] = [];
  const queue: NoticeQueue = o.queue ?? { async queue(userId, n) { if (queued.some((q) => q.key === n.key)) return false; queued.push({ userId, ...n }); return true; } };
  const S = memSessions(), P = fakePhone({ [U]: U_PHONE, [V]: V_PHONE });
  const kv = new Map<string, any>();
  const store = {
    async remember(u: string, r: string, job: any, s: string) { kv.set(`${u}|job|${r}`, { job, shownAs: s }); }, async recall(u: string, r: string) { return kv.get(`${u}|job|${r}`) ?? null; },
    async rememberList(u: string, id: string, refs: string[]) { kv.set(`${u}|list|${id}`, refs); }, async recallList(u: string, id: string) { return kv.get(`${u}|list|${id}`) ?? null; },
    async postings() { return [ROW]; }, async save() { return "saved"; }, async prepared() { return null; }, async applied() { return false; },
    async want() { return { result: "queued" }; }, async appRow() { return null; }, async wanted() { return false; },
  } as unknown as FileStore;
  const ready = (async () => { for (const u of [U, V]) { const v = jobViewOf(HIT, ROW as any), r = await refOf(u, v.job_id); await store.remember(u, r, v, "text"); await store.rememberList(u, LIST, [r]); } })();
  const env: Record<string, string> = { TRAINEE_FILE_LINK_SECRET: SECRET, TRAINEE_FILE_BASE_URL: "https://trainee.example/file", TRAINEE_BOT_URL: "https://t.me/TraineeBot" };
  const tz = o.tz ?? { [U]: "America/New_York", [V]: null };
  const d: FileDeps = { store, now: () => NOW, env: { get: (k) => env[k] }, sessions: S.store, phone: P.auth, signinNotices: queue, timeZone: async (u) => tz[u] ?? null };
  const browser = () => {
    const jar = new Map<string, string>();
    const take = (r: Response) => { for (const c of r.headers.getSetCookie()) { const [kvp, ...attrs] = c.split(";"); const [k, v] = kvp.split("="); if (attrs.some((a) => /Max-Age=0/i.test(a))) jar.delete(k.trim()); else jar.set(k.trim(), v); } return r; };
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    return {
      jar,
      open: async (path: string) => take(await handleFile(new Request(`https://trainee.example${path}`, { headers: { cookie: cookie(), "user-agent": "Mozilla/5.0" } }), d)),
      post: async (f: Record<string, string>) => take(await handleFile(new Request("https://trainee.example/file", { method: "POST", headers: { cookie: cookie(), "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(f).toString() }), d)),
    };
  };
  const signIn = async (user: string, typed: string, code?: (c: string) => string) => {
    await ready;
    const b = browser();
    const link = (await mintFileToken({ secret: SECRET, userId: user, list: LIST, now: NOW, kind: "l" }))!;
    eq((await b.open(`/file?t=${encodeURIComponent(link)}`)).status, 303);
    eq((await b.post({ action: "phone_start", phone: typed })).status, 200);
    const r = await b.post({ action: "phone_verify", code: code ? code(P.lastCode()) : P.lastCode() });
    return { b, r };
  };
  return { d, S, P, queued, signIn };
}

Deno.test("one phone sign-in -> exactly one notice in that person's chat: when (their zone), how (number ending), and how to undo it", async () => {
  const w = world();
  const { b, r } = await w.signIn(U, "(512) 555-0147");
  eq(r.status, 303, "signed in");
  const sid = b.jar.get("tf_s")!;
  eq(w.queued.length, 1, "one notice");
  const n = w.queued[0];
  eq([n.userId, n.key, n.at], [U, `status:signin:${await sha256(sid)}`, NOW]);
  eq(n.text, `New sign-in to your Trainee jobs page: Sunday, Nov 1, 10:04 AM EST, with a code texted to your number ending in 47. If that was you, there's nothing to do. If it wasn't, reply "sign out everywhere" and every open Trainee page is signed out.`);
  ok(!n.text.includes(U_PHONE) && !n.text.includes("0147"), "never the whole number");
  ok(!/urgent|immediately|warning|!/i.test(n.text), "calm (Q510)");
  // Reading the page again, and again, is not a new sign-in.
  for (let i = 0; i < 3; i++) eq((await b.open("/file")).status, 200);
  eq(w.queued.length, 1, "a refresh queues nothing");
});

Deno.test("nothing for a wrong code, nothing for someone else; a second sign-in (another device) is told again; an unknown zone is Chicago, said", async () => {
  const w = world();
  const bad = await w.signIn(U, "512-555-0147", (c) => c === "000000" ? "111111" : "000000");
  eq(bad.r.status, 401);
  eq(w.queued.length, 0, "a wrong code signs nobody in and tells nothing");
  await w.signIn(V, "+1 512 555 0199");
  eq(w.queued.map((q) => q.userId), [V], "V's sign-in is told to V only");
  ok(w.queued[0].text.includes("Sunday, Nov 1, 9:04 AM CST (Chicago time)") && w.queued[0].text.includes("ending in 99"), w.queued[0].text);
  await w.signIn(U, "5125550147");
  await w.signIn(U, "5125550147");
  eq(w.queued.filter((q) => q.userId === U).length, 2, "each new sign-in is told once");
  eq(new Set(w.queued.map((q) => q.key)).size, 3, "one key per sign-in");
});

Deno.test("a notice that can't be queued never undoes the sign-in", async () => {
  const w = world({ queue: { async queue() { throw new Error("outbox down"); } } });
  const err = console.error; console.error = () => {};
  try {
    const { b, r } = await w.signIn(U, "5125550147");
    eq(r.status, 303); ok(b.jar.has("tf_s"));
    eq((await b.open("/file")).status, 200);
  } finally { console.error = err; }
});

Deno.test("the deployed deps queue the notice into career_outbox (kind status, key status:signin:<hash>), once per key", async () => {
  const rows: any[] = [];
  const admin = { from(table: string) { return { insert: async (r: any) => { eq(table, "career_outbox"); if (rows.some((x) => x.key === r.key)) return { error: { code: "23505", message: "duplicate key" } }; rows.push(r); return { error: null }; } }; } };
  const built = buildFileDeps(admin, { get: () => undefined }, () => NOW);
  ok(built.signinNotices, "wired in deps.ts");
  const q = supabaseNoticeQueue(admin), key = `status:signin:${"a".repeat(64)}`;
  eq(await q.queue(U, { key, text: "x", at: NOW }), true);
  eq(await q.queue(U, { key, text: "x", at: NOW }), false);
  eq(rows, [{ user_id: U, key, kind: "status", text: "x", deliver_at: new Date(NOW).toISOString() }]);
  await assertNode.rejects(() => q.queue(U, { key: "status:signin:nope", text: "x", at: NOW }));
});

Deno.test("'sign out everywhere' in the person's own chat ends every open page sign-in, and says how many", async () => {
  const replies: string[] = [], ended: string[] = [];
  let open = 2;
  const d: any = {
    env: { get: () => undefined }, now: () => NOW, render: (t: string) => [t],
    store: { claimMessage: async () => true, person: async (c: string) => (c === "tg:1" ? { userId: U, threadId: "t1", contact: c } : null), refusedBefore: async () => false,
      createPerson: async () => { throw new Error("no sign-up here"); }, setThread: async () => {}, setOptOut: async () => {},
      enqueueReply: async (_u: string, _k: string, text: string) => { replies.push(text); return true; },
      signOutPages: async (u: string) => { ended.push(u); const n = open; open = 0; return n; } },
    reply: async () => ({ ok: true }), chat: async () => { throw new Error("no brain turn for this"); }, deliver: async () => {},
  };
  const msg = (text: string, channel = "telegram") => ({ provider: channel, channel, messageId: String(Math.random()), contact: "tg:1", address: "1", kind: "text", text });
  await runInbound(msg("sign out everywhere") as any, d);
  eq([ended, replies.at(-1)], [[U], signedOutReply(2)]);
  ok(/2 open Trainee page sign-ins were ended/.test(replies.at(-1)!), replies.at(-1));
  await runInbound(msg("Sign out everywhere.") as any, d);
  eq(replies.at(-1), signedOutReply(0));
  ok(/nothing changed/.test(replies.at(-1)!));
  // Only the exact ask: a sentence about signing out is a turn for the brain, not this.
  for (const t of ["how do I sign out everywhere?", "don't sign out everywhere", "sign out"]) eq(SIGN_OUT_EVERYWHERE.test(t), false, t);
  for (const t of ["sign out everywhere", "Signout everywhere!", "sign out of Trainee everywhere", "please sign out everywhere"]) eq(SIGN_OUT_EVERYWHERE.test(t), true, t);
  // A store that fails says so: nothing was signed out.
  d.store.signOutPages = async () => { throw new Error("db down"); };
  await runInbound(msg("sign out everywhere") as any, d);
  ok(/still signed in/.test(replies.at(-1)!), replies.at(-1));
  eq(signinNoticeText({ at: NOW, tz: "America/Chicago", phone: null }).includes("with a code texted to your phone"), true);
});
