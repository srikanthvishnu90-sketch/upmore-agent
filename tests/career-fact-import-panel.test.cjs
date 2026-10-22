"use strict";
// Original synthetic panel-import cases. Actual Chromium DOM and panel code; chrome messaging is an in-memory fixture.
// UPMORE_PLAYWRIGHT_PATH / UPMORE_EXTENSION_CHROMIUM_PATH select installed tools; this test downloads nothing.
// Always requires chromiumSandbox:true. Missing runtime/sandbox is NOT_RUN locally and a hard failure in CI.
const { test: nodeTest, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm"), { webcrypto } = require("node:crypto");
const ROOT = path.join(__dirname, "..");
let pw, browser, browserBlocked;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try { pw = require(id); break; } catch { /* use the next installed tool */ }
}
before(async () => {
  try {
    assert.ok(pw, "Playwright is required; set UPMORE_PLAYWRIGHT_PATH. No browser was downloaded.");
    const executablePath = process.env.UPMORE_EXTENSION_CHROMIUM_PATH || process.env.UPMORE_CHROMIUM_PATH || [pw.chromium.executablePath(), "/usr/bin/chromium", "/opt/pw-browsers/chromium"].find(p => p && fs.existsSync(p));
    assert.ok(executablePath && fs.existsSync(executablePath), "An installed Chromium is required; no browser was downloaded.");
    browser = await pw.chromium.launch({ executablePath, headless: true, chromiumSandbox: true, timeout: 15000,
      args: ["--disable-background-networking", "--disable-component-update", "--host-resolver-rules=MAP * ~NOTFOUND"] });
  } catch (e) {
    browserBlocked = String(e.message).split("\n").find(line => /FATAL:|sandbox|Playwright is required|installed Chromium is required/i.test(line)) || String(e.message).split("\n")[0];
  }
});
after(async () => { await browser?.close(); });
function test(name, fn) {
  return nodeTest(name, async t => {
    if (browserBlocked) {
      const reason = "NOT_RUN: strict sandbox browser unavailable: " + browserBlocked;
      if (process.env.CI) assert.fail("CI cannot skip fact-import browser verification. " + reason);
      t.skip(reason); return;
    }
    await fn(t);
  });
}
const source = () => ({ user_id: "SYNTHETIC-IMPORT-OWNER", answers: {
  first_name: { value: "SYNTHETIC-GIVEN", factId: "SYNTHETIC-F1", confirmed: true },
  last_name: { value: "SYNTHETIC-FAMILY", factId: "SYNTHETIC-F2", confirmed: true },
}, saved: {} });
async function panel() {
  const page = await browser.newPage(); let networkAttempts = 0;
  page.setDefaultTimeout(2500);
  await page.route("**/*", r => { networkAttempts++; return r.abort(); });
  const html = fs.readFileSync(path.join(ROOT, "extension/panel.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<link\b[^>]*>/g, "");
  await page.setContent(html);
  await page.addStyleTag({ content: fs.readFileSync(path.join(ROOT, "extension/panel.css"), "utf8") });
  await page.evaluate(() => {
    globalThis.__messages = [];
    globalThis.__state = { signedIn: true, user_id: "SYNTHETIC-IMPORT-OWNER", email: "synthetic@example.test", resume: null, card: null, drafts: {}, queue: { items: [], index: 0, running: false }, timing: { avg_ms: 0 }, importedFacts: 0, answerOnce: null };
    globalThis.__importResult = { ok: true };
    const listener = { addListener() {} };
    globalThis.chrome = { runtime: { sendMessage: async m => {
      __messages.push(structuredClone(m));
      if (m.type === "status") return structuredClone(__state);
      if (m.type === "signout") __state.signedIn = false;
      if (m.type === "import-facts" && m.phase === "preview") {
        if (!__importResult.ok) return structuredClone(__importResult);
        const doc = JSON.parse(m.json), table = Object.keys(doc.answers).length ? "answers" : "saved", key = Object.keys(doc[table])[0], a = doc[table][key];
        return { ok: true, receipt: { actor_id: __state.user_id, review_token: "SYNTHETIC-REVIEW-" + a.factId, payload_hash: "SYNTHETIC-PAYLOAD-HASH", needs_review: [{ table, key, factId: a.factId, value_hash: "SYNTHETIC-VALUE-HASH" }], rejected: [] } };
      }
      if (m.type === "import-facts" && __importResult.ok) __state.importedFacts = Object.keys(JSON.parse(m.json).answers || {}).length;
      if (m.type === "import-facts" && globalThis.__loseImportReply) { globalThis.__loseImportReply = false; throw Error("Synthetic reply lost after storage"); }
      if (m.type === "import-facts" && globalThis.__omitImportReceipt) return { ok: true };
      if (m.type === "import-facts" && __importResult.ok) return { ok: true, receipt: { accepted: [{ ...m.row, actor_id: __state.user_id, confirmation_event_id: "SYNTHETIC-EVENT-" + m.row.factId }] } };
      return structuredClone(__importResult);
    } }, storage: { onChanged: { addListener(fn) { globalThis.__storageChange = fn; } } }, tabs: { query: async () => [{ id: 1 }], onActivated: listener, onUpdated: listener } };
  });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, "extension/panel.js"), "utf8") });
  await page.locator("#setup").waitFor({ state: "visible" });
  return { page, networkAttempts: () => networkAttempts, close: () => page.close() };
}
async function choose(page, data = source(), name = "synthetic-facts.json") {
  await page.setInputFiles("#facts", { name, mimeType: "application/json", buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)) });
}
const imports = page => page.evaluate(() => __messages.filter(m => m.type === "import-facts" && m.phase === "confirm"));
const row = (page, n = 0) => page.locator("#fact-import-list li").nth(n);

