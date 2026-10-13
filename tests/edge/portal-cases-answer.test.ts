// Portal cases in chat (agent-chat/_shared/portal_answer.ts, cluster K8): detection fires only on the case
// phrasings, facts come from the injected reader, no facts means the one exact ask (never an invented card),
// and a bare "yes" is never an execution here.
import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { portalReply } from "../../supabase/functions/agent-chat/_shared/portal_answer.ts";

const FACTS: Record<string, any> = {
  C117: { servicer: "Mr. Cooper (stand-in servicer)", account: "mortgage ending 3310", pmi_cents: 11800, balance_cents: 31200000, value_cents: 41000000 },
  C194: { destination: "Japan", spend_cents: 100000, airport_cost_cents: 8000, atm_cost_cents: 500 },
};

Deno.test("a portal case with no facts wired asks the one costly question and states the live boundary", async () => {
  const r = await portalReply("get pmi off my mortgage", async () => ({}));
  assertMatch(r!, /Who services your mortgage, and what is the balance\?/);
  assertMatch(r!, /not wired to Upmore yet/);
});

Deno.test("a portal case with facts shows the approval card with the exact dollars", async () => {
  const r = await portalReply("get pmi off my mortgage", async (id) => FACTS[id]);
  assertMatch(r!, /File the PMI removal request with Mr\. Cooper/);
  assertMatch(r!, /Amount: \$118\.00 \(\$118\.00 a month, \$1,416\.00 a year\)/);
  assertMatch(r!, /Yes\?$/);
});

Deno.test("a read-only case answers with its math and no card", async () => {
  const r = await portalReply("i'm going to japan - cash, card, or atm?", async (id) => FACTS[id]);
  assertMatch(r!, /saves \$75\.00 versus the airport desk/);
});

Deno.test("other messages, and a bare yes, return null (no execution in this path)", async () => {
  for (const m of ["what's my balance", "yes", "send maya 40", "cancel my spotify", "how much did i spend on groceries"]) {
    assertEquals(await portalReply(m, async () => FACTS.C117), null, m);
  }
});
