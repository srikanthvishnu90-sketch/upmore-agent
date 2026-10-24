// PENDING (proposal, not built): work authorization and sponsorship as two typed facts
// (docs/architect/ELIGIBILITY-SEPARATION-PROPOSAL.md). Every test here FAILS on today's code, each on a wrong read the
// proposal names; a throwaway reference implementation (not committed) passes all of them. Nothing here edits a module:
// the frozen ones (121, 124, 130, 132, 141, 142, 149, all in the router bundle) are only loaded.
// Run: deno test -A --no-check tests/architect/pending/eligibility-separation.test.ts
//      ELIGIBILITY_ROOT=<a patched copy of the repo> runs the same tests against that copy.
import assertNode from "node:assert/strict";
import { createRequire } from "node:module";

const ROOT = (Deno.env.get("ELIGIBILITY_ROOT") ?? new URL("../../..", import.meta.url).pathname).replace(/\/$/, "");
const req = createRequire(`${ROOT}/package.json`);
const mod = (p: string) => req(`${ROOT}/${p}`);
const Router = mod("packages/domain/142-career-router.js");
const Doorstep = mod("packages/domain/141-career-doorstep.js");
const Portal = mod("packages/domain/149-career-portal-apply.js");
const Apply = mod("packages/domain/132-career-apply.js");
const Onboarding = mod("packages/domain/130-career-onboarding.js");
const Outreach = mod("packages/domain/124-career-outreach.js");
const Jobs = mod("packages/domain/121-career-jobs.js");
const { ExtensionSync } = await import(`${ROOT}/supabase/functions/_shared/extension_sync.js`);
const { CareerPortalApply: BundledPortal } = await import(`${ROOT}/supabase/functions/_shared/extension_domain.js`);
const { chooseOption } = await import(`${ROOT}/supabase/functions/_shared/answer_options.ts`);
const { statedValue: g2StatedValue } = await import(`${ROOT}/supabase/functions/_shared/eligibility_draft.ts`);
// The proposed contract module (does not exist yet): plain JS, so the router bundle and the edge functions share it.
const loadEligibility = () => mod("packages/domain/156-career-eligibility.js");

const NOW = "2026-10-23T12:00:00Z";
// What a person's sponsorship correction leaves on the profile today (142 writeSensitiveCorrection, observed).
const LEGACY = {
  fallback: { workAuthorization: "No longer needs sponsorship", needsSponsorship: false }, // said: "No sponsorship needed."
  dontNeed: { workAuthorization: "I don't need sponsorship", needsSponsorship: false },
  need: { workAuthorization: "I need sponsorship", needsSponsorship: true },
};
// The proposed typed shape, confirmed from the person's own words.
const typed = (wa: "authorized" | "not_authorized" | "unknown", sp: "needs" | "not_needed" | "unknown") => ({
  version: 1,
  work_authorization_us: wa === "unknown" ? { value: "unknown", confirmed: false, provenance: null }
    : { value: wa, confirmed: true, provenance: { kind: "person_statement", text: wa === "authorized" ? "I am authorized to work in the US." : "I am not authorized to work in the US.", at: NOW, via: "chat" } },
  sponsorship: sp === "unknown" ? { value: "unknown", confirmed: false, provenance: null }
    : { value: sp, confirmed: true, provenance: { kind: "person_statement", text: sp === "needs" ? "I will need sponsorship." : "I don't need sponsorship.", at: NOW, via: "chat" } },
});
const profileWith = (constraints: Record<string, unknown>) => ({ basics: { name: "Ada" }, constraints: { ...constraints }, facts: [] });
const NO_SPONSOR_POSTING = { title: "Analyst", company: "Acme", location: "New York, NY", jd_text: "We are unable to sponsor visas for this role." };

