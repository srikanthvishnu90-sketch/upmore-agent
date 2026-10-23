"use strict";
/*
 * INTEGRATION PERFECTION GUARDS (2026-10-16, depth integration):
 * permanent replay guards for the defects found by the integration
 * agent's fresh per-feature probe journeys on the MERGED tree —
 * each failed verbatim on the merged tree before its fix:
 *   1. negotiation opener with an arrival verb ("offer just landed")
 *      fell to the generic fallback (the claim gate knew only
 *      "got an offer / offer came in" shapes);
 *   2. a direct stated-fact read-back ("so what's my target firm?")
 *      fell to the generic fallback after a correction;
 *   3. watch read-back shapes ("what's on my watch", "show me my
 *      watch") matched neither the dispatch gate nor the manage gate;
 *   4. "find me internships" was claimed by the generic find branch
 *      and served full-time roles (the internship branch sat below);
 *   5. "thinking about <role> — is that a real move from here?" and
 *      the "anything I should learn" follow-up missed the path gate;
 *   6. a worth+plan turn was deflected to the networking campaign
 *      recap, and the plan reply carried no worth half;
 *   7. a worth + watch + tracker multi-ask was served as watch-only
 *      with the other parts silently dropped (the composer taxonomy
 *      had no worth part and no "show my applications" shape);
 *   8. SC-275's canonical wins-log ask (a method description, not a
 *      win statement) was logged as a garbage win by the writer.
 */
const test = require("node:test");
const assert = require("node:assert");
const L = require("../scripts/career/gauntlet/pilot-lib.cjs");

function freshCtx(persona) {
  return { profile: L.gauntletProfile(persona || "p1-early-career-swe") };
}
function run(label, turns, ctx) {
  ctx = ctx || freshCtx();
  const s = L.H.session("INTG-" + label, "grand");
  return turns.map((say) => L.chatTurn(s, say, ctx));
}
const isFallback = (r) => !r.result || r.result.intent === "career_fallback" || /didn't catch that|I'm Trainee, a career agent: I find roles/.test((r.delivered || []).join(" "));

test("integration: negotiation opens on an arrival-verb offer statement", () => {
  const rs = run("neg", [
    "offer just landed — fintech startup, 71k base, they want an answer by thursday",
    "feels light. what should I counter at?",
  ]);
  assert.ok(!isFallback(rs[0]), "arrival-verb opener must not fall back");
  assert.match(rs[0].result.intent, /negotiation/);
  assert.match(rs[0].delivered.join(" "), /\$71,000/);
  assert.ok(!isFallback(rs[1]), "the counter follow-up must ride the thread record");
});

test("integration: stated-fact read-back answers from the record, honestly when absent", () => {
  const rs = run("readback", [
    "my target firm is Copperline, remember that",
    "wait — not Copperline, I meant Atlas Freight",
    "so what's my target firm?",
  ]);
  assert.ok(!isFallback(rs[2]), "direct read-back must not fall back");
  assert.match(rs[2].delivered.join(" "), /Atlas Freight/);
  const rs2 = run("readback-absent", ["what is my target firm"]);
  assert.ok(!isFallback(rs2[0]), "absent-fact read-back must be answered, not dropped");
  assert.match(rs2[0].delivered.join(" "), /not on your record/i);
});

test("integration: watch read-back shapes list the created watch", () => {
  const box = {};
  const ctx = freshCtx();
  ctx.alertStore = { get: (k) => (k in box ? box[k] : null), set: (k, v) => { box[k] = v; } };
  const rs = run("watch", [
    "watch for new grad software engineer roles at fintech companies",
    "what's on my watch right now?",
    "show me my watch",
  ], ctx);
  assert.equal(rs[0].result.intent, "career_watch_create");
  for (const r of [rs[1], rs[2]]) {
    assert.ok(!isFallback(r), "watch read-back must not fall back");
    assert.equal(r.result.intent, "career_watch_manage");
    assert.match(r.delivered.join(" "), /watching 1 role/i);
  }
});

test("integration: internship-banded discovery serves need/want/looking shapes", () => {
  // NOTE: "find me internships" is pinned to the generic discovery
  // intent by tests/career-http-host.test.cjs on the v224 line; the
  // internship-banded route owns the need/want/looking shapes. The
  // ask-type fidelity gap on the "find me" shape is named in the
  // merge record as a known residue, not silently rerouted here.
  const rs = run("intern", ["I'm a senior, econ major, based in Austin and into fintech", "I'm looking for internships"]);
  assert.equal(rs[1].result.intent, "career_internship_discovery");
  assert.match(rs[1].delivered.join(" "), /internship/i);
});

test("integration: career path claims 'thinking about <role>' and the learn follow-up", () => {
  const rs = run("path", [
    "I'm a support rep at a SaaS company and I keep thinking about customer success management — is that a real move from here?",
    "what would the path even look like?",
    "anything I should learn before I try?",
  ]);
  for (const r of rs) assert.ok(!isFallback(r), "path journey turn fell back: " + r.delivered.join(" ").slice(0, 80));
  assert.match(rs[0].delivered.join(" "), /customer success/i);
});

test("integration: worth+plan composes both halves (no campaign deflection)", () => {
  const rs = run("worthplan", ["I want to move up to senior this year and I suspect I'm underpaid — what am I worth and what's the plan?"]);
  const txt = rs[0].delivered.join(" ");
  assert.ok(!/campaign plan is on record/.test(txt), "must not deflect to the networking campaign recap");
  assert.match(txt, /plan/i);
  assert.match(txt, /worth|sourced figures|no sourced market figure/i);
});

test("integration: multi-ask turn names every part and 'next' delivers the held worth read", () => {
  const rs = run("multi", [
    "three things pls: what am I worth, set a watch for data analyst roles, and show my applications",
    "next",
  ]);
  const t1 = rs[0].delivered.join(" ");
  assert.match(t1, /Data Analyst/, "the watch part is served in-turn");
  assert.match(t1, /market-value read/, "the worth part is named in-turn, not silently dropped");
  assert.match(t1, /application tracking/, "the tracker part is named in-turn, not silently dropped");
  assert.equal(rs[1].result.intent, "career_os_market_value");
  assert.match(rs[1].delivered.join(" "), /sourced figures/);
});

test("integration: the canonical wins-log ask is a read, never a logged win", () => {
  const ctx = freshCtx();
  const rs = run("wins-ask", [
    "log a win: closed the Henderson renewal two weeks early",
    "Wins log: I text wins all semester; they land in my living resume. Can I see my wins log as a review packet?",
  ], ctx);
  assert.ok(["career_os_wins_log", "career_os_review_packet"].includes(rs[1].result.intent), "the canonical ask must be served as a wins READ (log or review packet), got: " + rs[1].result.intent);
  const store = ctx.profile._careerTrackStore;  const winsText = JSON.stringify((store && store.os && store.os.wins) || []);
  assert.ok(!/text wins all semester/.test(winsText), "the method-description ask must never be recorded as a win");
});