test("fact import panel: choosing a file previews drafts and never imports the file's confirmation flags", async () => {
  const f = await panel(); try {
    await choose(f.page); await f.page.locator("#fact-import-list li").last().waitFor();
    assert.equal((await imports(f.page)).length, 0, "file choice wrote facts before review");
    assert.equal(await f.page.locator("#fact-import-list li").count(), 2);
    assert.equal(await f.page.locator('#fact-import-list li[data-state="confirmed"]').count(), 0);
    assert.match(await f.page.locator("#fact-import-list").innerText(), /SYNTHETIC-GIVEN/);
    assert.equal(f.networkAttempts(), 0);
  } finally { await f.close(); }
});

test("fact import panel: each trusted confirmation sends only the answers actually reviewed", async () => {
  const f = await panel(); try {
    const data = source(); data.answers.first_name.confirmed = false;
    await choose(f.page, data); await row(f.page).locator("button").click();
    await row(f.page).locator('[data-import-state="confirmed"]').waitFor();
    const calls = await imports(f.page), payload = JSON.parse(calls[0].json);
    assert.equal(calls.length, 1); assert.equal(payload.user_id, data.user_id);
    assert.deepEqual(Object.keys(payload.answers), ["first_name"]);
    assert.deepEqual(payload.answers.first_name, { value: "SYNTHETIC-GIVEN", factId: "SYNTHETIC-F1", confirmed: false });
    assert.equal(await row(f.page, 1).getAttribute("data-state"), "draft");
    assert.equal((await f.page.evaluate(() => __messages.filter(m => /approv|submit|queue-start/.test(m.type)))).length, 0, "fact review approved an application");
    await row(f.page, 1).locator("button").click();
    await row(f.page, 1).locator('[data-import-state="confirmed"]').waitFor();
    assert.deepEqual(Object.keys(JSON.parse((await imports(f.page))[1].json).answers), ["last_name"]);
  } finally { await f.close(); }
});

test("fact import panel: a synthetic click never confirms a displayed answer", async () => {
  const f = await panel(); try {
    await choose(f.page); await row(f.page).locator("button").waitFor();
    await row(f.page).locator("button").dispatchEvent("click");
    assert.equal((await imports(f.page)).length, 0);
  } finally { await f.close(); }
});

