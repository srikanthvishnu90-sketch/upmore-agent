// K13 vault & documents through the production chat wrapper (agent-chat/_shared/vault_docs_answer.ts over the
// router bundle's VaultDocs): breach lockdown (C142), the gated vault (C153), the CPA tax folder (C155), the
// mileage log (C157), the charitable roundup (C158) and document organization (C203). All facts are STAND-IN
// watches (the settings-row store the handler reads) plus stand-in transaction rows; the replies asserted here
// verbatim are the ones saved as conversation proof under upmore-conversations/. Figures were computed by hand
// first (Muse parity): mileage 113.95mi / $86.26, confirmed 141.40mi / $107.12; donations $365.00.
// Check: deno test -A --no-check tests/edge/vault-docs.test.ts
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { vaultDocsReply, vaultDocsKind } from "../../supabase/functions/agent-chat/_shared/vault_docs_answer.ts";
import { VaultDocs } from "../../supabase/functions/_shared/router_core.js";

const NOW = new Date("2026-10-12T15:00:00Z");
const sha = (s: string) => (VaultDocs as any).sha256(s);
const W = (kind: string, o: any) => ({ kind, status: "active", ...o });
export const WATCHES: any[] = [
  W("breach_record", { service: "Ticketmaster", disclosed_on: "2024-07-12", source: "stand-in breach record", exposed: ["names", "email addresses", "payment card details"] }),
  W("credential_account", { service: "Ticketmaster", payment_card_on_file: true, card_issuer: "Chase" }),
  W("credential_account", { service: "Gmail", reuses_breached_password: true }),
  W("credential_account", { service: "Dropbox", reuses_breached_password: true }),
  W("credential_account", { service: "Chase", reuses_breached_password: false }),
  W("agent_session", { device: "iPhone", location: "Chicago, IL", current: true }),
  W("agent_session", { device: "Chrome on Windows", location: "Lisbon, PT" }),
  W("agent_session", { device: "Safari on Mac", location: "Chicago, IL" }),
  W("vault_gate", { answer_hash: (VaultDocs as any).hashAnswer("Springfield") }),
  W("vault_doc", { id: "doc-passport", doc_kind: "id_document", title: "Passport", issuer: "U.S. Department of State", expires_on: "2031-05-14", location: "vault://docs/passport", sha256: sha("stand-in passport bytes") }),
  W("vault_doc", { id: "doc-ssn", doc_kind: "id_document", title: "Social Security card", location: "vault://docs/ssn-card", sha256: sha("stand-in ssn card bytes") }),
  W("vault_doc", { id: "doc-auto", doc_kind: "policy", subkind: "auto", title: "Auto policy", issuer: "Mock Mutual", location: "vault://docs/auto-policy", sha256: sha("stand-in auto policy bytes") }),
  ...[["W-2", "Mock Corp", "w2"], ["1099-INT", "Mock Bank", "int"], ["1099-DIV", "Mock Broker", "div"]].map(([form, issuer, s], i) =>
    W("vault_doc", { id: `t${i + 1}`, doc_kind: "tax_form", subkind: form, issuer, year: 2025, location: `vault://tax/${s}`, sha256: sha(s as string) })),
  ...[["W-2", "Mock Corp"], ["1099-INT", "Mock Bank"], ["1099-DIV", "Mock Broker"], ["1099-B", "Mock Broker"], ["1098", "Mock Mortgage"], ["1098-T", "Mock University"]].map(([form, issuer]) =>
    W("tax_expectation", { form, issuer })),
  ...[
    ["tr1", "2026-01-20", "Office", "Client site", 10.0, "client kickoff", "business", true, false],
    ["tr2", "2026-09-03", "Home", "Client site", 42.6, "client meeting", "business", true, false],
    ["tr3", "2026-09-04", "Home", "Office", 12.3, "work", "business", true, true],
    ["tr4", "2026-09-10", "Office", "Supplier warehouse", 18.75, "pick up equipment", "business", true, false],
    ["tr5", "2026-09-12", "Home", "Grocery", 6.2, "shopping", "personal", true, false],
    ["tr6", "2026-09-18", "Client site", "Home", 42.6, "return from client meeting", "business", true, false],
    ["tr7", "2026-09-25", "Home", "Airport", 27.45, "flight to client conference", "business", false, false],
  ].map(([id, on, from, to, miles, purpose, kind, confirmed, commute]) =>
    W("trip", { id, on, from, to, miles, purpose, trip_kind: kind, confirmed, commute })),
  W("charity", { name: "red cross" }), W("charity", { name: "food bank" }), W("charity", { name: "wikimedia" }),
  W("donation_receipt", { org: "American Red Cross", amount_cents: 30000, on: "2026-03-02" }),
  W("donation_receipt", { org: "Mock Food Bank", amount_cents: 4000, on: "2026-05-01" }),
  W("organize_file", { name: "statement_march.pdf", sha256: sha("march statement"), doc_kind: "statement", issuer: "Mock Bank", on: "2026-03" }),
  W("organize_file", { name: "auto policy scan.pdf", sha256: sha("auto policy"), doc_kind: "policy", subkind: "auto", issuer: "Mock Mutual", on: "2026" }),
  W("organize_file", { name: "IMG_4021.pdf", sha256: sha("auto policy"), doc_kind: "policy", subkind: "auto", issuer: "Mock Mutual", on: "2026" }),
  W("organize_file", { name: "car title.pdf", sha256: sha("vehicle title"), doc_kind: "title", on: "2026" }),
  W("organize_file", { name: "final_FINAL statement (1).pdf", sha256: sha("march statement"), doc_kind: "statement", issuer: "Mock Bank", on: "2026-03" }),
];
export const TX: any[] = [
  { id: "g0", posted_on: "2026-03-01", amount_cents: -30000, merchant_raw: "AMERICAN RED CROSS", is_pending: true },
  { id: "g1", posted_on: "2026-03-02", amount_cents: -30000, merchant_raw: "AMERICAN RED CROSS", is_pending: false },
  { id: "g2", posted_on: "2026-05-01", amount_cents: -4000, merchant_raw: "MOCK FOOD BANK", is_pending: false },
  { id: "g3", posted_on: "2026-06-15", amount_cents: -2500, merchant_raw: "WIKIMEDIA FOUNDATION", is_pending: false },
  { id: "g4", posted_on: "2026-07-01", amount_cents: -5000, merchant_raw: "RED CROSS FRANCE", currency: "EUR", is_pending: false },
];
// A conversation: each turn's previous is the thread so far, newest first, as the handler's readPrevious returns.
export async function converse(turns: string[], watches: any[] = WATCHES): Promise<string[]> {
  const thread: any[] = [];
  const out: string[] = [];
  for (const m of turns) {
    const r = await vaultDocsReply(m, NOW, { watches: () => watches, transactions: async () => TX, previous: async () => [...thread].reverse(), taxYear: 2025 }, { tz: "America/Chicago" });
    out.push(r as string);
    thread.push({ role: "user", content: m }, { role: "assistant", content: r });
  }
  return out;
}

