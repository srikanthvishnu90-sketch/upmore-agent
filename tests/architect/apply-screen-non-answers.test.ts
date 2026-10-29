// F09 review fix 2 (D-007, never invent): a reply that is not a real yes/no (or a real place) saves NOTHING; negations are read right.
import assert from "node:assert/strict";
import { CareerProfile } from "../../supabase/functions/_shared/router_core.career.js";
import { parseScreenAnswer, screenAnswerTurn } from "../../supabase/functions/_shared/career_apply_screen_answer.ts";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const held = [{ job_id: "greenhouse:acme:1", company: "Co1", title: "Analyst", url: "https://boards.greenhouse.io/acme/jobs/1" }];

Deno.test("non-answers are no facts, for every question", () => {
  for (const m of ["I don't know", "I do not know", "idk", "dunno", "not sure", "maybe", "skip", "pass", "later", "n/a", "none", "prefer not to say", "ok", "?"]) {
    for (const f of ["location", "relocation", "sponsorship", "citizenship"] as const) {
      assert.equal(parseScreenAnswer(f, m, true), null, `${f}: ${m}`);
    }
  }
  for (const m of ["skip", "idk", "nowhere", "anywhere", "unknown", "Not telling", "here", "no", "yes", "none", "Mars"]) assert.equal(parseScreenAnswer("location", m, true), null, `location: ${m}`);
  assert.equal(parseScreenAnswer("location", "Austin, TX", true)?.value, "Austin, TX");
  assert.equal(parseScreenAnswer("location", "I'm in Pass Christian, MS", true)?.value, "Pass Christian, MS");
});

Deno.test("negations are read right", () => {
  const v = (f: any, m: string) => parseScreenAnswer(f, m, true)?.value;
  assert.equal(v("citizenship", "Not a US citizen"), "no");
  assert.equal(v("citizenship", "I'm not a US citizen"), "no");
  assert.equal(v("citizenship", "I'm not American"), "no");
  assert.equal(v("citizenship", "I am a US citizen"), "yes");
  assert.equal(v("citizenship", "I'm not a citizen of India"), undefined, "says nothing about the US");
  assert.equal(v("relocation", "Not open to relocating"), "no");
  assert.equal(v("relocation", "can't relocate"), "no");
  assert.equal(v("relocation", "unwilling to relocate"), "no");
  assert.equal(v("relocation", "I'd rather not relocate"), "no");
  assert.notEqual(v("relocation", "happy to relocate"), "no");
  assert.equal(v("sponsorship", "I don't need sponsorship"), "no");
  assert.equal(v("sponsorship", "I will need sponsorship later"), "yes");
  assert.equal(v("sponsorship", "no"), "no");
  assert.equal(v("sponsorship", "yes"), "yes");
});

Deno.test("a non-answer writes nothing, re-asks once, then leaves the postings held", async () => {
  const profile: any = CareerProfile.createProfile({});
  let reruns = 0;
  const run = (message: string, ask: string[], meta: Record<string, unknown> = {}) => screenAnswerTurn({
    message, now: NOW, profile, addFact: (p, f) => CareerProfile.addFact(p, f), rerun: async () => { reruns++; return null; },
    last: { intent: "career_apply_queue", meta: { screen_ask: ask.map((fact) => ({ fact, question: `${fact}?` })), screen_held: held, ...meta } },
  });
  for (const [m, f] of [["I don't know", "sponsorship"], ["skip", "location"], ["idk", "location"], ["Not sure", "citizenship"]] as const) {
    const a = await run(m, [f]);
    assert.ok(a, m);
    assert.equal(a!.status, "asking");
    assert.deepEqual(a!.saved, []);
    assert.equal((a!.meta as any).screen_reasked, true);
    assert.equal((a!.meta as any).screen_ask[0].fact, f);
    assert.equal((a!.meta as any).screen_held.length, 1);
  }
  assert.equal(profile.facts.length, 0, "nothing written");
  const b = await run("idk", ["sponsorship"], { screen_reasked: true });
  assert.equal(b!.status, "held");
  assert.deepEqual(b!.saved, []);
  assert.equal(b!.meta, undefined, "the question is dropped, the postings stay held");
  assert.equal(profile.facts.length, 0);
  assert.equal(reruns, 0, "held postings are not screened or queued on a non-answer");
  // a real answer still works after the re-ask
  const c = await run("Not a US citizen", ["citizenship"], { screen_reasked: true });
  assert.deepEqual(c!.saved, [{ fact: "citizenship", value: "no" }]);
  assert.equal(profile.facts.length, 1);
});
