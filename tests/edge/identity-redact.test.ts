// Identity digits never reach storage or a model (owner rule; testing agent O-20).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { redactIdentity, redactionNote } from "../../supabase/functions/_shared/identity_redact.ts";
import { chatInput } from "../../supabase/functions/agent-chat/_shared/chat_input.ts";

// Test-only digits, assembled at run time so no identity-shaped literal sits in the repo (the dataset privacy sweep).
const SSN = ["123", "45", "6789"].join("-"), SSN9 = SSN.replace(/-/g, ""), CARD = ["4111", "1111", "1111", "1111"].join(" ");

Deno.test("SSNs, card numbers and labeled account numbers are removed", () => {
  assertEquals(redactIdentity(`my ssn is ${SSN}, send mike 40`), { text: "my ssn is [SSN removed], send mike 40", removed: ["ssn"] });
  assertEquals(redactIdentity(`ssn ${SSN9}`).text, "ssn [SSN removed]");
  assertEquals(redactIdentity(`social security number: ${SSN9}`).removed, ["ssn"]);
  assertEquals(redactIdentity(`card ${CARD} exp 09/29`), { text: "card [card number removed] exp 09/29", removed: ["card"] });
  assertEquals(redactIdentity("routing number 021000021 account 123456789").removed, ["account"]);
  assert(!/\d{6}/.test(redactIdentity("routing number 021000021 account 123456789").text));
});

Deno.test("phone numbers, dates, amounts, codes and order references are left alone", () => {
  for (const t of ["call me 312-555-0199", "send mike 40 on 2026-10-14", "send mike $1,250.00", "482913", "my order 1234567890123", `order #${CARD.replace(/ /g, "")}`, "zip 60614"]) assertEquals(redactIdentity(t), { text: t, removed: [] }, t);
});

Deno.test("the chat input carries only the redacted text, and the person is told", () => {
  const i: any = chatInput(`my ssn is ${SSN}, send mike 40`, undefined, 4000);
  assert(i.ok);
  assert(!i.message.includes("6789") && !i.userContent.includes("6789"));
  assertEquals(i.redacted, ["ssn"]);
  assertEquals(redactionNote(i.redacted), "(I removed the Social Security number from your message and didn't keep it. Upmore never needs it here.)");
  assertEquals(redactionNote([]), null);
  assertEquals(redactionNote(["ssn", "card"]), "(I removed the Social Security number and card number from your message and didn't keep it. Upmore never needs it here.)");
});

Deno.test("the handler sets the note from the redaction and keeps it when a card is dropped", () => {
  const h = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
  assert(h.includes("flowCtx.note = redactionNote(input.redacted);"));
  assert(h.includes("flowCtx.note = [flowCtx.note, flow.note].filter(Boolean).join(\" \") || null;"));
});