Deno.test("C142 conversation: the card, then 'do it' runs the in-product lockdown", async () => {
  const [card, run] = await converse(["My email was in the Ticketmaster breach. Handle it.", "do it"]);
  assertMatch(card, /^Breach lockdown for Ticketmaster \(stand-in breach record, disclosed 2024-07-12\)/);
  assertMatch(card, /Gmail \(reuses the breached password\)/);
  assertMatch(run, /^Lockdown run for Ticketmaster:/);
  assertMatch(run, /Sessions revoked: Chrome on Windows in Lisbon, PT; Safari on Mac in Chicago, IL\./);
  assertMatch(run, /Nothing was ordered\./);
  assertMatch(run, /No password, code or card number was stored or shown/);
});

Deno.test("C153 conversation: challenge, wrong answer leaks nothing, right answer returns the reference and logs it", async () => {
  const [ch, bad] = await converse(["show my passport", "Chicago"]);
  assertMatch(ch, /verification question — in what city were you born\?/);
  assertMatch(bad, /^That's not the answer on file/);
  assert(!bad.includes("vault://"), bad);
  const [, good] = await converse(["show my passport", "Springfield"]);
  assertMatch(good, /vault:\/\/docs\/passport \(U\.S\. Department of State, expires 2031-05-14, stored with its hash\)/);
  assertMatch(good, /This access was logged\./);
});

Deno.test("C155 conversation: 3 of 6 with the exact gaps, then the CPA packet (prepared, never sent)", async () => {
  const [folder, packet] = await converse(["Round up everything my CPA needs.", "send it to my CPA"]);
  assertMatch(folder, /Your 2025 tax folder: 3 of 6 forms are in\./);
  assertMatch(folder, /2025-W-2-mock-corp\.pdf/);
  assertMatch(folder, /1099-B from Mock Broker \(broker portal → Tax Documents\)/);
  assertMatch(folder, /Portal retrieval is NOT_WIRED/);
  assertMatch(packet, /^Tax folder packet prepared for 2025: 3 forms/);
  assertMatch(packet, /so nothing was sent\./);
});

Deno.test("C157 conversation: $86.26 / 113.95mi, the commute out, then the airport confirmation lands at $107.12 / 141.40mi", async () => {
  const [log, added] = await converse(["Build my business mileage log.", "the airport trip was business"]);
  assertMatch(log, /Counted: 4 business trips, 113\.95 miles\. Deduction \$86\.26/);
  assertMatch(log, /Home → Office, 12\.30 mi — a commute/);
  // (The reply itself carries no stand-in label: through the production wrapper the watches are the person's
  // own facts. The stand-in flag lives in the conversation proof doc, whose fixtures these are.)
  assertMatch(added, /^Added\. /);
  assertMatch(added, /Counted: 5 business trips, 141\.40 miles\. Deduction \$107\.12/);
});

Deno.test("C158 conversation: $365.00, receipts filed for 2, the pending hold counted once, the EUR gift not added", async () => {
  const [r] = await converse(["Get my donation receipts ready for taxes."]);
  assertMatch(r, /\$365\.00 across 3 gifts\. Receipts filed in the tax folder for 2:/);
  assertMatch(r, /AMERICAN RED CROSS \$300\.00 on 2026-03-02 \(written acknowledgment filed/);
  assertMatch(r, /WIKIMEDIA FOUNDATION \$25\.00 on 2026-06-15/);
  assertMatch(r, /counted once/);
  assertMatch(r, /not added in/);
});

Deno.test("C203 conversation: organized with dedupe and gaps, then find-by-name", async () => {
  const [org, find] = await converse(["Organize my financial documents", "find my auto policy"]);
  assertMatch(org, /5 files in, 3 filed under new names, 2 duplicates removed\./);
  assertMatch(org, /IMG_4021\.pdf = policies\/2026-mock-mutual-auto-policy\.pdf/);
  assertMatch(org, /health policy \(where it lives: your insurer's portal\)/);
  assertMatch(find, /^Your auto policy: policies\/2026-mock-mutual-auto-policy\.pdf in the vault/);
});

Deno.test("no facts on file: every item answers its honest NOT_WIRED / no-facts line, and unrelated asks return null", async () => {
  const none: any[] = [];
  assertMatch((await converse(["My email was in the Ticketmaster breach. Handle it."], none))[0], /^Breach data is NOT_WIRED/);
  assertMatch((await converse(["Build my business mileage log."], none))[0], /Location history is NOT_WIRED/);
  assertMatch((await converse(["Round up everything my CPA needs."], none))[0], /no tax facts on file/);
  assertMatch((await converse(["Get my donation receipts ready for taxes."], none))[0], /don't have your charities named/);
  assertMatch((await converse(["Organize my financial documents"], none))[0], /no documents in the vault to organize yet/);
  assertEquals(await vaultDocsReply("what's the weather", NOW, { watches: () => WATCHES, transactions: async () => TX, previous: async () => [] }), null);
  assertEquals(vaultDocsKind("how much did i spend on groceries"), null);
});

Deno.test("secrets discipline: a watch carrying a password value gets the refusal line, never the value", async () => {
  const bad = [...WATCHES, W("credential_account", { service: "Bad", password: "hunter2-value" })];
  const r = (await converse(["My email was in the Ticketmaster breach. Handle it."], bad))[0];
  assertMatch(r, /^I can't run that: a stored fact for it carries a secret value/);
  assert(!r.includes("hunter2"), r);
});