// ---------- the writer ----------
Deno.test("writer/142: a sponsorship correction writes the sponsorship fact only, with the person's own words; work authorization is untouched", () => {
  for (const [said, value] of [["No sponsorship needed.", "not_needed"], ["I don't need sponsorship.", "not_needed"], ["I need sponsorship.", "needs"]] as const) {
    const profile = profileWith({});
    Router.handleStateChangeIntents(said, { profile, now: NOW });
    const c = profile.constraints as any;
    assertNode.ok(c.workAuthorization == null, `${said}: workAuthorization was written (${JSON.stringify(c.workAuthorization)})`);
    assertNode.equal(c.eligibility?.sponsorship?.value, value, `${said}: no typed sponsorship fact`);
    assertNode.equal(c.eligibility?.sponsorship?.provenance?.text, said, `${said}: the stored words are not the person's message`);
    assertNode.equal(c.eligibility?.work_authorization_us?.value ?? "unknown", "unknown", `${said}: work authorization was derived`);
  }
});
Deno.test("writer/142: a question about sponsorship writes nothing (regression guard)", () => {
  const profile = profileWith({});
  Router.handleStateChangeIntents("Will I need sponsorship in the future?", { profile, now: NOW });
  assertNode.ok((profile.constraints as any).eligibility == null && (profile.constraints as any).workAuthorization == null);
});

// ---------- the readers, on what is stored today: a sponsorship sentence never answers work authorization ----------
for (const [name, legacy] of Object.entries(LEGACY)) {
  Deno.test(`reader/141 (${name}): the authorization question is asked, not answered from sponsorship`, () => {
    const r = Doorstep.resolveField({ field_id: "work_authorization" }, { profile: profileWith(legacy) });
    assertNode.ok(r.ask, `141 answered ${JSON.stringify(r.value)}`);
  });
  Deno.test(`reader/149 (${name}): no work-authorization answer is derived from a sponsorship sentence`, () => {
    const out = Portal.portalInputsFromBank({ basics: { name: "Ada" }, constraints: legacy }, { now: Date.parse(NOW) });
    assertNode.equal(out.profile?.answers?.work_authorization, undefined, `149 served ${JSON.stringify(out.profile?.answers?.work_authorization)}`);
  });
  Deno.test(`reader/extension-sync (${name}): the live saved-answers composition serves no work-authorization answer`, () => {
    const out = ExtensionSync.composeSavedAnswers({ basics: { name: "Ada" }, constraints: legacy, facts: [] }, Date.parse(NOW), BundledPortal);
    assertNode.equal(out.answers?.work_authorization, undefined, `served ${JSON.stringify(out.answers?.work_authorization)}`);
  });
  Deno.test(`reader/132 (${name}): no saved work-authorization answer`, () => {
    assertNode.equal(Apply.savedAnswerFor(profileWith(legacy), "work_authorization"), null);
  });
  Deno.test(`reader/130 (${name}): "am I authorized" is not answered with a sponsorship sentence`, () => {
    const r = Onboarding.answerFromProfile(profileWith(legacy), "am I authorized to work in the US?");
    assertNode.equal(r.found, false, `130 answered ${JSON.stringify(r.answer)}`);
  });
  Deno.test(`reader/124 (${name}): outreach states no authorization the person did not state`, () => {
    const out = Outreach.profileFactAnswers("Are you authorized to work in the US?", profileWith(legacy), {});
    const wa = (out.answers || []).find((a: any) => a.topic === "work_authorization");
    assertNode.equal(wa, undefined, `124 wrote ${JSON.stringify(wa?.text)}`);
  });
}
Deno.test("reader/124: not needing sponsorship is not a claim of authorization", () => {
  const out = Outreach.profileFactAnswers("Are you authorized to work in the US?", profileWith({ workAuthorization: null, needsSponsorship: false }), {});
  const wa = (out.answers || []).find((a: any) => a.topic === "work_authorization");
  assertNode.equal(wa, undefined, `124 wrote ${JSON.stringify(wa?.text)}`);
});
Deno.test("reader/121: a person who said they do not need sponsorship is never excluded from a no-sponsorship posting as needing it", () => {
  for (const legacy of [LEGACY.fallback, LEGACY.dontNeed]) {
    const prof = { constraints: { work_authorization: legacy.workAuthorization, needs_sponsorship: legacy.needsSponsorship } };
    const fails = Jobs.hardFilters(NO_SPONSOR_POSTING, prof);
    assertNode.ok(!fails.some((f: string) => /you said you need sponsorship/.test(f)), `121 hardFilters: ${JSON.stringify(fails)}`);
    const r = Jobs.evaluateRestrictions(NO_SPONSOR_POSTING, prof);
    const w = JSON.stringify(r).match(/"detail":"no_sponsorship"[^}]*"disposition":"([a-z_]+)"/)?.[1];
    assertNode.notEqual(w, "excluded", `121 evaluateRestrictions excluded the posting (${legacy.workAuthorization})`);
  }
});
Deno.test("reader/answer_options: a yes to work authorization alone never picks an option that also says 'no sponsorship needed'", () => {
  const opts = [{ label: "Yes, I am authorized and do not require sponsorship", value: "a" }, { label: "Yes, but I will require sponsorship in the future", value: "b" }, { label: "No", value: "c" }];
  assertNode.equal(chooseOption("work_authorization", "Yes", opts, "Are you legally authorized to work in the US?"), null);
});

