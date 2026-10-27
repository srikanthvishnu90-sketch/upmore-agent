// D.1 admit test (THREE-CHANNEL-READINESS-2026-10-26, gap E-9): sign-up on a texting channel, against real Postgres
// with the database's own sign-up mode CLOSED ('invite', 20261026230000's default, as production has it). The real
// inbound core (channel_inbound.ts runInbound) and the real inbound store (trainee-inbound/store.ts) run unchanged;
// the only seams are the HTTP hop to the Supabase project (tests/flow/postgrest.ts), GoTrue's admin create-user
// (answered below by inserting the auth.users row, as GoTrue would), and the brain (a recording stub: admission is
// what is under test, not the chat). Assertions are on rows, never on wording alone:
//
//   A. an allow-listed phone contact texts in  -> an account, trainee_admissions.via = 'allowlist', the turn runs.
//   B. an unlisted contact, sign-up closed     -> refused once (SIGNUP_CLOSED), NO account, no admission, no turn;
//      a second text is not answered again.
//   C. TRAINEE_SIGNUP=open in the ENV, DB mode 'invite', unlisted contact -> the env lets an ACCOUNT be made, and
//      that is all it does: trainee_admissions has NO row for the person (never 'allowlist' — the env is not the
//      allow-list), the person is told they are not let in, and no turn runs. (E-9: the open case.)
//   D. the same, after the OWNER opens sign-up in the DATABASE (trainee_set_signup('open')) -> via = 'open': the
//      'open' is the database's decision, never the env's.
//   E. the Telegram shape PR #194 sends (FEATURE 16): createUser with a synthetic channel-only email
//      (channelOnlyEmail: tg-<id>@users.trainee.invalid, confirmed, channel_only metadata) and NO phone — the
//      admission core accepts it: a listed Telegram contact is admitted via = 'allowlist' and the turn runs.
//   F. a person the database has not let in texts "connect telegram": the admission check runs BEFORE any link or
//      Telegram-code handling (#195 d14db963), so they are told they are not let in and NO link nonce is issued.
//
// Run: the gate runs it with CI=true (a missing Postgres throws). Locally add --import-map=tests/flow/supabase-npm.json.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { postgrestDouble } from "../flow/postgrest.ts";
import { SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { NOT_ADMITTED_REPLY, runInbound, SIGNUP_CLOSED_REPLY, type InboundStore } from "../../supabase/functions/_shared/channel_inbound.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
import type { InboundMessage } from "../../supabase/functions/_shared/channel_adapters.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const T0 = Date.parse("2026-10-27T15:00:00Z");
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

// PR #194's channelOnlyEmail (trainee-inbound/store.ts on feat/telegram-e2e-20261026), copied so the shape the test
// sends is #194's exact shape: a Telegram chat (no email, no phone of its own) is created with this address.
function channelOnlyEmail(contact: string): string {
  const m = /^(tg|wa):([A-Za-z0-9._-]{1,128})$/.exec(contact);
  if (!m) throw new Error("not a channel-only contact");
  return `${m[1] === "tg" ? "tg" : "wa"}-${m[2].toLowerCase().replace(/[^a-z0-9-]/g, "-")}@users.trainee.invalid`;
}

Deno.test({
  name: "channel admit (D.1): via is recorded truthfully — 'allowlist' only for a listed contact, 'open' only from the database",
  sanitizeResources: false, sanitizeOps: false,
  async fn() {
    if (!pgBinDir()) {
      if (CI) throw Error("the D.1 channel admit test needs Postgres 16 binaries in CI");
      console.log("NOT_RUN locally: no Postgres binaries");
      return;
    }
    const pg: Pg = await startPg({ gate: "invite" });
    const realFetch = globalThis.fetch;
    try {
      await supabaseParity(pg);
      eq(await pg.sql(`select public.trainee_signup_mode()`), "invite", "the database's sign-up mode is closed, as production has it");
      const double = postgrestDouble(pg, { url: SUPABASE_URL, serviceKey: SERVICE_KEY, users: {} });
      // GoTrue's admin API: create-user inserts the auth.users row (the columns the stub schema carries), with the
      // confirmation times set when GoTrue was told to confirm; anything else to the project goes to the double.
      globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        const url = new URL(req.url);
        if (url.origin === new URL(SUPABASE_URL).origin && url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
          const b = await req.json() as Record<string, unknown>;
          const id = crypto.randomUUID();
          const email = typeof b.email === "string" ? b.email : null;
          const phone = typeof b.phone === "string" ? b.phone : null;
          await pg.sql(`insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values ('${id}', ${email ? lit(email) : "null"}, ${b.email_confirm ? "now()" : "null"}, ${phone ? lit(phone) : "null"}, ${b.phone_confirm ? "now()" : "null"})`);
          return Response.json({ id, aud: "authenticated", email, phone, user_metadata: b.user_metadata ?? {}, app_metadata: b.app_metadata ?? {} }, { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.origin === new URL(SUPABASE_URL).origin) return await double.fetch(req);
        throw new Error(`the admit test answers nothing else: ${url.origin}${url.pathname}`);
      }) as typeof fetch;
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const realStore = supabaseInboundStore(admin);
      // PR #194's createPerson for a contact with neither an email nor a phone of its own (FEATURE 16): the same
      // channel_contacts tail as the real store, only the createUser body differs — that body is #194's fix.
      const store194: InboundStore = {
        ...realStore,
        async createPerson(contact, at) {
          const created = await admin.auth.admin.createUser({
            email: channelOnlyEmail(contact), email_confirm: true,
            user_metadata: { trainee_channel: "telegram", channel_only: true }, app_metadata: { channel_only: true },
          } as never);
          if (created.error || !created.data?.user?.id) throw new Error(`create an account for a new contact: ${created.error?.message ?? "no user returned"}`);
          const userId = created.data.user.id as string;
          const r = await admin.from("channel_contacts").upsert({ contact, user_id: userId, updated_at: new Date(at).toISOString() }, { onConflict: "contact" });
          if (r.error) throw new Error(`link the contact: ${r.error.message}`);
          return { userId, threadId: null, contact };
        },
      };

      let clock = T0;
      const direct: { contact: string; bubbles: string[] }[] = [];
      const chats: { userId: string; message: string }[] = [];
      const world = (env: Record<string, string>, store: InboundStore = realStore) => ({
        env: { get: (k: string) => env[k] },
        now: () => (clock += 1000),
        store,
        reply: async (contact: string, bubbles: string[]) => { direct.push({ contact, bubbles }); return { ok: true }; },
        render: (text: string) => [text],
        chat: async (a: { userId: string; message: string }) => { chats.push({ userId: a.userId, message: a.message }); return { status: 200, reply: "stub welcome", threadId: null }; },
        deliver: async () => {},
      });
      const msg = (over: Partial<InboundMessage>): InboundMessage => ({
        provider: "loopmessage", channel: "imessage", kind: "text", messageId: `adm-${Math.random()}`,
        contact: "", address: "", text: "hi", ...over,
      } as InboundMessage);
      const userOf = async (contact: string) => await pg.sql(`select user_id from public.channel_contacts where contact = ${lit(contact)}`);
      const viaOf = async (contact: string) => await pg.sql(`select via from public.trainee_admissions where user_id = (select user_id from public.channel_contacts where contact = ${lit(contact)})`);
      const admissionsFor = async (contact: string) => Number(await pg.sql(`select count(*) from public.trainee_admissions where user_id = (select user_id from public.channel_contacts where contact = ${lit(contact)})`));
      const outboxTexts = async (contact: string) => await pg.sql(`select text from public.career_outbox where user_id = (select user_id from public.channel_contacts where contact = ${lit(contact)}) order by id`);
      const CLOSED = { TRAINEE_ALLOWED_CONTACTS: "+13125550142" };

      // A. Listed phone contact: account, via='allowlist', the turn runs.
      {
        const out = await runInbound(msg({ contact: "+13125550142", address: "+13125550142", phone: "+13125550142" }), world(CLOSED));
        eq(out.body.replied, true, "A: the listed contact's turn is answered");
        eq(await viaOf("+13125550142"), "allowlist", "A: via is 'allowlist' for the listed contact");
        eq(chats.length, 1, "A: exactly one turn ran");
        eq(await pg.sql(`select phone from auth.users where id = (select user_id from public.channel_contacts where contact = '+13125550142')`), "13125550142", "A: the account carries the confirmed phone");
      }
      // B. Unlisted contact, sign-up closed: refused once, no account, no admission, no turn; not told twice.
      {
        const before = chats.length;
        const out = await runInbound(msg({ contact: "+13125550199", address: "+13125550199", phone: "+13125550199" }), world(CLOSED));
        eq(out.body.refused, "signup closed", "B: the unlisted contact is refused");
        eq(direct.filter((d) => d.contact === "+13125550199").flatMap((d) => d.bubbles), [SIGNUP_CLOSED_REPLY], "B: told the closed reply once");
        eq(await pg.sql(`select count(*) from auth.users where phone = '13125550199'`), "0", "B: no account was made");
        eq(chats.length, before, "B: no turn ran");
        const again = await runInbound(msg({ contact: "+13125550199", address: "+13125550199", phone: "+13125550199" }), world(CLOSED));
        eq(again.body.ignored, "signup closed (already told)", "B: a second text is not answered again");
        eq(direct.filter((d) => d.contact === "+13125550199").length, 1, "B: still told only once");
      }
      // C. TRAINEE_SIGNUP=open in the env, the database still 'invite': an account is made, and NO admission is
      // recorded — in particular never 'allowlist'. The person is told they are not let in; no turn runs. (E-9.)
      {
        const before = chats.length;
        const out = await runInbound(msg({ contact: "+13125550177", address: "+13125550177", phone: "+13125550177" }), world({ TRAINEE_SIGNUP: "open" }));
        eq(out.body.refused, "not admitted", "C: the env-open contact is refused by the database's gate");
        eq(await pg.sql(`select count(*) from auth.users where phone = '13125550177'`), "1", "C: the env let an account be made");
        eq(await admissionsFor("+13125550177"), 0, "C: no admission row exists for the env-open contact (never 'allowlist')");
        eq(await outboxTexts("+13125550177"), NOT_ADMITTED_REPLY, "C: the person is told they are not let in");
        eq(chats.length, before, "C: no turn ran");
      }
      // D. The owner opens sign-up in the DATABASE: the same env now admits, and via is 'open' — the database's word.
      {
        await pg.sql(`select public.trainee_set_signup('open')`);
        const out = await runInbound(msg({ contact: "+13125550178", address: "+13125550178", phone: "+13125550178" }), world({ TRAINEE_SIGNUP: "open" }));
        eq(out.body.replied, true, "D: with the database open, the turn is answered");
        eq(await viaOf("+13125550178"), "open", "D: via is 'open', recorded from the database's mode");
        await pg.sql(`select public.trainee_set_signup('invite')`);
      }
      // E. PR #194's Telegram shape: a synthetic channel-only email, no phone. The admission core accepts it.
      {
        const before = chats.length;
        const out = await runInbound(msg({ provider: "telegram", channel: "telegram", contact: "tg:7001", address: "7001" }), world({ TRAINEE_ALLOWED_CONTACTS: "telegram:7001" }, store194));
        eq(out.body.replied, true, "E: the Telegram contact's turn is answered");
        eq(await userOf("tg:7001") !== "", true, "E: an account exists for the chat");
        eq(await pg.sql(`select email from auth.users where id = (select user_id from public.channel_contacts where contact = 'tg:7001')`), "tg-7001@users.trainee.invalid", "E: the account is #194's channel-only address");
        eq(await pg.sql(`select count(*) from auth.users where id = (select user_id from public.channel_contacts where contact = 'tg:7001') and phone is not null`), "0", "E: the account has no phone");
        eq(await viaOf("tg:7001"), "allowlist", "E: the listed Telegram contact is admitted via 'allowlist'");
        eq(chats.length, before + 1, "E: exactly one turn ran");
      }
      // F. "connect telegram" from a person the database has not let in: admission is asked first (d14db963), so no
      // link nonce is issued and the connect link is never sent.
      {
        const before = chats.length;
        const out = await runInbound(msg({ provider: "telegram", channel: "telegram", contact: "tg:7002", address: "7002", text: "connect telegram" }),
          world({ TRAINEE_SIGNUP: "open", TELEGRAM_BOT_USERNAME: "trainee_test_bot", TELEGRAM_BOT_TOKEN: "t" }, store194));
        eq(out.body.refused, "not admitted", "F: admission refuses before any Telegram-code handling");
        eq(await outboxTexts("tg:7002"), NOT_ADMITTED_REPLY, "F: the person is told they are not let in, not sent a link");
        eq(await pg.sql(`select count(*) from public.channel_link_nonces`), "0", "F: no link nonce was issued to anyone");
        eq(chats.length, before, "F: no turn ran");
      }
    } finally {
      globalThis.fetch = realFetch;
      await pg.stop();
    }
  },
});
