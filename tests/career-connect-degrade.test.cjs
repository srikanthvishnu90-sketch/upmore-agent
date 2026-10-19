/* WO-027: no feature hard-fails on a missing integration. The chat's one-line ask for an email it cannot see
   (supabase/functions/_shared/agent/integrations.ts, loaded by Deno) is the owner's connect card for Gmail exactly:
   ConnectCards.message("gmail", { lead }) from packages/domain/76-connect-cards.js, one short line, then the link alone
   on its own line. ConnectCards is in the finance bundle, not the career bundle, so the career path carries its own copy;
   this test keeps the two the same. Check: node --test tests/career-connect-degrade.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const ConnectCards = require(path.join(ROOT, "packages/domain/76-connect-cards.js"));
const load = () => import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/agent/integrations.ts")).href);

test("email not connected: the Gmail connect card's two bubbles, byte for byte", async () => {
  const m = await load();
  assert.equal(m.CONNECT_BASE, ConnectCards.DEFAULT_BASE, "the same app");
  assert.equal(m.connectUrl("gmail"), ConnectCards.url("gmail"), "the same link");
  assert.equal(m.connectUrl("gmail", "https://preview.example.test/"), ConnectCards.url("gmail", "https://preview.example.test/"));
  assert.equal(m.missingIntegration("email"), ConnectCards.message("gmail", { lead: m.EMAIL_LEAD }));
  assert.equal(m.missingIntegration("gmail"), ConnectCards.message("gmail", { lead: m.EMAIL_LEAD }));
  assert.equal(ConnectCards.parse(m.missingIntegration("email").split("\n\n")[1]), "gmail", "the second bubble is exactly a connect link");
  const [lead, link, ...rest] = m.missingIntegration("email").split("\n\n");
  assert.equal(rest.length, 0);
  assert.ok(lead.length <= 100 && !lead.includes("\n") && /here's the link\.$/.test(lead), "one short line ending in the link's lead-in");
  assert.ok(/forward/i.test(lead), "it asks for the email to be forwarded");
  assert.ok(!/[*_#`]/.test(lead), "plain words, no markdown");
  assert.equal(link, "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/gmail");
});

test("LinkedIn and anything else: one plain line, never a card for a provider without a real logo, never an error", async () => {
  const m = await load();
  assert.equal(ConnectCards.PROVIDERS.linkedin, undefined, "no LinkedIn card exists, so none is drawn");
  const li = m.missingIntegration("linkedin");
  assert.ok(!li.includes("\n") && !/https?:\/\//.test(li), "plain words");
  assert.match(li, /public information/);
  assert.equal((li.match(/\?/g) || []).length + (/Paste/.test(li) ? 1 : 0), 1, "one ask");
  for (const k of ["calendar", "Handshake", "", null]) {
    const line = m.missingIntegration(k);
    assert.ok(typeof line === "string" && line.length > 10 && !line.includes("\n"), String(k));
  }
});
