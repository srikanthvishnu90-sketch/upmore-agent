"use strict";
// W03 shared helpers — ALL people here are labeled TEST fixtures (synthetic, not real people).
const path = require("path");
const root = path.resolve(__dirname, "..", "..", "..");
const H = require(path.join(root, "scripts/career/scenario-harness.cjs"));
const M = require(path.join(root, "packages/domain/124-career-outreach.js"));
const FIRM_SETS = JSON.parse(require("fs").readFileSync(path.join(root, "packages/career-data/firm-sets.json"), "utf8"));
const NOW = Date.parse("2026-10-13T15:00:00Z");
const USER = { name: "Alex Testcase (TEST)", school: "University of Michigan", year: "sophomore", year_label: "'28", experience: "running a campus investing club (TEST)" };
const PROFILE = { school: "University of Michigan" };
const FIRST = ["Aaron", "Bianca", "Carlos", "Dana", "Elias", "Farah", "Gavin", "Hana", "Ivan", "Julia", "Kwame", "Lena", "Marco", "Nadia", "Owen", "Priya", "Quentin", "Rosa", "Stefan", "Tara", "Umar", "Vera", "Wesley", "Yuki"];
const LAST = ["Voss", "Reed", "Mendez", "Whitfield", "Ford", "Iqbal", "Holt", "Sato", "Petrov", "Brandt", "Mensah", "Fischer", "Ruiz", "Rahman", "Delacroix", "Natarajan", "Walsh", "Kim", "Novak", "Osei", "Lindqvist", "Barros", "Kowalski", "Tanaka"];
function name(i) { return FIRST[i % 24] + " " + LAST[Math.floor(i / 24) % 24] + (i >= 576 ? " " + Math.floor(i / 576) : ""); }
function domainOf(firm) { for (const k of Object.keys(FIRM_SETS.sets)) { const f = FIRM_SETS.sets[k].firms.find((x) => x.name === firm); if (f) return f.domain; } return firm.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".example.test"; }
function emailFor(nm, firm) { return nm.toLowerCase().replace(/[^a-z ]/g, "").replace(/ +/g, ".") + "@" + domainOf(firm); }
function person(i, o) {
  o = o || {}; const firm = o.current_firm || "Evercore"; const nm = o.full_name || name(i);
  return Object.assign({ person_id: "w03-" + i, full_name: nm, current_firm: firm, title: "Analyst", seniority_band: "analyst",
    geography: "NYC", office: "New York", country: "US", schools: ["University of Michigan"], work_email: emailFor(nm, firm),
    email_confidence: 0.9, email_verification: "verified", email_source: "directory", last_verified_at: "2026-10-01T00:00:00Z",
    personalization_facts: [], relationship_to_user: "same school", source_list: ["w03-test-fixture"] }, o);
}
function poolOverFirms(firms, perFirm, opts) {
  opts = opts || {}; const out = []; let i = opts.startIndex || 0;
  for (const firm of firms) for (let j = 0; j < perFirm; j++, i++) out.push(person(i, Object.assign({}, opts.base || {}, { current_firm: firm }, typeof opts.per === "function" ? opts.per(i, firm, j) : {})));
  return out;
}
function mockTransport() { const sent = new Map(); const t = { kind: "mock", calls: 0, sent, hasSent: async (k) => sent.has(k), send: async (msg) => { t.calls++; if (!sent.has(msg.idempotencyKey)) sent.set(msg.idempotencyKey, "mock-" + (sent.size + 1)); return { messageId: sent.get(msg.idempotencyKey) }; } }; return t; }
module.exports = { H, M, FIRM_SETS, NOW, USER, PROFILE, name, domainOf, emailFor, person, poolOverFirms, mockTransport, root };
