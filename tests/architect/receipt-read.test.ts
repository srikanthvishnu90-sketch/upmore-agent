// FEATURE 14 (D-024, G6): the receipt reader's asks and words, and the worker's two receipt helpers, without a database.
// The end-to-end proof (real Postgres, real browser, the production handler) is tests/architect/flow-receipt.test.ts.
import assertNode from "node:assert/strict";
import { receiptAsk, type ReceiptReader, type ReceiptRow, receiptText, receiptTurn } from "../../supabase/functions/_shared/career_apply_receipt_read.ts";
import { standingFrom } from "../../supabase/functions/_shared/career_standing.ts";
import { attachProof, confirmationText, runApproved } from "../../workers/career-browser/approve-first.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const NOW = Date.parse("2026-10-25T12:00:00Z");
const H = (c: string) => c.repeat(64);

const row = (o: Partial<ReceiptRow> = {}): ReceiptRow => ({
  application_id: "00000000-0000-4000-8000-0000000014aa", company: "Stripe", url: "https://boards.greenhouse.io/stripe/jobs/1", final_url: "https://boards.greenhouse.io/stripe/jobs/1/confirmation",
  state: "submitted_unconfirmed", reached_employer: "yes", reason: null,
  answers: [{ name: "first_name", label: "First name", answer: "Rae", fact_id: "F-001", provenance: "owner stated" }, { name: "sponsor", label: "Will you need sponsorship?", answer: "No", fact_id: "text-answer:sponsor", source: { table: "career_apply_questions", key: "sponsor" } }],
  resume_sha256: H("c"), payload_hash: H("a"), approval_hash: H("a"), engine_approval: H("e"),
  approved_at: "2026-10-25T10:00:00Z", clicked_at: "2026-10-25T10:05:00Z", finished_at: "2026-10-25T10:05:09Z",
  confirmation_id: "GH-123", confirmation_text: "Thank you for applying. Your confirmation is GH-123.",
  proof: { run_id: "r", before_click: { sha256: H("1") }, after_submit: { sha256: H("2") } }, pictures_keep_until: "2027-01-23T10:05:09Z", ...o,
});
const reader = (rows: ReceiptRow[], pics = [{ kind: "before-click" as const, sha256: H("1"), bytes_b64: "AA==" }, { kind: "after-submit" as const, sha256: H("2"), bytes_b64: "AQ==" }]): ReceiptReader & { asked: string[] } => {
  const asked: string[] = [];
  return { asked, list: async (u) => { asked.push(u); return rows; }, pictures: async () => pics };
};

Deno.test("receipt asks: the phrasings a person types, and what is not one", () => {
  for (const [m, c] of [
    ["show me the receipt for Stripe", "Stripe"], ["Show me the receipt for Stripe?", "Stripe"], ["receipt for my Stripe application", "Stripe"],
    ["can I see the proof for my Acme Corp application", "Acme Corp"], ["what did you send to Acme?", "Acme"], ["What did you send Acme", "Acme"],
    ["what did Trainee send to Acme", "Acme"], ["what answers did you send to Acme", "Acme"], ["what did you submit to Acme Corp exactly", "Acme Corp"],
    ["send me the screenshots for Stripe", "Stripe"], ["Stripe receipt", "Stripe"], ["what was sent to Globex", "Globex"],
    ["what did my application to Hooli say", "Hooli"], ["please show me the receipt for the Stripe application", "Stripe"],
  ] as const) eq(receiptAsk(m), { company: c }, m);
  for (const m of ["show me my receipts", "my receipts", "receipts"]) eq(receiptAsk(m), { company: null }, m);
  for (const m of ["what did you send me", "what did you send them", "where are my applications", "did my application to Acme go through",
    "send the email to Acme", "apply to Stripe", "show me the receipt", "can I get a receipt", "what did Acme say", "who emailed me"]) eq(receiptAsk(m), null, m);
});

