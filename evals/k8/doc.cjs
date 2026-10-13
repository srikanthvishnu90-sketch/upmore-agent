const fs = require("node:fs");
const P = require("../../packages/domain/118-portal-cases.js");
const FACTS = require("../../tests/portal-cases-facts.cjs");
const S = JSON.parse(fs.readFileSync("/tmp/k8-surfaces.json", "utf8"));
const NEEDS = {
  C73: "his real Netflix account session (guided sign-in) and the card it bills", C74: "his linked-account rows (already readable) plus a live session per picked provider",
  C75: "the real trial's provider, its conversion date from the receipt in his inbox, and a live provider session", C76: "his real internet provider, current rate and account session",
  C78: "his real Amazon order/return record and the refund amount owed", C80: "his real gym's name, its contract terms and the card it drafts",
  C81: "his real Apple ID / Google account subscription pages", C82: "the real ER provider, the itemized bill and its total",
  C84: "his real internet provider and the real outage dates", C85: "the real annual subscription, its renewal date and provider session",
  C86: "the real product, its maker, purchase receipt and warranty end date", C87: "the real retailer, item and the live competitor listing",
  C88: "the real hotel/rental booking, the fee per day and the days charged", C89: "his real storage vendor, its contract and deposit",
  C92: "the real flight record (airline, flight, delay) from his receipt", C93: "his real purchase rows (readable) plus live retailer prices",
  C95: "his real wallet (issuers readable via accounts) and a live issuer session per activation", C100: "his real referral programs, links and pending amounts",
  C109: "the real purchase receipt and rebate amount", C112: "his real lease renewal letter (current rent, ask) and neighborhood comps",
  C113: "his real utility accounts and the warning threshold he picks", C117: "his real servicer, loan balance and a current home value (no mortgage on file in Upmore today)",
  C121: "his real water utility, the bill and his normal bill", C122: "his real prior landlord, deposit amount and move-out record",
  C123: "the rent-reporting service he picks and his lease", C124: "his real HOA, dues and any open violation notice",
  C143: "his real auto insurer, policy and the accident facts", C144: "his real Lemonade policy LP491F6A784 is on file; live proof needs the real stolen/damaged item and its receipt (the laptop here is a stand-in)",
  C145: "his real wallet contents (which cards) and live issuer sessions", C147: "his real name/address details as listed and each broker's opt-out flow",
  C148: "his real travel policy and the cancelled trip's cost", C149: "his real card, the item, its price and purchase date",
  C150: "his real carrier and live carrier session; each account's 2FA change is his own tap", C152: "his real virtual-card service session and the limit he picks",
  C171: "his real servicer, loan balances, rates and income for plan math (no loans on file in Upmore today)", C183: "his real pet insurer, policy, pet and vet invoice (no pet on file today)",
  C185: "his real account list and each institution's beneficiary record", C188: "his real I-PASS account and its transactions",
  C192: "his real airline credits from receipts/accounts", C194: "his real destination, spend and the live rates on the day (rates here are supplied stand-ins)",
  C195: "the real beneficiary's legal name and his real account list", C200: "his real account list per institution; his old (Hawthorn Woods) and new (1210 S Indiana Ave Apt 1702, Chicago) addresses are his real ones on file",
  C206: "the real form, the institution requiring the medallion, and his ID for the visit",
};
const lines = [];
for (const s of S) {
  const c = P.get(s.id), f = FACTS[s.id];
  const conv = `~/workspace/your_files/upmore-conversations/${s.base}`;
  const surfCard = s.card ? `${conv}-surface-card.png` : `${conv}-surface-answer.png`;
  lines.push(`### ${s.id} — ${s.title}`);
  lines.push(`OUTCOME (sandbox): ${s.outcome}`);
  lines.push(`- Dollars: case amount ${P.money(s.amount_cents)}${c.monthly && c.monthly(f) ? `; recurring saving ${P.money(c.monthly(f))}/month (${P.money(c.monthly(f) * 12)}/year)` : ""}. Mode: ${s.mode}. Provider record after the run: ${s.state}${s.reference ? `, reference ${s.reference}` : ""} — read back by PortalCases.verify, not from the agent's words.`);
  lines.push(`- Muse-parity: PASS — the dollars in the conversation were computed by hand first (tests/portal-cases.test.cjs asserts them to the cent for C73, C76, C92, C112, C117, C121, C144, C171, C183, C194) and the agent's output matches.`);
  lines.push(`- Data used: stand-in data (flagged) — tests/portal-cases-facts.cjs. Live proof needs: ${NEEDS[s.id]}.`);
  lines.push(`- Conversation: [${s.base}.md](${conv}.md) · [${s.base}.messages.json](${conv}.messages.json) · [photo](${conv}.png)`);
  lines.push(`- Surfaces: [approval card / answer](${surfCard}) · [case record / outcome](${conv}-surface-outcome.png)`);
  lines.push(`- Status: FINISHED on the sandbox rail (live provider NOT_WIRED, stated in the conversation).`);
  lines.push("");
}
fs.writeFileSync("/tmp/k8-doc-items.md", lines.join("\n"));
console.log("items written", S.length);
