// WO-005 acceptance tests (architect-authored; builders make them pass, never edit them).
// Approvals by reply: anything that leaves the person's account runs only after they reply YES to the exact
// card code rendered. The card text is code, not the model; the YES is parsed by code, before the brain runs.
// Contract in docs/architect/work-orders/WO-005-approvals-outreach-tailoring.md. Run: deno test -A --no-check tests/architect/
import { addApprovals, approvalCard, parseApprovalReply, resolveApprovalReply, APPROVAL_TTL_MS } from "../../../supabase/functions/_shared/agent/approvals.ts";
import type { ToolSpec } from "../../../supabase/functions/_shared/agent/loop.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const T0 = Date.UTC(2026, 9, 18, 15);
const ctx = (stores: Record<string, unknown>, now = T0) => ({ userId: "u1", threadId: "t1", now, state: stores });

function sender() {
  const sent: any[] = [];
  const tool: ToolSpec = {
    name: "send_email", effect: "external", description: "Send an email from the user's own account after they approve it.",
    input_schema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject", "body"] },
    run: async (input: any) => { sent.push(input); return { sent: true, id: `m${sent.length}` }; },
  };
  return { tool, sent };
}
const preview = (tool: string, input: any) => `Email to ${input.to}: "${input.subject}"`;
const email = (to: string) => ({ tool: "send_email", input: { to, subject: "Data analyst roles", body: "Hi, ..." }, summary: "Send an email" });

Deno.test("WO-005/A1 pending actions become numbered approvals with a code-rendered card", () => {
  const stores: Record<string, any> = {};
  const list = addApprovals(stores, [email("a@stripe.com"), email("b@ramp.com")], T0, preview);
  eq(list.length, 2);
  eq(stores.approvals.length, 2);
  assert(list.every((a) => a.status === "pending" && a.expires_at === T0 + APPROVAL_TTL_MS && typeof a.hash === "string" && a.hash.length >= 16), "pending, expiring, hashed");
  const card = approvalCard(list);
  assert(card.includes('1. Email to a@stripe.com: "Data analyst roles"') && card.includes('2. Email to b@ramp.com: "Data analyst roles"'), "each action is previewed exactly, numbered");
  assert(/reply yes/i.test(card) && /\bno\b/i.test(card), "says how to approve and how to cancel");
  eq(APPROVAL_TTL_MS, 30 * 60 * 1000, "approvals expire in 30 minutes");
});

Deno.test("WO-005/A2 parseApprovalReply reads yes / no / picks and nothing else", () => {
  eq(parseApprovalReply("yes"), { kind: "yes", picks: null });
  eq(parseApprovalReply("YES"), { kind: "yes", picks: null });
  eq(parseApprovalReply("Yes!"), { kind: "yes", picks: null });
  eq(parseApprovalReply("yep send it"), { kind: "yes", picks: null });
  eq(parseApprovalReply("yes all"), { kind: "yes", picks: "all" });
  eq(parseApprovalReply("yes 1 3"), { kind: "yes", picks: [1, 3] });
  eq(parseApprovalReply("yes 1,2"), { kind: "yes", picks: [1, 2] });
  eq(parseApprovalReply("no"), { kind: "no" });
  eq(parseApprovalReply("cancel"), { kind: "no" });
  eq(parseApprovalReply("don't send it"), { kind: "no" });
  eq(parseApprovalReply("yes but change the subject first"), null, "a yes with a change is not an approval");
  eq(parseApprovalReply("what does it say?"), null);
  eq(parseApprovalReply("find me jobs"), null);
});

Deno.test("WO-005/A3 YES with one pending runs exactly the stored payload, once", async () => {
  const { tool, sent } = sender(), stores: Record<string, any> = {};
  addApprovals(stores, [email("a@stripe.com")], T0, preview);
  const r = await resolveApprovalReply("yes", stores, [tool], ctx(stores, T0 + 60000));
  assert(r && typeof r.reply === "string", "handled");
  eq(sent, [{ to: "a@stripe.com", subject: "Data analyst roles", body: "Hi, ..." }]);
  eq(stores.approvals[0].status, "done");
  assert(/sent/i.test(r!.reply) && r!.reply.includes("a@stripe.com"), "says what was done, to whom");
  const again = await resolveApprovalReply("yes", stores, [tool], ctx(stores, T0 + 70000));
  eq(sent.length, 1, "a second yes never repeats the action");
  assert(again === null || /nothing (is )?waiting|no pending/i.test(again.reply), "nothing is waiting");
});

