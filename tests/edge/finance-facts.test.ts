// Finance fact matching: a bare definitional question must match a fact, or the
// model answers ungrounded and the grounding guard replaces the whole reply
// with the "I can't verify that claim" deflection (live gauntlet go-live-5e033cb,
// S16-08 "what's a roth ira" — the reply never mentioned Roth at all).
import { FINANCE_FACTS, financeFactMatch } from "../../supabase/functions/agent-chat/_shared/finance_facts.ts";

function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }

Deno.test("a bare 'what's a roth ira' matches a fact that defines a Roth IRA", () => {
  for (const q of ["what's a roth ira", "what is a roth ira", "tell me about roth iras", "explain a roth ira to me"]) {
    const ids = financeFactMatch(q);
    assert(ids.length > 0, `${q}: no finance fact matched`);
    const facts = FINANCE_FACTS.filter((f) => ids.includes(f.id));
    assert(
      facts.some((f) => /roth/i.test(f.text) && /already paid|after-tax|tax-free/i.test(f.text)),
      `${q}: matched facts do not define a Roth IRA: ${ids.join(",")}`,
    );
  }
});

Deno.test("the roth definition fact states no figure the grounding guard would have to allowlist", () => {
  const f = FINANCE_FACTS.find((x) => x.id === "roth-ira-basics");
  assert(f, "roth-ira-basics fact exists");
  assert(!/\$|%/.test(f!.text), "definition carries no money amount or rate");
  assert(f!.amounts.length === 0, "definition allowlists no amounts");
});

Deno.test("a trade instruction mentioning a roth does not match the definition fact", () => {
  const ids = financeFactMatch("buy $500 VOO in my roth");
  assert(!ids.includes("roth-ira-basics"), `trade text matched the definition fact: ${ids.join(",")}`);
});