test("fact import panel: malformed unsupported and mixed-owner files preserve the session", async () => {
  const f = await panel(); try {
    for (const data of ["{", { facts: [{ text: "SYNTHETIC-RAW", confirmed: true }] }, { ...source(), format: "unsupported" }, { ...source(), version: 99 }, { answers: { flag: { value: true, factId: "SYNTHETIC-F", confirmed: true } } }, { ...source(), saved: { other: { value: "SYNTHETIC-OTHER", factId: "SYNTHETIC-OTHER", user_id: "SYNTHETIC-OTHER-OWNER" } } }]) {
      await choose(f.page, data); await f.page.waitForFunction(() => document.getElementById("fact-import-msg")?.textContent);
      assert.equal((await imports(f.page)).length, 0, "invalid file reached the replacing import API");
      assert.equal(await f.page.locator("#fact-import-list li").count(), 0);
    }
  } finally { await f.close(); }
});

test("fact import panel: a refused save stays draft and can be retried by a later trusted click", async () => {
  const f = await panel(); try {
    await choose(f.page); await f.page.evaluate(() => { __importResult = { ok: false, message: "Synthetic import unavailable" }; });
    await row(f.page).locator("button").click();
    await f.page.waitForFunction(() => document.getElementById("fact-import-msg").textContent.includes("Synthetic import unavailable"));
    assert.equal(await row(f.page).getAttribute("data-state"), "draft");
    await f.page.evaluate(() => { __importResult = { ok: true }; }); await row(f.page).locator("button").click();
    await row(f.page).locator('[data-import-state="confirmed"]').waitFor();
    assert.equal((await imports(f.page)).length, 1);
  } finally { await f.close(); }
});

test("fact import panel: a late old file read cannot replace the newer preview", async () => {
  const f = await panel(); try {
    await f.page.evaluate(() => { const read = File.prototype.text; File.prototype.text = async function () { if (this.name === "slow.json") await new Promise(r => setTimeout(r, 120)); return read.call(this); }; });
    await choose(f.page, source(), "slow.json");
    const data = source(); data.answers = { city: { value: "SYNTHETIC-LATEST-CITY", factId: "SYNTHETIC-LATEST" } };
    await choose(f.page, data, "newer.json"); await f.page.waitForTimeout(160);
    assert.match(await f.page.locator("#fact-import-list").innerText(), /SYNTHETIC-LATEST-CITY/);
    assert.doesNotMatch(await f.page.locator("#fact-import-list").innerText(), /SYNTHETIC-GIVEN/);
    assert.equal((await imports(f.page)).length, 0);
  } finally { await f.close(); }
});

test("fact import panel: account changes discard the pending preview", async () => {
  const f = await panel(); try {
    await choose(f.page); await row(f.page).locator("button").waitFor();
    await f.page.evaluate(() => { __state.email = "other-synthetic@example.test"; __storageChange(); });
    await f.page.waitForFunction(() => document.querySelectorAll("#fact-import-list li").length === 0);
    assert.equal((await imports(f.page)).length, 0); assert.equal(await f.page.locator("#fact-import-review").isVisible(), false);
  } finally { await f.close(); }
});

test("fact import panel: full imported text is displayed as data rather than executable markup", async () => {
  const f = await panel(); try {
    const data = source(); data.answers = { note: { value: '<img src="https://invalid.test/x" onerror="globalThis.SYNTHETIC_EXECUTED=true">\nSYNTHETIC-END', factId: "SYNTHETIC-MARKUP" } };
    await choose(f.page, data); await row(f.page).locator("button").waitFor();
    assert.ok((await row(f.page).innerText()).includes(data.answers.note.value));
    assert.equal(await row(f.page).locator("img").count(), 0); assert.equal(await f.page.evaluate(() => globalThis.SYNTHETIC_EXECUTED === true), false);
    assert.equal(f.networkAttempts(), 0);
  } finally { await f.close(); }
});