Deno.test("receipt words: what was sent with each answer's source, where, when, the hashes, the employer's words, the pictures", () => {
  const t = receiptText(row(), [{ kind: "before-click", sha256: H("1"), bytes_b64: "" }, { kind: "after-submit", sha256: H("2"), bytes_b64: "" }], NOW);
  for (const w of [/^Receipt for your application to Stripe: Stripe: submitted on Oct 25; Stripe has not confirmed it yet \(their page showed GH-123\)\./,
    /Where: https:\/\/boards\.greenhouse\.io\/stripe\/jobs\/1 \(the page after Submit: .*\/confirmation\)/, /When: approved Oct 25, 10:00 AM UTC; Submit clicked Oct 25, 10:05 AM UTC; recorded Oct 25, 10:05 AM UTC\./,
    /What was sent:\n- First name: Rae \(from fact F-001, owner stated\)\n- Will you need sponsorship\?: No \(from your answer in chat\)/, /Resume: the file with sha256 cccccccccccc…/,
    /Stripe's confirmation: GH-123\./, /What their page said after Submit: "Thank you for applying\. Your confirmation is GH-123\."/,
    /Approval: payload aaaaaaaaaaaa…, approval eeeeeeeeeeee…/, /Pictures attached: the page just before Submit was clicked and the page after it\. They are kept until Jan 23, 2027\./]) ok(w.test(t), `${w}\n${t}`);
  // Not sent: what was approved, said as not sent, no picture line.
  const no = receiptText(row({ state: "not_submitted", reached_employer: "no", reason: "the application changed after it was approved", clicked_at: null, confirmation_id: null, confirmation_text: null, proof: {} }), [], NOW);
  ok(/: not sent \(the application changed after it was approved\)\./.test(no) && /What you approved \(not sent\):/.test(no) && !/Pictures|Submit clicked|No pictures/.test(no), no);
  const unk = receiptText(row({ state: "unknown_outcome", reached_employer: "unknown", proof: { refused: "PROOF_NOT_THIS_APPLICATION" } }), [], NOW);
  ok(/I can't tell whether it reached Stripe/.test(unk) && /whether it arrived is unknown/.test(unk) && /No pictures: the proof that run returned was not this application's/.test(unk), unk);
  const gone = receiptText(row({ pictures_keep_until: "2026-10-01T00:00:00Z" }), [], NOW);
  ok(/The pictures were kept until Oct 1, 2026 and have been removed\./.test(gone), gone);
});

Deno.test("receipt turn: the person's own rows only, by company; the pictures as documents; unreadable said, never guessed", async () => {
  const r = reader([row(), row({ application_id: "x2", finished_at: "2026-10-20T00:00:00Z" }), row({ application_id: "x3", company: "Acme" })]);
  const t = await receiptTurn({ message: "show me the receipt for stripe", userId: "U1", now: NOW, read: r });
  eq(r.asked, ["U1"], "read as the person who asked");
  eq(t?.intent, "career_apply_receipt");
  eq(t?.result?.documents.map((d) => [d.filename, d.mime, d.sha256]), [["receipt-stripe-before-click.png", "image/png", H("1")], ["receipt-stripe-after-submit.png", "image/png", H("2")]]);
  ok(/1 earlier application to Stripe has a receipt too\./.test(t!.reply), t!.reply);
  const none = await receiptTurn({ message: "what did you send to Globex", userId: "U1", now: NOW, read: reader([row()]) });
  eq(none?.reply, "No receipt for Globex is on record: Trainee has not finished an application to Globex for you. Receipts on record: Stripe.");
  eq(none?.result, undefined);
  const empty = await receiptTurn({ message: "show me my receipts", userId: "U2", now: NOW, read: reader([]) });
  eq(empty?.status, "none");
  const bad = await receiptTurn({ message: "show me the receipt for Stripe", userId: "U1", now: NOW, read: { list: () => Promise.reject(new Error("down")), pictures: async () => [] } });
  eq(bad?.status, "unreadable");
  ok(!/Stripe:/.test(bad!.reply), bad!.reply);
  const noPics = await receiptTurn({ message: "show me the receipt for Stripe", userId: "U1", now: NOW, read: { list: async () => [row()], pictures: () => Promise.reject(new Error("down")) } });
  ok(/The pictures could not be read just now/.test(noPics!.reply) && !/Pictures attached/.test(noPics!.reply) && !noPics!.result, noPics!.reply);
  eq(await receiptTurn({ message: "where are my applications", userId: "U1", now: NOW, read: r }), null);
  eq(r.asked.length, 1, "a text that is not a receipt ask reads nothing");
});

