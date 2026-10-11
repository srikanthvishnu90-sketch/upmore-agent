// The chat handler runs the two guards the testing agent forced (evals/agent/run.ts O-15, O-20), in the right places:
// identity digits are removed before anything stores or sends the message, and a model reply that claims a money action
// is corrected before it is stored. Read from the source, like tests/proactive-wiring.test.cjs.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const h = fs.readFileSync(path.join(root, 'supabase/functions/agent-chat/handler.ts'), 'utf8');
const input = fs.readFileSync(path.join(root, 'supabase/functions/agent-chat/_shared/chat_input.ts'), 'utf8');

test('identity digits are redacted inside chatInput, before the text is stored or sent, and the person is told', () => {
  assert.ok(input.includes('const red = redactIdentity(typeof message === "string" ? message.trim() : "");'));
  assert.ok(input.includes('const text = red.text;'));
  assert.ok(h.includes('import { redactionNote } from "../_shared/identity_redact.ts";'));
  const note = h.indexOf('flowCtx.note = redactionNote(input.redacted);'), firstInsert = h.indexOf('.from("agent_messages").insert(');
  assert.ok(note > 0 && note < firstInsert, 'the note is set before the first message is stored');
  assert.ok(h.includes('flowCtx.note = [flowCtx.note, flow.note].filter(Boolean).join(" ") || null;'), 'a dropped-card note keeps the redaction note');
});

test('both model paths run the money-claim guard before the reply is stored', () => {
  assert.ok(h.includes('import { guardMoneyClaim } from "../_shared/claim_guard.ts";'));
  const g = h.indexOf('reply = guardMoneyClaim(reply).reply;'), store = h.indexOf('{ thread_id: tid, role: "assistant", content: reply, meta: { action, violations');
  assert.ok(g > 0 && g < store);
  assert.ok(h.includes('const reply = result.action ? result.reply : guardMoneyClaim(result.reply).reply;'));
});
