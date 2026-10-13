// W01 shared fixture + driving library for SC-001..SC-020 (Outreach & Networking).
// ALL people generated here are labeled TEST fixtures (fixture:true, source_list includes
// "test-fixture-w01"). No real person is contacted: sends ride an injected TEST transport
// (in-memory inbox) only. Firm sets are the REAL public data in packages/career-data/firm-sets.json.
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const M = require(path.join(ROOT, "packages/domain/124-career-outreach.js"));
const H = require(path.join(__dirname, "..", "scenario-harness.cjs"));
const FIRM_SETS = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/firm-sets.json"), "utf8"));
const NOW = Date.parse("2026-10-12T15:00:00Z");
const NOW_ISO = "2026-10-12T15:00:00Z";

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const FIRST = ["Aaron", "Bianca", "Carlos", "Dana", "Elias", "Farah", "Gavin", "Hana", "Ivan", "Julia", "Kwame", "Lena", "Marco", "Nadia", "Owen", "Priya", "Quentin", "Rosa", "Stefan", "Tara", "Umar", "Vera", "Wesley", "Ximena", "Yusuf", "Zoe", "Adam", "Beth", "Caleb", "Diana", "Ethan", "Fiona", "George", "Holly", "Isaac", "Jasmine", "Kevin", "Laura", "Miles", "Nina", "Oscar", "Paula", "Ryan", "Sara", "Tom", "Uma", "Victor", "Wendy", "Yara", "Zach", "Maya", "Noah", "Erin", "Felix", "Grace", "Hugo", "Iris", "Jonah", "Kira"];
const LAST = ["Voss", "Reed", "Mendez", "Whitfield", "Ford", "Iqbal", "Holt", "Sato", "Petrov", "Brandt", "Mensah", "Fischer", "Ruiz", "Rahman", "Delacroix", "Natarajan", "Walsh", "Kim", "Novak", "Okafor", "Lindqvist", "Marsh", "Delgado", "Frost", "Adeyemi", "Kowalski", "Tanaka", "Reyes", "Holloway", "Brandt", "Singh", "Murphy", "Castillo", "Weber", "Osei", "Larsen", "Peters", "Nakamura", "Ali", "Frost", "Bergstrom", "Costa", "Dube", "Ellery", "Fontaine", "Greco", "Haddad", "Iversen", "Johansson", "Kaur"];
const DOMAINS = {
  "Goldman Sachs": "goldmansachs.com", "Morgan Stanley": "morganstanley.com", "JPMorgan": "jpmorgan.com",
  "Bank of America": "bofa.com", "Citi": "citi.com", "Barclays": "barclays.com", "Deutsche Bank": "db.com",
  "UBS": "ubs.com", "Evercore": "evercore.com", "Lazard": "lazard.com", "Centerview Partners": "centerviewpartners.com",
  "PJT Partners": "pjtpartners.com", "Moelis & Company": "moelis.com", "Perella Weinberg": "pwpartners.com",
  "Houlihan Lokey": "hl.com", "Guggenheim Securities": "guggenheimpartners.com", "Rothschild & Co": "rothschildandco.com",
  "Jefferies": "jefferies.com", "Piper Sandler": "pipersandler.com", "William Blair": "williamblair.com",
  "Baird": "rwbaird.com", "Raymond James": "raymondjames.com", "Stifel": "stifel.com",
  "Lincoln International": "lincolninternational.com", "Harris Williams": "harriswilliams.com",
  "McKinsey & Company": "mckinsey.com", "Bain & Company": "bain.com", "Boston Consulting Group": "bcg.com",
  "Blackstone": "blackstone.com", "KKR": "kkr.com", "Apollo Global Management": "apollo.com", "Carlyle": "carlyle.com", "TPG": "tpg.com",
  "Bain Capital": "baincapital.com", "Jane Street": "janestreet.com", "Citadel Securities": "citadelsecurities.com",
  "Hudson River Trading": "hudson-trading.com", "Two Sigma": "twosigma.com", "D. E. Shaw": "deshaw.com",
  "Optiver": "optiver.com", "Jump Trading": "jumptrading.com", "Susquehanna International Group": "sig.com",
  "Deloitte": "deloitte.com", "PwC": "pwc.com", "EY": "ey.com", "KPMG": "kpmg.com",
  "Stripe": "stripe.com", "Ramp": "ramp.com", "Plaid": "plaid.com", "Datadog": "datadoghq.com",
  "Palantir": "palantir.com", "Google": "google.com", "Meta": "meta.com", "Microsoft": "microsoft.com",
};
const domainFor = (firm) => DOMAINS[firm] || (String(firm).toLowerCase().replace(/[^a-z0-9]+/g, "") + ".test");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ".");

