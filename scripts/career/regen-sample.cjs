// W3 post-fix sample regeneration (2026-10-13): produces 10 APPROVABLE
// networking drafts with the FIXED module-124 generator over W01-lib
// fixture shapes (varied firms, structures, fact kinds) and writes them to
// ~/workspace/your_files/review/post-fix-sample-staging.md for re-review.
// Drafts are generated, never hand-edited: the script throws if any of the
// 10 does not come back gate-pass + awaiting_approval + store-approvable.
// It also re-runs the replay hold shapes (Tier C / departed) and lists what
// the new rules now hold. Sends nothing; approves nothing outside its own
// in-memory draft store (used only to prove approvability).
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..");
const L = require(path.join(__dirname, "scenarios", "_w01-lib.cjs"));
const M = L.M;
const OUT = path.join(ROOT, "..", "your_files", "review", "post-fix-sample-staging.md");

const PLAN = [
  { user: "alex", firm: "Evercore", title: "Analyst", factKind: "deal", extra: { deal: "sponsor-backed carve-out" } },
  { user: "jordanWharton", firm: "Goldman Sachs", title: "Analyst", factKind: "path", extra: { prior: "Morgan Stanley" } },
  { user: "alex", firm: "Stripe", title: "Engineer", factKind: "build", extra: { built: "a recruiting dashboard" } },
  { user: "samFreshman", firm: "Jane Street", title: "Trader", factKind: "competition", extra: { competition: "competition math" } },
  { user: "morganVP", firm: "Lazard", title: "Associate", factKind: "path", extra: { prior: "Goldman Sachs" } },
  { user: "alex", firm: "Google", title: "Engineer", factKind: "github", extra: { project: "open-source ML tooling" } },
  { user: "jordanWharton", firm: "Blackstone", title: "Associate", factKind: "deal", extra: { deal: "industrial logistics acquisition" } },
  { user: "alex", firm: "McKinsey & Company", title: "Associate", factKind: "panel", extra: { panel: "alumni", schools: ["TEST University"] } },
  { user: "samFreshman", firm: "KKR", title: "Analyst", factKind: "hometown", extra: { hometown: "Chicago, IL", schools: ["large state university (TEST)"] } },
  { user: "alex", firm: "Bain & Company", title: "Associate", factKind: "major", extra: { major: "Economics", schools: ["TEST University"] } },
];

function main() {
  const store = M.createDraftStore();
  const entries = [];
  PLAN.forEach((p, i) => {
    const user = L.USERS[p.user];
    const c = L.person(Object.assign({ current_firm: p.firm, title: p.title, factKind: p.factKind }, p.extra || {}));
    // Medium-strength fact kinds (panel/hometown/major/school) tier on the
    // school-overlap signal: point the profile at the fixture user's school.
    const r = M.draftAndGate(c, user, { nowMs: L.NOW, structureIndex: i % 5 });
    if (!r.gate.pass || r.status !== "awaiting_approval") {
      throw new Error(`sample ${i + 1} (${p.factKind}@${p.firm}) is not approvable: status=${r.status} failures=${(r.gate.failures || []).join(",")}`);
    }
    const rec = store.put(r.draft, {});
    if (!rec || rec.status !== "awaiting_approval" || !store.approve(rec.id, { by: "regen-sample-approvability-check" }).ok) {
      throw new Error(`sample ${i + 1} (${p.factKind}@${p.firm}) failed the store approvability check`);
    }
    entries.push({ i: i + 1, plan: p, candidate: c, user, draft: r.draft, gate: r.gate });
  });

  // Held-by-the-new-rules shapes, re-run live so the note reports real state.
  const holds = [];
  const noFacts = L.person({ current_firm: "Evercore", title: "Analyst", personalization_facts: [] });
  const rC = M.draftAndGate(noFacts, L.USERS.alex, { nowMs: L.NOW });
  holds.push({ label: "Tier C — candidate with NO sourced personalization fact (W01 replay shape)", status: rC.status, held_reason: rC.held_reason || null, failures: rC.gate.failures });
  const genericPath = L.person({ current_firm: "Evercore", title: "Analyst", factKind: "path" });
  const rG = M.draftAndGate(genericPath, L.USERS.alex, { nowMs: L.NOW });
  holds.push({ label: "Tier C — generic bare-move path fact only ('moved from a prior role to Evercore as a Analyst', labeled strong; demoted by isGenericFact, no other B signal)", status: rG.status, held_reason: rG.held_reason || null, failures: rG.gate.failures });
  const departed = Object.assign(L.person({ current_firm: "Acme Robotics (TEST)", title: "Engineer (TEST)", factKind: "build", built: "a robotics demo" }),
    { title_stale: false, last_verified_at: "2026-09-20T00:00:00Z", former_employer_note: "Left Acme Robotics (TEST) June 2025; current role unknown (TEST ground truth)" });
  const rD = M.draftAndGate(departed, L.USERS.alex, { nowMs: L.NOW });
  holds.push({ label: "Departed recipient — NW03 shape (former_employer_note present, recently 'verified')", status: rD.status, held_reason: rD.held_reason || null, failures: rD.gate.failures });
  for (const h of holds) if (h.status !== "held") throw new Error("expected hold did not hold: " + h.label + " -> " + h.status);

  const lines = [];
  lines.push("# POST-FIX SAMPLE FOR RE-REVIEW — 10 drafts, generated by the fixed generator (not hand-edited); the 105 earlier drafts remain unapproved.");
  lines.push("");
  for (const e of entries) {
    lines.push(`## ${e.i}. ${e.candidate.full_name} — ${e.candidate.title} at ${e.candidate.current_firm} (fixture recipient, fact kind: ${e.plan.factKind}, structure: ${e.draft.structure})`);
    lines.push("");
    lines.push(`- Tier: ${e.draft.tier}`);
    lines.push(`- Subject: ${e.draft.subject}`);
    lines.push(`- Gate: pass=${e.gate.pass} failures=[${e.gate.failures.join(", ")}] — status awaiting_approval, store approvability verified`);
    lines.push("");
    lines.push(e.draft.body);
    lines.push("");
  }
  lines.push("## Held by the new rules");
  lines.push("");
  lines.push("The generator now holds these replay shapes instead of drafting them to approval:");
  lines.push("");
  for (const h of holds) lines.push(`- ${h.label} → status=${h.status}, held_reason=${h.held_reason}, gate failures=[${h.failures.join(", ")}]; approve() refuses held drafts.`);
  lines.push("");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, lines.join("\n"));
  console.log("wrote " + OUT + " with " + entries.length + " approvable drafts; holds: " + holds.map((h) => h.held_reason).join(", "));
}
main();
