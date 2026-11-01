// #354 safety follow-up through the REAL handler (handleChat) on real Postgres: the phrasings the old lists missed get the
// crisis reply, ahead of every other turn (a connector ask, an Outlook ask, a site refusal, a card, a mock answer), and
// career idioms that borrow the words are answered as career talk. The detector's own phrasing tests are in
// distress-detector.test.ts; this file holds the handler's order.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, supabaseParity } from "../flow/handler.ts";
import { SAFETY_REPLY } from "../../supabase/functions/_shared/career_trust_turn.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const CI = Deno.env.get("CI") === "true";
const PEOPLE: Record<string, string> = { "tok-distress": "7b0f8f8e-6a43-4a49-9d2c-0000000d0c35" };

Deno.test({ name: "#354 safety: distress gets the crisis reply first at the real handler", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  try {
    await supabaseParity(pg);
    const me = PEOPLE["tok-distress"];
    await pg.sql(`insert into auth.users (id, email) values ('${me}', '${me}@example.test'); insert into public.profiles (id) values ('${me}');
      insert into public.career_watch_kv (user_id, key, value) values ('${me}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    handler = await careerHandler(pg, PEOPLE);
    const chat: Chat = handler.chat("tok-distress");
    const say = async (message: string) => { const r = await chat.say(message); eq(r.status, 200, r.reply); return r; };

    await t.step("the phrasings the old lists missed", async () => {
      for (const m of ["kms", "i took too many pills", "i have a plan to end it", "i just want it all to end", "unalive myself",
        "i want to sleep and never wake up", "jumping off a bridge", "i wish i wasn't alive", "my life is over", "honestly kms lol",
        "i want 2 die", "sucidal again", "how much tylenol is lethal", "i took 30 advil", "rejected again. time to end it.", "quiero morir",
        "i have a gun and i'm thinking of using it on myself", "i don't deserve to live"]) {
        const r = await say(m);
        eq(r.intent, "safety_support", `${m}: ${r.intent}: ${r.reply}`);
        eq(r.reply, SAFETY_REPLY, m);
      }
    });

    await t.step("ahead of the connector, Outlook and site-refusal turns, which do nothing for such a message", async () => {
      for (const m of ["disconnect gmail. i want to die", "connect my outlook, honestly kms", "apply to this on linkedin i just want it all to end"]) {
        const r = await say(m);
        eq(r.intent, "safety_support", `${m}: ${r.intent}: ${r.reply}`);
        eq(r.reply, SAFETY_REPLY, m);
      }
    });

    await t.step("career idioms stay career talk", async () => {
      for (const m of ["this job is killing me", "how do i kill it in the interview", "my career is dead in the water", "would quitting now be career suicide"]) {
        const r = await say(m);
        assert(r.intent !== "safety_support" && !/\b988\b/.test(r.reply), `${m}: ${r.intent}: ${r.reply}`);
      }
    });
  } finally {
    handler?.restore();
    await pg.stop();
  }
} });