// ---------- positive controls: the typed facts, confirmed, are what every reader answers from ----------
Deno.test("typed/readers: confirmed authorized + not needing sponsorship is answered, each from its own fact", () => {
  const c = { eligibility: typed("authorized", "not_needed") };
  assertNode.equal(Doorstep.resolveField({ field_id: "work_authorization" }, { profile: profileWith(c) }).value, "yes-authorized", "141");
  const p = Portal.portalInputsFromBank({ basics: { name: "Ada" }, constraints: c }, { now: Date.parse(NOW) }).profile.answers;
  assertNode.equal(p.work_authorization?.value, "Yes", "149 work authorization");
  assertNode.equal(p.sponsorship?.value, "No", "149 sponsorship");
  const s = ExtensionSync.composeSavedAnswers({ basics: { name: "Ada" }, constraints: c, facts: [] }, Date.parse(NOW), BundledPortal).answers;
  assertNode.equal(s.work_authorization?.value, "Yes", "extension-sync work authorization");
  assertNode.equal(s.sponsorship?.value, "No", "extension-sync sponsorship");
  assertNode.match(String(Apply.savedAnswerFor(profileWith(c), "work_authorization")), /^Yes/, "132");
  assertNode.equal(Onboarding.answerFromProfile(profileWith(c), "am I authorized to work in the US?").found, true, "130");
  const fails = Jobs.hardFilters(NO_SPONSOR_POSTING, { constraints: { eligibility: c.eligibility } });
  assertNode.deepEqual(fails.filter((f: string) => /sponsor/.test(f)), [], "121");
});
Deno.test("typed/readers: an F-1 OPT person (authorized now, will need sponsorship) gets each answer right", () => {
  const c = { eligibility: typed("authorized", "needs") };
  const p = Portal.portalInputsFromBank({ basics: { name: "Ada" }, constraints: c }, { now: Date.parse(NOW) }).profile.answers;
  assertNode.equal(p.work_authorization?.value, "Yes");
  assertNode.equal(p.sponsorship?.value, "Yes");
  assertNode.equal(Doorstep.resolveField({ field_id: "work_authorization" }, { profile: profileWith(c) }).value, "yes-authorized");
  const fails = Jobs.hardFilters(NO_SPONSOR_POSTING, { constraints: { eligibility: c.eligibility } });
  assertNode.ok(fails.some((f: string) => /offers no sponsorship; you said you need sponsorship/.test(f)), "121 keeps the honest exclusion");
});

