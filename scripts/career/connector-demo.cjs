// Connector v1 demo — TEST PROFILES ONLY (synthetic people, an
// in-memory pool; nothing here is a real user, a real send, or a
// production surface). Drives the real career host + router through
// the full slice: two profiles state needs/offers -> explicit opt-in
// -> proposal (identity-free) -> A yes (nothing fires) -> B is shown
// the proposal -> B yes -> the intro lands on both records with the
// 72h follow-up marker -> booking acceptance recorded.
// Run: node scripts/career/connector-demo.cjs
"use strict";
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const ConnectorGate = D("156-career-connector-gate.js");

const NOW = Date.parse("2026-10-21T14:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const store = { accounts: new Map(), threads: new Map() };

// The in-memory pool: test tooling implementing the design note's
// pool interface over the harness account store.
function keyedOf(store, userId) {
  const a = store.accounts.get(userId) || {};
  return (a.stated_facts && a.stated_facts.keyed) || [];
}
function recordOf(store, userId, kind, key) {
  const f = keyedOf(store, userId).find((x) => x.kind === kind && (x.key || null) === (key || null));
  if (!f) return null;
  try { return JSON.parse(f.value); } catch { return null; }
}
function makePool(store) {
  const proposals = new Map();
  let seq = 0;
  const snap = (p) => (p ? clone(p) : null);
  return {
    getProfile(userId) { const r = recordOf(store, userId, "connector_profile", "self"); return r ? { name: r.name || null, needs: r.needs || null, offers: r.offers || null } : null; },
    optedInProfiles(exceptUserId) {
      const out = [];
      for (const userId of store.accounts.keys()) {
        if (userId === exceptUserId) continue;
        const c = recordOf(store, userId, "connector_consent", "pool");
        if (c && c.status === "opted_in") { const profile = this.getProfile(userId); if (profile) out.push({ userId, profile }); }
      }
      return out;
    },
    openProposalFor(userId) { for (const p of proposals.values()) if ((p.aId === userId || p.bId === userId) && (p.state === "awaiting_a" || p.state === "awaiting_b")) return snap(p); return null; },
    createProposal({ aId, bId, state, createdAt }) { seq += 1; const p = { id: "prop-" + seq, aId, bId, state, createdAt, presentedB: false }; proposals.set(p.id, p); return snap(p); },
    updateProposal(id, patch) { const p = proposals.get(id); if (p) Object.assign(p, patch); return snap(p); },
    proposal(id) { return snap(proposals.get(id)); },
    proposalsFor(userId) { return [...proposals.values()].filter((p) => p.aId === userId || p.bId === userId).map(snap); },
    recordIntro(userId, fact) {
      const a = store.accounts.get(userId) || {};
      const sf = a.stated_facts && typeof a.stated_facts === "object" ? a.stated_facts : {};
      const keyed = Array.isArray(sf.keyed) ? sf.keyed.slice() : (Array.isArray(sf.facts) ? sf.facts.slice() : []);
      const i = keyed.findIndex((f) => f.kind === fact.kind && (f.key || null) === (fact.key || null));
      const entry = { kind: fact.kind, key: fact.key, value: fact.value, evidence: fact.evidence, at: fact.at };
      if (i >= 0) keyed[i] = entry; else keyed.push(entry);
      a.stated_facts = { ...sf, facts: keyed, keyed, updated_at: fact.at };
      store.accounts.set(userId, a);
    },
    setIntroBooking(proposalId, booking) {
      for (const userId of store.accounts.keys()) {
        const intros = keyedOf(store, userId).filter((f) => f.kind === "connector_intro" && f.key === proposalId);
        for (const f of intros) { const v = JSON.parse(f.value); v.booking = booking; f.value = JSON.stringify(v); }
      }
    },
  };
}

const ANA = "demo-ana", BEN = "demo-ben";
const pool = makePool(store);
const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  connectorPool: pool,
});
let n = 0;
const lines = [];
function say(userId, threadId, text) {
  n += 1;
  const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: {}, connectorGate: ConnectorGate.decide({ CONNECTOR_ENABLED: "true", CONNECTOR_ALLOWLIST: ANA + "," + BEN }, userId) });
  const out = host.runTurn(text, ctx);
  store.threads.set(threadId, host.extractSnapshot(ctx));
  if (ctx._hostPatch) { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
  const who = userId === ANA ? "ANA (TEST)" : "BEN (TEST)";
  lines.push(`### ${who} — thread ${threadId}`, "", `> ${text}`, "", `**Trainee** [${out.intent}]`, "", out.reply || "(no reply)", "");
  return out;
}

lines.push("# Connector v1 — demo transcript (TEST profiles only)", "", "Synthetic people (Ana/Ben), in-memory pool, product chat path (career host + router). No real users, no sends, no production surface.", "");

say(ANA, "ta", "Opt me into matching — my name is Ana. I need intros to alumni working in investment banking, and I can offer interview prep and resume reviews.");
say(ANA, "ta", "Yes — opt me in.");
say(BEN, "tb", "My name is Ben. I need interview prep for banking superdays, and I can offer alumni perspective from inside investment banking.");
say(BEN, "tb", "Yes — opt me in.");
say(ANA, "ta", "find me a match");
say(ANA, "ta", "yes to the match");
lines.push("_State check: intro records on either account after ONE yes: " + (keyedOf(store, ANA).filter((f) => f.kind === "connector_intro").length + keyedOf(store, BEN).filter((f) => f.kind === "connector_intro").length) + " (must be 0)._", "");
say(BEN, "tb", "any matches for me?");
say(BEN, "tb", "yes — introduce us");
const introA = keyedOf(store, ANA).find((f) => f.kind === "connector_intro");
const introB = keyedOf(store, BEN).find((f) => f.kind === "connector_intro");
lines.push("## The records after both yeses", "", "Ana's intro record:", "", "```json", JSON.stringify(JSON.parse(introA.value), null, 2), "```", "", "Ben's intro record (same intro text; the 72h marker on both):", "", "```json", JSON.stringify(JSON.parse(introB.value), null, 2), "```", "");
say(ANA, "ta", "book the call");
const after = JSON.parse(keyedOf(store, BEN).find((f) => f.kind === "connector_intro").value);
lines.push(`Booking state on Ben's record after Ana's "book the call": **${after.booking}** (acceptance recorded on both records; no calendar artifact created or claimed — Google connect is the seam).`, "");
say(ANA, "ta", "check in on my intro");

console.log(lines.join("\n"));