Deno.test("status links to the receipt only when one is on record", () => {
  const s = standingFrom({ jobs: [], mail: [], tracker: [], drafts: [], receipts: ["Stripe"], unreadable: [] }, NOW);
  eq(s.receipts, ["Stripe"]);
  eq(standingFrom({ jobs: [], mail: [], tracker: [], drafts: [], unreadable: [] }, NOW).receipts, []);
});

Deno.test("worker: only the proof's own pictures go up; a file that is not the named picture stays; the page text only when it may have been sent", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const a = new Uint8Array([137, 80, 78, 71, 1]), b = new Uint8Array([137, 80, 78, 71, 2]);
    await Deno.writeFile(`${dir}/proof-1-before-click.png`, a);
    await Deno.writeFile(`${dir}/proof-3-after-submit.png`, b);
    const hex = async (x: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", x as BufferSource))].map((n) => n.toString(16).padStart(2, "0")).join("");
    const sent: unknown[] = [];
    const job = { id: "J", lease_token: "L", url: "u", payload: {} };
    const attach = async (_j: unknown, kind: string, sha: string, b64: string) => { sent.push([kind, sha, b64]); };
    const got = await attachProof(job, { before_click: { file: "proof-1-before-click.png", sha256: await hex(a) }, after_submit: { file: "proof-3-after-submit.png", sha256: H("0") } }, dir, attach);
    eq(got, ["before-click"], "the after file is not the picture the proof names: not sent");
    eq(sent, [["before-click", await hex(a), btoa(String.fromCharCode(...a))]]);
    eq(await attachProof(job, { before_click: { file: "../proof-1-before-click.png", sha256: await hex(a) } }, dir, attach), [], "a path outside the folder is never read");
    eq(await attachProof(job, { before_click: { file: "proof-1-before-click.png", sha256: await hex(a) } }, dir, () => Promise.reject(new Error("down"))), [], "a failed upload is logged, not thrown");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
  eq(confirmationText("submitted_unconfirmed", { observation: { page_text: "  Thank you\n for applying " } }), "Thank you for applying");
  eq(confirmationText("not_submitted", { observation: { page_text: "Please fix the errors" } }), null);
  eq(confirmationText("unknown_outcome", null), null);
});

Deno.test("worker: runApproved sends the pictures only for a bound proof, before the finish; an unbound one sends none", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const png = new Uint8Array([137, 80, 78, 71, 9]);
    await Deno.writeFile(`${dir}/proof-1-before-click.png`, png);
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", png))].map((n) => n.toString(16).padStart(2, "0")).join("");
    for (const appId of ["J1", "SOMEONE-ELSE"]) {
      const order: string[] = [];
      const job = { id: "J1", lease_token: "L", url: "https://x.test/a", payload: { user_id: "U", fields: [], engine_approval: H("e"), resume_sha256: H("c") } };
      await runApproved({
        claim: async () => [job],
        finish: async (_id, _l, state, ev) => { order.push(`finish:${state}:${(ev as any).reason ?? ""}`); ok(!JSON.stringify(ev).includes("Received"), "the page text never rides the row"); },
        attach: async (_j, kind) => { order.push(`attach:${kind}`); },
        resumeFor: async () => ({ path: "/r", sha256: H("c") }),
        writeFacts: async () => "/f",
        runEngine: async () => ({ result: { state: "submitted_unconfirmed", evidence_path: dir, proof: { application_id: appId, approval_hash: H("e"), run_id: "r", before_click: { file: "proof-1-before-click.png", sha256: sha } } }, evidence: { observation: { page_text: "Received" } } }),
      });
      eq(order, appId === "J1" ? ["attach:before-click", "attach:page-text", "finish:submitted_unconfirmed:"] : ["finish:submitted_unconfirmed:"], appId);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