// ---------- the contract module (packages/domain/156-career-eligibility.js) ----------
Deno.test("contract/legacy: stored values become typed facts with their provenance, never confirmed", () => {
  const E = loadEligibility();
  const f = E.classifyLegacy(LEGACY.fallback);
  assertNode.equal(f.work_authorization_us.value, "unknown");
  assertNode.equal(f.work_authorization_us.provenance?.writer, "router_fallback", "the router's own text is marked as such");
  assertNode.equal(f.sponsorship.value, "not_needed");
  assertNode.equal(f.sponsorship.confirmed, false);
  assertNode.equal(E.classifyLegacy(LEGACY.need).sponsorship.value, "needs");
  assertNode.equal(E.classifyLegacy({ workAuthorization: "I am authorized to work in the US", needsSponsorship: null }).work_authorization_us.value, "authorized");
  assertNode.equal(E.classifyLegacy({ workAuthorization: "I am authorized to work in the US", needsSponsorship: null }).work_authorization_us.confirmed, false);
  assertNode.equal(E.classifyLegacy({ workAuthorization: "US citizen", needsSponsorship: false }).work_authorization_us.value, "unknown", "citizenship answers neither (G2)");
  assertNode.equal(E.classifyLegacy({ workAuthorization: "I don't need sponsorship", needsSponsorship: true }).sponsorship.value, "unknown", "text and flag disagree: unknown");
  assertNode.equal(E.classifyLegacy({ workAuthorization: "I am authorized to work in Canada", needsSponsorship: null }).work_authorization_us.value, "unknown", "another country");
  for (const v of [{}, { workAuthorization: "", needsSponsorship: null }, { workAuthorization: null }]) {
    const u = E.classifyLegacy(v);
    assertNode.deepEqual([u.work_authorization_us.value, u.sponsorship.value], ["unknown", "unknown"], JSON.stringify(v));
  }
});
Deno.test("contract/answer: only a confirmed fact answers; an unconfirmed one is offered as a draft; neither fact answers the other", () => {
  const E = loadEligibility();
  assertNode.deepEqual(E.answerFor(E.eligibilityOf({ eligibility: typed("authorized", "unknown") }), "work_authorization").value, "Yes");
  assertNode.ok(E.answerFor(E.eligibilityOf({ eligibility: typed("authorized", "unknown") }), "sponsorship").ask, "authorization does not answer sponsorship");
  assertNode.ok(E.answerFor(E.eligibilityOf({ eligibility: typed("unknown", "not_needed") }), "work_authorization").ask, "sponsorship does not answer authorization");
  const legacy = E.answerFor(E.eligibilityOf(LEGACY.dontNeed), "sponsorship");
  assertNode.ok(legacy.ask && legacy.draft?.value === "No" && legacy.draft?.text === "I don't need sponsorship", "legacy: asked, with the stored words as a draft");
  assertNode.ok(!E.answerFor(E.eligibilityOf(LEGACY.fallback), "sponsorship").draft?.text, "the router's fallback text is never offered as the person's words");
});
Deno.test("contract/validate: a malformed typed fact fails closed", () => {
  const E = loadEligibility();
  for (const bad of [
    { version: 1, work_authorization_us: { value: "authorized", confirmed: true, provenance: null }, sponsorship: { value: "unknown", confirmed: false, provenance: null } },
    { version: 1, work_authorization_us: { value: "maybe", confirmed: true, provenance: { kind: "person_statement", text: "x", at: NOW, via: "chat" } }, sponsorship: { value: "unknown", confirmed: false, provenance: null } },
    { version: 2 },
  ]) {
    assertNode.ok(E.answerFor(E.eligibilityOf({ eligibility: bad }), "work_authorization").ask, JSON.stringify(bad));
  }
});
Deno.test("contract/parity: the module reads a sentence exactly as G2's reader does (one reading in TS and JS)", () => {
  const E = loadEligibility();
  for (const t of ["I don't need sponsorship.", "I will need sponsorship in the future.", "No sponsorship needed.", "I am authorized to work in the US.",
    "I'm not authorized to work in the U.S.", "I am authorized to work in Canada.", "I might need sponsorship.", "Will I need sponsorship?",
    "I am a US citizen.", "I have a green card.", "My friend needs sponsorship.", "I don't need sponsorship but I am not authorized to work in the US.",
    "I do not require visa sponsorship.", "I need an H-1B sponsor.", "I am legally authorized to work in the United States."]) {
    for (const fact of ["sponsorship", "work_authorization"] as const) assertNode.equal(E.statedValue(fact, t), g2StatedValue(fact, t), `${fact}: ${t}`);
  }
});
