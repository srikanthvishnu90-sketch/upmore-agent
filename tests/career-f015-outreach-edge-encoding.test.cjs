"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sourcePath = path.resolve(__dirname, "../packages/domain/124-career-outreach.js");
const source = fs.readFileSync(sourcePath, "utf8");

function edge() {
  const context = vm.createContext({ module: { exports: {} }, Buffer: undefined, TextEncoder, btoa });
  vm.runInContext(source, context, { filename: sourcePath });
  return context.module.exports;
}
function expected(message) {
  const raw = [`To: ${message.to}`, `Subject: ${message.subject}`, "Content-Type: text/plain; charset=UTF-8", "", message.body].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}
const payloads = [
  ["ASCII", { to: "fixture@example.test", subject: "Synthetic draft", body: "A draft only.\nNo message is sent." }],
  ["Unicode", { to: "fixture@example.test", subject: "Résumé — 合成", body: "Zoë studies 中文. Synthetic example 🚀." }],
  ["unpaired surrogate", { to: "fixture@example.test", subject: "Synthetic", body: "left\ud800right\udfff" }],
  ["large UTF-8 body", { to: "fixture@example.test", subject: "Synthetic", body: "é🚀".repeat(65_536) }],
];
for (const [label, payload] of payloads) {
  test(`F015: ${label} has byte-identical URL-safe encoding without a Node Buffer global`, () => {
    const encoded = edge().buildGmailRaw(payload);
    assert.equal(encoded, expected(payload));
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  });
}
test("F015: actual Edge-shaped global has no Buffer binding at all", () => {
  const context = vm.createContext({ module: { exports: {} }, TextEncoder, btoa });
  assert.equal("Buffer" in context, false);
  vm.runInContext(source, context, { filename: sourcePath });
  assert.equal(context.module.exports.buildGmailRaw(payloads[1][1]), expected(payloads[1][1]));
});
test("F015 control: the Node caller preserves the existing raw message bytes", () => {
  const outreach = require(sourcePath);
  assert.equal(outreach.buildGmailRaw(payloads[1][1]), expected(payloads[1][1]));
});
test("F015 control: a valid Gmail client remains hard-disabled and never receives a message", async () => {
  let sends = 0;
  const transport = edge().createGmailTransport({ users: { messages: { send: async () => { sends++; } } } });
  const result = await transport.send(payloads[0][1]);
  assert.equal(result.refused, true);
  assert.match(result.error, /^SEND_DISABLED:/);
  assert.equal(sends, 0);
});
test("F015 control: approved queue still refuses transmission and preserves the pending item", async () => {
  let sends = 0;
  const campaign = { userId: "synthetic-owner", status: "approved", breaker: { tripped: false }, items: [{ id: "synthetic-item", status: "queued" }] };
  const before = JSON.stringify(campaign);
  const result = await edge().sendPending(campaign, { transport: { send: async () => { sends++; } } });
  assert.equal(result.sent, 0);
  assert.match(result.error, /^SEND_DISABLED:/);
  assert.equal(sends, 0);
  assert.equal(JSON.stringify(campaign), before);
});