Deno.test("WO-005/A4 with several pending, a bare YES asks which; YES ALL and YES 1 3 run exactly those", async () => {
  const { tool, sent } = sender(), stores: Record<string, any> = {};
  addApprovals(stores, [email("a@x.com"), email("b@x.com"), email("c@x.com")], T0, preview);
  const ask = await resolveApprovalReply("yes", stores, [tool], ctx(stores, T0 + 1000));
  eq(sent.length, 0, "nothing runs on an ambiguous yes");
  assert(ask && /yes all/i.test(ask.reply) && /yes 1/i.test(ask.reply), "asks for YES ALL or numbers");
  await resolveApprovalReply("yes 1 3", stores, [tool], ctx(stores, T0 + 2000));
  eq(sent.map((s) => s.to), ["a@x.com", "c@x.com"]);
  eq(stores.approvals.map((a: any) => a.status), ["done", "pending", "done"]);
  await resolveApprovalReply("yes all", stores, [tool], ctx(stores, T0 + 3000));
  eq(sent.map((s) => s.to), ["a@x.com", "c@x.com", "b@x.com"]);
});

Deno.test("WO-005/A5 NO cancels every pending approval; nothing runs", async () => {
  const { tool, sent } = sender(), stores: Record<string, any> = {};
  addApprovals(stores, [email("a@x.com"), email("b@x.com")], T0, preview);
  const r = await resolveApprovalReply("no", stores, [tool], ctx(stores, T0 + 1000));
  eq(sent, []);
  eq(stores.approvals.map((a: any) => a.status), ["declined", "declined"]);
  assert(r && /nothing (was )?sent|cancel/i.test(r.reply), "says it is cancelled");
});

Deno.test("WO-005/A6 an expired approval never runs, even on YES", async () => {
  const { tool, sent } = sender(), stores: Record<string, any> = {};
  addApprovals(stores, [email("a@x.com")], T0, preview);
  const r = await resolveApprovalReply("yes", stores, [tool], ctx(stores, T0 + APPROVAL_TTL_MS + 1));
  eq(sent, []);
  eq(stores.approvals[0].status, "expired");
  assert(r && /expired/i.test(r.reply), "says it expired");
});

Deno.test("WO-005/A7 a payload changed after the card was shown is refused (hash check)", async () => {
  const { tool, sent } = sender(), stores: Record<string, any> = {};
  addApprovals(stores, [email("a@x.com")], T0, preview);
  stores.approvals[0].input.to = "attacker@evil.com";
  const r = await resolveApprovalReply("yes", stores, [tool], ctx(stores, T0 + 1000));
  eq(sent, []);
  eq(stores.approvals[0].status, "failed");
  assert(r && /changed|not (sent|run)/i.test(r.reply), "says it was not run");
});

Deno.test("WO-005/A8 a tool failure on YES is said plainly and marked failed, never claimed done", async () => {
  const stores: Record<string, any> = {};
  const failing: ToolSpec = { name: "send_email", effect: "external", description: "Send an email from the user's own account after they approve it.", input_schema: { type: "object", properties: {}, required: [] }, run: async () => { throw new Error("gmail 401"); } };
  addApprovals(stores, [email("a@x.com")], T0, preview);
  const r = await resolveApprovalReply("yes", stores, [failing], ctx(stores, T0 + 1000));
  eq(stores.approvals[0].status, "failed");
  assert(r && /couldn't|could not|failed/i.test(r.reply), "says it failed");
  assert(!/\b(has been sent|was sent to|sent it|done)\b/i.test(r!.reply), "never claims it was sent");
});

Deno.test("WO-005/A9 with nothing pending, an approval-looking reply is not handled here", async () => {
  const { tool } = sender();
  eq(await resolveApprovalReply("yes", {}, [tool], ctx({})), null, "the brain answers a stray yes");
  eq(await resolveApprovalReply("find me jobs", {}, [tool], ctx({})), null);
});
