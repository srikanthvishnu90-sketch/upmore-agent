"use strict";
// W02 shared lib (SC-021..SC-040). All people/emails are labeled TEST fixtures (.test domains, synthetic names).
const H = require("../scenario-harness.cjs");
const M = require("../../../packages/domain/124-career-outreach");
const PROFILE = { school: "TEST University", name: "Alex Testcase (TEST)" };
const USER = { name: "Alex Testcase", school: "TEST University", year: "junior", year_label: "'28" };
const FIRST = ["Maya","Liam","Noor","Ethan","Priya","Lucas","Ava","Omar","Sofia","Ben","Ivy","Caleb","Nina","Jonas","Ruth","Dev","Lena","Marcus","Tara","Hugo","Elif","Sam","Grace","Owen","Mira","Felix","Anita","Chris","Dana","Ravi"];
const LAST = ["Testfield","Exampleton","Fixtureman","Mockridge","Sampleton","Demoworth","Fauxberg","Synthello","Testworth","Placeholder","Simulman","Trialton","Dummyfield","Mockton","Fakerton","Specimen","Proxyman","Standin","Surrogat","Modelton"];
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
function gen(count, spec) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const TA = ["Crimson", "Amber", "Velvet", "Copper", "Silent", "Rapid", "Golden", "Marble", "Cedar", "Harbor", "Onyx", "Willow", "Coral", "Basalt", "Meadow", "Summit"];
    const TB = ["Falcon", "Turtle", "Badger", "Otter", "Heron", "Moose", "Viper", "Lynx", "Bison", "Crane", "Newt", "Osprey", "Puma", "Raven", "Stoat", "Wolf"];
    // Unique compound surname per person (256 combos) — without it the resolver merges distinct TEST people
    // whose names score >=0.80 similarity at the same firm/school (shared-surname suffix effect).
    const fn = FIRST[i % FIRST.length], ln = TA[i % 16] + TB[Math.floor(i / 16) % 16].toLowerCase();
    const firm = spec.firms[i % spec.firms.length];
    const name = `${fn} ${ln} (TEST)`;
    out.push(Object.assign({
      person_id: `TEST-W02-${spec.tag}-${String(i + 1).padStart(3, "0")}`,
      full_name: name, current_firm: firm, title: spec.title, seniority_band: spec.seniority || null,
      geography: spec.geography || "New York", office: spec.geography || "New York", country: "US",
      schools: spec.schools ? [spec.schools[i % spec.schools.length]] : ["TEST University"],
      work_email: `${slug(fn)}.${slug(ln)}@${slug(firm)}.test`, email_confidence: 0.92, email_verification: "verified",
      email_pattern: "first.last", source_list: [spec.source || "TEST fixture pool"], last_verified_at: "2026-10-01T00:00:00Z",
      personalization_facts: [{ fact: spec.fact || `${spec.title} at ${firm}`, source_url: "TEST-fixture", strength: "strong", kind: "record" }],
      relationship_to_user: spec.relationship || "none",
    }, spec.extra ? spec.extra(i, firm) : {}));
  }
  return out;
}
function decoys(tag) {
  return [
    { person_id: `TEST-W02-${tag}-EU`, full_name: "Eu Decoy (TEST)", current_firm: "Decoy Bank", title: "Analyst", geography: "London", country: "GB", work_email: "eu.decoy@decoybank.test", email_confidence: 0.9, email_verification: "verified" },
    { person_id: `TEST-W02-${tag}-OPT`, full_name: "Optout Decoy (TEST)", current_firm: "Decoy Bank", title: "Analyst", geography: "New York", country: "US", work_email: "opt.decoy@decoybank.test", email_confidence: 0.9, opt_out: true },
    { person_id: `TEST-W02-${tag}-NOEM`, full_name: "Noemail Decoy (TEST)", current_firm: "Decoy Bank", title: "Analyst", geography: "New York", country: "US", work_email: null },
  ];
}
function testTransport(sent) { return { kind: "TEST-transport", send: async (msg) => { sent.push(msg); return { messageId: `TEST-MSG-${sent.length}` }; } }; }
function fixtureCalendar(freeBusy) {
  const cal = { freeBusy: freeBusy || [], events: [], createEvent(ev) { const e = Object.assign({ id: `TEST-EVT-${cal.events.length + 1}` }, ev); cal.events.push(e); return e; } };
  return cal;
}
async function listScenario(scId, slugName, canonical, spec, check, describe) {
  const s = H.session(scId, slugName);
  s.user(canonical);
  const q = M.parseTarget(canonical, PROFILE);
  s.tool("CareerOutreach.parseTarget", q);
  const records = gen(spec.count, spec).concat(decoys(spec.tag));
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: Date.parse("2026-10-13T00:00:00Z") });
  const card = M.listReviewCard(pool, q);
  s.tool("CareerOutreach.buildList.yield", pool.yield);
  const listed = pool.selected.concat(pool.reserve);
  const okChecks = check(listed);
  s.agent(describe(pool, card), { card: { title: `List review — ${scId}`, count: card.count, yield: pool.yield, selected: pool.selected.length, reserve: pool.reserve.length, exclusions: pool.exclusions, sample_rows: card.sample_rows.slice(0, 3) } });
  const ok = listed.length === spec.count && okChecks.every(Boolean) && pool.exclusions.eu_uk >= 1 && pool.exclusions.opt_out >= 1 && pool.exclusions.no_email >= 1;
  s.verify("rail state: buildList yield + every listed candidate re-checked against the scenario criteria; decoys (EU / opt-out / no-email) excluded by the pipeline", { listed: listed.length, selected: pool.selected.length, reserve: pool.reserve.length, checks: okChecks, exclusions: pool.exclusions, yield: pool.yield });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: describe(pool, card) }
    : { status: "LEARN", outcome: "List build did not verify.", reason: `listed=${listed.length} want=${spec.count}; checks=${JSON.stringify(okChecks)}; exclusions=${JSON.stringify(pool.exclusions)}`, unblock: "Fix generator/buildList mismatch and rerun." });
}
module.exports = { H, M, PROFILE, USER, gen, decoys, testTransport, fixtureCalendar, listScenario, slug };
