// 2026-10-22, nine-gap Part B: exercise the actual inbound handlers across
// prepare -> later text. These fixtures cover the documented batch-run wire;
// they do not assert that it is interchangeable with Option A's UUID card.
// All provider and agent calls terminate in local in-memory fetch doubles.
import { handleTelegramWebhook } from "../../supabase/functions/_shared/telegram_bridge.ts";
import { handleWhatsappWebhook, twilioSignature } from "../../supabase/functions/_shared/whatsapp_twilio.ts";
import {
  FakeAdminApprovals, assert, assertEq, envOf, fakeFetchRich, TEST_USER,
  SUPABASE_URL, SERVICE_KEY,
} from "./lib/channel_fixture.ts";

const RUN = "batch-f037fixture";
const HASH = "b".repeat(64);
const CHAT = "424242";
const PHONE = "+15555550137";
const AUTH = "synthetic-signature-secret";
const HOOK = "https://fixture.supabase.co/functions/v1/whatsapp-inbound";
const SECRET = "synthetic-webhook-secret";

// Preserve all thread metadata, rather than the older fixture's two-column
// projection. This deliberately makes no choice of a future pending-run column.
class ThreadAdmin extends FakeAdminApprovals {
  rows = new Map<string, any>();
  override from(table: string): any {
    if (table !== "channel_threads") return super.from(table);
    const filters: Record<string, unknown> = {};
    const q: any = {
      select: () => q,
      eq: (key: string, value: unknown) => { filters[key] = value; return q; },
      maybeSingle: async () => ({ data: [...this.rows.values()].find((row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null, error: null }),
      upsert: async (row: any) => {
        const key = `${row.channel}:${row.sender_key}`;
        this.rows.set(key, { ...this.rows.get(key), ...row });
        this.upserts.push(row);
        return { data: null, error: null };
      },
    };
    return q;
  }
}

function stored(status = "awaiting_approval", userId = TEST_USER) {
  return {
    version: "career_batch_run/v1", userId, runId: RUN, status,
    run: { id: RUN, status, cardSha256: HASH, summary: {} },
  };
}
function readyWire(status = "awaiting_approval") {
  return { version: "career_batch_run/v1", kind: "batch_run", id: RUN, userId: TEST_USER, status };
}
const pendingWire = {
  version: "career_batch_intent/v1", kind: "pending_batch_intent", id: RUN,
  userId: TEST_USER, status: "queued", intent_id: "c".repeat(64),
};

function fixture(channel: "telegram" | "whatsapp", opts: {
  pending?: boolean; direct?: boolean; status?: string; owner?: string;
} = {}) {
  const admin = new ThreadAdmin();
  admin.batchRuns.set(RUN, stored(opts.status, opts.owner));
  let turns = 0;
  const f = fakeFetchRich({ chat: (body: any) => {
    if (body.career_batch?.action === "status") {
      if ((opts.owner ?? TEST_USER) !== TEST_USER) return { reply: "No batch is readable." };
      return { reply: "Synthetic reviewed batch.", batch: readyWire(opts.status) };
    }
    ++turns;
    if (opts.direct) return { reply: "Synthetic reviewed batch.", batch: readyWire(opts.status) };
    if (opts.pending !== false && turns === 1) return { reply: "Preparing the synthetic batch.", batch: pendingWire };
    return { reply: "Ordinary fixture reply." };
  } });
  const env = envOf({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    CHANNEL_TEST_USER_ID: TEST_USER, TELEGRAM_ALLOWED_CHAT_IDS: CHAT,
    TELEGRAM_BOT_TOKEN: "synthetic-bot-token", TELEGRAM_WEBHOOK_SECRET: SECRET,
    WHATSAPP_ALLOWED_NUMBERS: PHONE, TWILIO_ACCOUNT_SID: "ACfixture",
    TWILIO_AUTH_TOKEN: AUTH, TWILIO_WHATSAPP_FROM: "whatsapp:+15555550000",
  });
  const deps: any = { env, fetchFn: f.fn, createAdmin: () => admin, paceMs: 0 };
  let sequence = 0;
  async function text(message: string) {
    const id = ++sequence;
    let req: Request;
    if (channel === "telegram") {
      req = new Request("https://fixture.supabase.co/functions/v1/telegram-inbound", {
        method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
        body: JSON.stringify({ update_id: id, message: { message_id: id, text: message,
          chat: { id: Number(CHAT), type: "private" }, from: { id: 137, is_bot: false } } }),
      });
      return await handleTelegramWebhook(req, deps);
    }
    const params = { From: `whatsapp:${PHONE}`, To: "whatsapp:+15555550000", Body: message,
      MessageSid: `SMf037-${id}`, NumMedia: "0" };
    req = new Request(HOOK, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": await twilioSignature(AUTH, HOOK, params) },
      body: new URLSearchParams(params).toString(),
    });
    return await handleWhatsappWebhook(req, deps);
  }
  const calls = () => f.calls.filter((call) => call.url.includes("/functions/v1/agent-chat"))
    .map((call) => JSON.parse(call.init.body));
  return { admin, text, calls, sent: f.calls };
}

for (const channel of ["telegram", "whatsapp"] as const) {
  Deno.test(`F-037 ${channel}: an immediate prepared card still binds the stored hash (control)`, async () => {
    const f = fixture(channel, { direct: true });
    assertEq((await f.text("batch status")).status, 200);
    assertEq(f.admin.approvals.size, 1);
    assertEq([...f.admin.approvals.values()][0].card_sha256, HASH);
  });

  Deno.test(`F-037 ${channel}: pending prepare -> later text reads status and delivers the hash-bound card`, async () => {
    const f = fixture(channel);
    assertEq((await f.text("prepare my reviewed batch")).status, 200);
    assertEq(f.admin.approvals.size, 0, "queued work offers no approval");
    assertEq((await f.text("what happened?")).status, 200);
    const status = f.calls().filter((body) => body.career_batch?.action === "status");
    assertEq(status.length, 1, "later text must read the remembered run through the structured status path");
    assertEq(status[0].career_batch.runId, RUN);
    assertEq(status[0].as_user_id, TEST_USER);
    assertEq(f.admin.approvals.size, 1, "the completed prepare reaches its own channel");
    assertEq([...f.admin.approvals.values()][0].card_sha256, HASH);
    assert(!f.calls().some((body) => body.career_batch?.action === "approve"), "delivery never approves");
  });

  Deno.test(`F-037 ${channel}: queued, blocked, completed and cancelled work offer no control`, async () => {
    for (const status of ["queued", "blocked", "completed", "cancelled"]) {
      const f = fixture(channel, { status });
      await f.text("prepare my reviewed batch");
      await f.text("status please");
      assertEq(f.admin.approvals.size, 0, status);
      assert(!f.calls().some((body) => body.career_batch?.action === "approve"));
    }
  });

  Deno.test(`F-037 ${channel}: another person's stored run never offers a control or leaks its hash`, async () => {
    const f = fixture(channel, { owner: "00000000-0000-4000-8000-000000000137" });
    await f.text("prepare my reviewed batch");
    await f.text("status please");
    assertEq(f.admin.approvals.size, 0);
    assert(!JSON.stringify(f.sent).includes(HASH));
    assert(!f.calls().some((body) => body.career_batch?.action === "approve"));
  });

  Deno.test(`F-037 ${channel}: no pending run leaves the normal agent request unchanged`, async () => {
    const f = fixture(channel, { pending: false });
    await f.text("find roles");
    await f.text("help me prepare");
    assertEq(JSON.stringify(f.calls()), JSON.stringify([
      { message: "find roles", thread_id: "thread-1", as_user_id: TEST_USER },
      { message: "help me prepare", thread_id: "thread-1", as_user_id: TEST_USER },
    ]));
    assertEq(f.admin.approvals.size, 0);
  });

  Deno.test(`F-037 ${channel}: a bare yes after pending work never becomes an approval`, async () => {
    const f = fixture(channel);
    await f.text("prepare my reviewed batch");
    await f.text("yes");
    assert(!f.calls().some((body) => body.career_batch?.action === "approve"));
  });
}
