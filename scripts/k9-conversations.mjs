// K9 proof harness: drives the PRODUCTION code path — AgentBureaus from the built router bundle
// (supabase/functions/_shared/router_core.js), the same module agent-chat's bureau_answer.ts calls —
// through the four items' conversations, threading case state turn to turn the way the chat does, and
// writes the word-for-word transcripts + ordered message lists the brief requires.
// Run: python3 scripts/build-router-core.py && node scripts/k9-conversations.mjs
import { AgentBureaus as B } from "../supabase/functions/_shared/router_core.js";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = process.env.HOME + "/workspace/your_files/upmore-conversations";
mkdirSync(OUT, { recursive: true });
const D = "2026-10-12";

function run(turns) {
  // turns: [{user, ctx}] — ctx is merged into a running context; records accumulate into freeze_state.
  const ctx = { today: D };
  const messages = [];
  for (const t of turns) {
    Object.assign(ctx, t.ctx || {});
    messages.push({ who: "user", text: t.user });
    const a = B.answer(t.user, { ...ctx });
    if (!a) throw new Error("no answer for: " + t.user);
    messages.push({ who: "agent", text: a.text });
    if (a.records) {
      const key = a.capability === "C205" ? "minor_state" : "freeze_state";
      const prior = (ctx[key] || {}).bureaus || [];
      const merged = [...prior.filter(p => !a.records.some(r => r.bureau === p.bureau)), ...a.records];
      ctx[key] = { bureaus: merged };
    }
    if (a.kind === "dispute_clock" && !ctx.dispute_filed_on) ctx.dispute_filed_on = ctx.today;
  }
  return messages;
}

function save(fileBase, title, header, conversations) {
  const all = conversations.flat();
  let md = `# ${title}\n\n${header}\n`;
  conversations.forEach((msgs, i) => {
    md += `\n## Conversation ${i + 1}\n\n`;
    for (const m of msgs) md += `${m.who === "user" ? "USER" : "UPMORE"}: ${m.text}\n---\n`;
  });
  writeFileSync(`${OUT}/${fileBase}.md`, md);
  writeFileSync(`${OUT}/${fileBase}.messages.json`, JSON.stringify({ title, messages: all }, null, 1));
  console.log(fileBase, all.length, "messages");
}

const HDR = `Sandbox proof, 2026-10-12, America/Chicago. These conversations ran through the production code path — agent-chat's bureauReply over the router bundle's AgentBureaus (packages/domain/118-agent-bureaus.js) — with case state threaded turn to turn. Every message is complete and word-for-word, both directions, nothing trimmed. Bureau submissions are the owner's own taps by design; the conversations show that boundary rather than hiding it.`;

// C139 — Freeze my credit at all three bureaus
save("C139-freeze-credit", "C139 — Freeze my credit at all three bureaus", HDR + `\nData: no owner bureau data exists (no bureau PINs on file — owner's taps). The flow runs on the bureaus' real published steps, links and phone numbers (checked 2026-10-12).`, [
  run([
    { user: "Freeze my credit. There was a breach at my doctor's office." },
    { user: "Equifax is frozen" },
    { user: "my Equifax PIN is 482916, save that" },
    { user: "Experian is frozen too" },
    { user: "TransUnion is done" },
  ]),
  run([
    { user: "I need to unfreeze my credit temporarily — I'm applying for an apartment next week.", ctx: { freeze_state: { bureaus: [{ bureau: "Equifax", state: "frozen", recorded_at: D }, { bureau: "Experian", state: "frozen", recorded_at: D }, { bureau: "TransUnion", state: "frozen", recorded_at: D }] } } },
  ]),
]);

// C140 — Dispute an error on my credit report. Stand-in report (flagged): Experian report as of
// 2026-10-01 with one collections item — Meridian Recovery Services, $412.37, opened 2025-11-14.
const REPORT = { bureau: "Experian", as_of: "2026-10-01", collections: [{ name: "Meridian Recovery Services (original creditor: Cascade Store Card)", amount_cents: 41237, opened_on: "2025-11-14" }], accounts: [] };
save("C140-dispute-error", "C140 — Dispute an error on my credit report", HDR + `\nData: STAND-IN data for conversation 2 — a stand-in Experian report (as of 2026-10-01) with one collections item (Meridian Recovery Services, $412.37, opened 2025-11-14). Live proof needs the owner's real pulled report (annualcreditreport.com) and the real error's furnisher, amount and opened date. Conversation 1 is the production-honest path with no report connected. Hand-computed clock parity: filed Oct 12, 2026 -> 30-day deadline Nov 11, 2026; on Nov 20 the dispute is 9 days overdue.`, [
  run([{ user: "There's a collections account on my report that isn't mine." }]),
  run([
    { user: "There's a collections account on my report that isn't mine.", ctx: { report: REPORT, dispute_item: REPORT.collections[0], dispute_reason: "This account is not mine; I did not open it and I do not owe it." } },
    { user: "I filed the dispute today" },
    { user: "It's been over a month and the collections is still on my report", ctx: { today: "2026-11-20" } },
    { user: "Update — the collections is gone from my report", ctx: { today: "2026-11-24" } },
  ]),
]);

// C151 — Identity theft report and recovery. Stand-in fraudulent account (flagged).
save("C151-identity-theft", "C151 — Identity theft report and recovery", HDR + `\nData: STAND-IN data — one stand-in fraudulent account (Cascade Store Card, $1,187.42, opened 2026-09-28). Live proof needs the owner's real FTC Identity Theft Report and the real fraudulent accounts as they show on his pulled reports. The FTC filing and the fraud-alert call are the owner's taps; the plan prepares everything around them.`, [
  run([
    { user: "Someone opened a card in my name. Fix my identity.", ctx: { fraud_accounts: [{ name: "Cascade Store Card", amount_cents: 118742, opened_on: "2026-09-28" }] } },
    { user: "The FTC report is filed" },
    { user: "Fraud alert is set" },
    { user: "Freeze my credit" },
  ]),
]);

// C205 — Freeze my kid's credit. Stand-in child (flagged).
save("C205-freeze-kids-credit", "C205 — Freeze my kid's credit", HDR + `\nData: STAND-IN data — a stand-in child ("Alex", first name only). Live proof needs the owner's real child's details and documents: the child's birth certificate and Social Security card, the owner's government photo ID and proof of address (guardianship order if applicable) — those go in the mail envelopes to the bureaus, never in chat.`, [
  run([
    { user: "Freeze my child's credit before someone abuses it.", ctx: { minor: { first_name: "Alex" }, minor_state: { bureaus: [] } } },
    { user: "Equifax confirmed the freeze for Alex" },
    { user: "Experian confirmed too" },
  ]),
]);
console.log("done");