let PID = 0;
function factFor(c, kind) {
  // Labeled fixture fact with a (fixture) source URL — stands in for a public bio/team-page fact.
  const url = `https://fixtures.test/w01/${slug(c.full_name || "person")}-${PID}`;
  const topics = {
    path: { fact: `moved from ${c.prior || "a prior role"} to ${c.current_firm} as a ${c.title}`, topic: `your path into ${c.current_firm}`, strength: "strong" },
    school: { fact: `studied at ${(c.schools || [])[0] || "their school"} before joining ${c.current_firm}`, topic: `your time at ${(c.schools || [])[0] || "school"} and the move to ${c.current_firm}`, strength: "medium" },
    deal: { fact: `worked on a ${c.deal || "recent transaction"} at ${c.current_firm}`, topic: `the ${c.deal || "deal"} work`, strength: "strong" },
    build: { fact: `built ${c.built || "a product feature"} at ${c.current_firm}`, topic: `building ${c.built || "the product"}`, strength: "strong" },
    panel: { fact: `spoke on a ${c.panel || "career"} panel about ${c.title} work at ${c.current_firm}`, topic: `your panel comments on ${c.title} work`, strength: "medium" },
    hometown: { fact: `grew up in ${c.hometown || "the user's hometown"} before ${c.current_firm}`, topic: `growing up in ${c.hometown || "our hometown"} and landing at ${c.current_firm}`, strength: "medium" },
    major: { fact: `majored in ${c.major || "their field"} before joining ${c.current_firm}`, topic: `coming from ${c.major || "that major"} into ${c.current_firm}`, strength: "medium" },
    competition: { fact: `competed in ${c.competition || "competition math"} before joining ${c.current_firm}`, topic: `competition math and the move to ${c.current_firm}`, strength: "strong" },
    github: { fact: `publishes ${c.project || "open-source work"} on GitHub while at ${c.current_firm}`, topic: `your GitHub work on ${c.project || "the project"}`, strength: "strong" },
  };
  const t = topics[kind || "path"] || topics.path;
  return { fact: t.fact, source_url: url, date: "2026-09-15", strength: t.strength, topic: t.topic };
}

function person(o) {
  PID++;
  const full = o.full_name || `${FIRST[(PID * 7) % FIRST.length]} ${LAST[(PID * 13) % LAST.length]}`;
  const firm = o.current_firm || "Goldman Sachs";
  const c = Object.assign({
    person_id: "w01-p" + PID, full_name: full, current_firm: firm,
    title: o.title || "Analyst", seniority_band: o.seniority_band || "analyst",
    geography: o.geography || "New York", office: o.office || o.geography || "New York", country: "US",
    schools: o.schools || [], grad_year: o.grad_year || 2024, prior_firms: o.prior_firms || [],
    work_email: o.work_email !== undefined ? o.work_email : `${slug(full)}@${domainFor(firm)}`,
    email_confidence: o.email_confidence != null ? o.email_confidence : 0.92,
    email_verification: o.email_verification || "verified", last_verified_at: "2026-10-05T00:00:00Z",
    personalization_facts: o.personalization_facts || [], relationship_to_user: o.relationship_to_user || "none",
    source_list: ["test-fixture-w01"], fixture: true,
  }, o.extra || {});
  for (const k of Object.keys(o)) if (!(k in c) && !k.startsWith("_")) c[k] = o[k];
  if (!o.personalization_facts && o.factKind) c.personalization_facts = [factFor(c, o.factKind)];
  return c;
}

// Generate n fixture people spread round-robin across firms, with per-scenario attribute hooks.
function generate(n, firms, hook, seed) {
  const r = rng(seed || 1234); const out = [];
  for (let i = 0; i < n; i++) {
    const firm = firms[i % firms.length];
    const o = { current_firm: firm, _i: i, _r: r };
    if (hook) Object.assign(o, hook(i, firm, r) || {});
    out.push(person(o));
  }
  return out;
}