test("fact import panel: a lost import reply permits only an exact retry before another row replaces session data", async () => {
  const f = await panel(); try {
    await choose(f.page); await f.page.evaluate(() => { globalThis.__loseImportReply = true; });
    await row(f.page).locator("button").click();
    await f.page.waitForFunction(() => document.getElementById("fact-import-msg").textContent.includes("could not be confirmed"));
    assert.equal(await row(f.page).getAttribute("data-state"), "draft", "a missing reply was counted as confirmed");
    assert.equal(await row(f.page, 1).locator("button").isDisabled(), true, "another row could replace a possibly committed answer before reconciliation");
    await row(f.page).locator("button").click(); await row(f.page).locator('[data-import-state="confirmed"]').waitFor();
    const calls = await imports(f.page);
    assert.equal(calls[0].json, calls[1].json, "reconciliation changed the exact reviewed payload");
    assert.equal(await row(f.page, 1).locator("button").isEnabled(), true);
  } finally { await f.close(); }
});

test("fact import panel: a bare success without an accepted-row receipt never marks a fact confirmed", async () => {
  const f = await panel(); try {
    await choose(f.page); await f.page.evaluate(() => { globalThis.__omitImportReceipt = true; });
    await row(f.page).locator("button").click();
    await f.page.waitForFunction(() => document.getElementById("fact-import-msg").textContent.includes("did not confirm this exact answer"));
    assert.equal(await row(f.page).getAttribute("data-state"), "draft");
    assert.equal(await f.page.locator('[data-import-state="confirmed"]').count(), 0);
  } finally { await f.close(); }
});

test("fact import panel: a real panel review reaches the actual background handler and its trusted manifest receipt", async () => {
  const f = await panel(); try {
    const owner = source().user_id, data = { auth: { user_id: owner, expires_at: 0 }, imported_file: { user_id: owner, answers: {}, saved: {} } };
    const store = { async get(k) { return { [k]: structuredClone(data[k]) }; }, async set(r) { Object.assign(data, structuredClone(r)); }, async remove() {} };
    const noop = { addListener() {} };
    const ctx = { console, crypto: webcrypto, TextEncoder, TextDecoder, URL, Uint8Array, setTimeout, clearTimeout, structuredClone, importScripts() {}, fetch() { throw Error("network forbidden"); },
      chrome: { storage: { session: store, local: store }, runtime: { id: "SYNTHETIC", getURL: p => "chrome-extension://SYNTHETIC/" + p, onInstalled: noop, onMessage: noop }, tabs: { onUpdated: noop } } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "extension/lib/trainee-core.js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "extension/background.js"), "utf8") + "\nglobalThis.__handle=handle;", ctx);
    await f.page.exposeFunction("__actualImport", async m => JSON.parse(JSON.stringify(await ctx.__handle(m, { id: "SYNTHETIC", url: "chrome-extension://SYNTHETIC/panel.html" }))));
    await f.page.evaluate(() => { const other = chrome.runtime.sendMessage; chrome.runtime.sendMessage = m => m.type === "import-facts" ? __actualImport(m) : other(m); });
    await choose(f.page); assert.equal(data.imported_file.answers.first_name, undefined, "file choice committed without a review");
    await row(f.page).locator("button").click(); await row(f.page).locator('[data-import-state="confirmed"]').waitFor();
    const saved = data.imported_file.answers.first_name, receipt = data.fact_import_receipts[0];
    assert.equal(saved.value, "SYNTHETIC-GIVEN"); assert.equal(saved.user_id, owner);
    assert.equal(saved.confirmation_event_id, receipt.id); assert.equal(receipt.actor_id, owner);
    assert.ok((await row(f.page).innerText()).includes(receipt.id));
    assert.equal(data.imported_file.answers.last_name, undefined, "another row was confirmed implicitly");
    assert.equal(f.networkAttempts(), 0);
  } finally { await f.close(); }
});