// Injected TEST transport: an in-memory seed inbox. Nothing leaves the process.
function testTransport(opts) {
  opts = opts || {}; const sent = new Map(); const inbox = [];
  const t = { kind: "test-seed-inbox", calls: 0, sent, inbox,
    hasSent: async (k) => sent.has(k),
    send: async (msg) => {
      t.calls++;
      if (opts.bounceEmails && opts.bounceEmails.has(msg.to)) return { bounced: true, reason: "fixture_bounce" };
      if (sent.has(msg.idempotencyKey)) return { messageId: sent.get(msg.idempotencyKey), duplicate_prevented: true };
      const id = "test-msg-" + (sent.size + 1); sent.set(msg.idempotencyKey, id); inbox.push(Object.assign({ messageId: id }, msg));
      return { messageId: id };
    } };
  return t;
}

// Local verifier with injected DNS: every fixture domain resolves MX except listed bad ones.
function fixtureVerifier(badDomains) {
  const bad = new Set(badDomains || []);
  return M.createVerifier({ dnsLookup: async (d) => bad.has(d) ? { mx: [] } : { mx: ["mx." + d] } });
}
async function verifyPool(records, verifier) {
  let verified = 0, invalid = 0, risky = 0;
  for (const c of records) {
    if (!c.work_email) continue;
    const v = await verifier.verify(c.work_email);
    c.email_verification = v.status; if (v.status === "verified") verified++; else if (v.status === "invalid") invalid++; else risky++;
  }
  return { verified, invalid, risky };
}

function draftAll(cands, user, opts) {
  opts = opts || {}; const drafts = [], tiers = { A: 0, B: 0, C: 0 }; let gatePass = 0, retried = 0; const bodies = []; const failures = {};
  for (const c of cands) {
    let r = M.draftAndGate(c, user, { nowMs: NOW, batchBodies: bodies });
    // Gate flagged a duplicate body (fixture people can share first name + firm + fact template):
    // re-draft from another of the person's fixture facts — the product's real remediation for batch collisions.
    const altKinds = ["panel", "school", "deal", "build", "path"];
    for (let k = 0; !r.gate.pass && k < altKinds.length; k++) {
      retried++;
      const clone = Object.assign({}, c, { personalization_facts: [factFor(c, altKinds[k])] });
      r = M.draftAndGate(clone, user, { nowMs: NOW, batchBodies: bodies });
    }
    drafts.push(r.draft); bodies.push(r.draft); tiers[r.draft.tier] = (tiers[r.draft.tier] || 0) + 1; if (r.gate.pass) gatePass++;
    else (failures[drafts.length - 1] = r.gate.failures);
  }
  return { drafts, tiers, gatePass, gateTotal: drafts.length, retried, failures };
}
function sampleDrafts(s, drafts, n, label) {
  for (const d of (drafts || []).slice(0, n || 2)) {
    s.agent(`Sample draft (${label || "campaign"}) — Tier ${d.tier}, to ${d.to}:\nSubject: ${d.subject}\n\n${d.body}`, { card: { title: `Draft · Tier ${d.tier} · ${d.name_used}`, tier: d.tier, to: d.to, subject: d.subject, why_this_line: d.why_this_line, dropped_unsourced: d.dropped_unsourced } });
  }
}
function tierLine(t) { return `Tier mix: A=${t.A || 0} B=${t.B || 0} C=${t.C || 0}`; }

const USERS = {
  alex: { name: "Alex Testcase (TEST)", school: "TEST University", year: "sophomore", year_label: "'28", experience: "building a reporting dashboard used by 200 users at a campus systems job" },
  jordanWharton: { name: "Jordan Lee (TEST)", school: "Wharton School, University of Pennsylvania", year: "junior", year_label: "'27", experience: "a sophomore summer analyst stint at a boutique bank, where I built merger models on two live deals" },
  samFreshman: { name: "Sam Ortiz (TEST)", school: "large state university (TEST)", year: "freshman", year_label: "'29", experience: "a member of my school's finance club" },
  morganVP: { name: "Morgan Hale (TEST)", school: "TEST University", year: "", year_label: "", experience: "nine years in investment banking, most recently as a VP leading sell-side processes" },
};
const PROFILES = {
  alex: { school: "TEST University", current_employer: null },
  jordanWharton: { school: "Wharton School, University of Pennsylvania", current_employer: null },
  samFreshman: { school: "large state university (TEST)", current_employer: null },
  morganVP: { school: "TEST University", current_employer: "TEST Bank (current employer — excluded)" },
};

module.exports = { M, H, FIRM_SETS, NOW, NOW_ISO, rng, person, generate, factFor, testTransport, fixtureVerifier, verifyPool, draftAll, sampleDrafts, tierLine, USERS, PROFILES, domainFor, slug, FIRST, LAST };
