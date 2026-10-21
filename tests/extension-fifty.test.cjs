"use strict";
// 50 in 30 (docs/apply/FIFTY-IN-THIRTY.md on wo/frs-fifty): what landed from the throughput patch, checked on the
// extension's own background.js and panel.js run in a node vm against a stand-in chrome API. No browser, no network,
// no employer: every page and RPC here is a stub, and nothing is sent anywhere.
//
//   node --test tests/extension-fifty.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const EXT = path.join(__dirname, "..", "extension");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lever = (tenant) => `https://jobs.lever.co/${tenant}/${crypto.randomUUID()}`;
const SCHEMA = [{ name: "note", label: "Anything else", type: "text", required: false, options: [] }];

function area() {
  const m = new Map();
  return {
    m,
    async get(k) {
      const ks = k === null || k === undefined ? [...m.keys()] : Array.isArray(k) ? k : typeof k === "string" ? [k] : Object.keys(k);
      return Object.fromEntries(ks.filter((x) => m.has(x)).map((x) => [x, structuredClone(m.get(x))]));
    },
    async set(o) {
      for (const [k, v] of Object.entries(o)) m.set(k, structuredClone(v));
    },
    async remove(k) {
      for (const x of [].concat(k)) m.delete(x);
    },
  };
}

// The service worker in a vm. `flags` are laid over config.js's TRAINEE_DEFAULTS (the shipped file is never written).
function background(flags = {}) {
  let next = 100, listener = null, live = 0;
  const tabs = new Map(), log = { windows: 0, surveyTabs: 0, maxSurveys: 0, sent: [], shots: [] };
  const env = { tabs, log };
  const reply = (id, url) => {
    const t = tabs.get(id);
    if (!t?.survey || url === "about:blank") return;
    const tenant = C().tenantOf(C().postingKey(url));
    const jobId = C().postingKey(url);
    setTimeout(() => env.ask({ type: "survey", ok: true, jobId, company: tenant, url, location: "Chicago, IL", needs: [], family: "lever", schema: SCHEMA, listed: [],
      batch: { ok: true, posting: { jobId, company: tenant, url, answers: [], blank: [], ledger: [] } } }, { id: "ext", tab: { id }, url }), 2);
  };
  const newTab = (url, survey) => {
    const t = { id: next++, url, status: "complete", survey };
    tabs.set(t.id, t);
    if (survey) log.maxSurveys = Math.max(log.maxSurveys, ++live), log.surveyTabs++;
    return t;
  };
  const chrome = {
    runtime: { id: "ext", getURL: (p) => "chrome-extension://ext/" + p, onInstalled: { addListener() {} }, onMessage: { addListener: (f) => (listener = f) } },
    storage: { session: area(), local: area() },
    tabs: {
      async create({ url, active }) {
        return { ...newTab(url, active === false) };
      },
      async update(id, { url }) {
        const t = tabs.get(id);
        if (!t) throw Error("No tab with id");
        t.url = url;
        reply(id, url);
        return { ...t };
      },
      async remove(id) {
        if (tabs.get(id)?.survey) live--;
        tabs.delete(id);
      },
      async get(id) {
        if (!tabs.has(id)) throw Error("No tab with id");
        return { ...tabs.get(id) };
      },
      async query() {
        return [...tabs.values()];
      },
      async sendMessage(id, m) {
        log.sent.push({ id, type: m.type });
      },
      async captureVisibleTab() {
        log.shots.push(Date.now());
        return "data:image/png;base64,AAAA";
      },
      onUpdated: { addListener() {}, removeListener() {} },
    },
    windows: {
      async create({ url }) {
        log.windows++;
        const t = newTab(url, false);
        return { id: t.id + 10_000, tabs: [{ ...t }] };
      },
    },
    scripting: { executeScript: async () => [] },
  };
  const fetch = async () => ({ ok: true, status: 200, text: async () => "[]", json: async () => [] });
  const ctx = vm.createContext({ chrome, fetch, console, setTimeout, clearTimeout, atob, btoa, crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, URLSearchParams, structuredClone });
  ctx.importScripts = (...files) => files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(EXT, f), "utf8"), ctx, { filename: f }));
  vm.runInContext(fs.readFileSync(path.join(EXT, "background.js"), "utf8"), ctx, { filename: "background.js" });
  Object.assign(ctx.TRAINEE_DEFAULTS, flags);
  const C = () => ctx.TraineeCore;
  env.ctx = ctx;
  env.chrome = chrome;
  env.ask = (m, sender = { id: "ext", url: "chrome-extension://ext/panel.html" }) => new Promise((res) => listener(m, sender, res));
  env.session = (k) => chrome.storage.session.get(k).then((o) => o[k] ?? null);
  env.signIn = () => chrome.storage.session.set({ auth: { access_token: "TEST", refresh_token: "TEST", expires_at: 0, user_id: "TEST-user", email: "test@example.test" } });
  env.queue = (urls) => env.ask({ type: "queue-set", text: urls.join("\n") });
  env.stop = () => env.ask({ type: "queue-stop" });
  return env;
}

test("config: one sending tab by default; both submit flags stay off", () => {
  const box = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(EXT, "config.js"), "utf8"), box);
  const d = box.TRAINEE_DEFAULTS;
  assert.equal(d.agentTabs, 1);
  assert.equal(d.agentSubmits, false);
  assert.equal(d.personSubmits, false);
});

test("Prepare reads 50 postings in one press, at most 8 hidden tabs at once, and all 50 go in one batch", async () => {
  const b = background({ agentSubmits: true });
  await b.signIn();
  const urls = Array.from({ length: 50 }, (_, i) => lever(`co${i}`));
  assert.equal((await b.queue(urls)).added, 50);
  const r = await b.ask({ type: "answer-once-prepare" });
  assert.equal(r.ok, true, JSON.stringify(r));
  const ao = await b.session("answer_once");
  assert.equal(ao.total, 50);
  assert.equal(ao.read, 50);
  assert.deepEqual(ao.notes, []);
  assert.equal(b.log.surveyTabs, 50);
  assert.ok(b.log.maxSurveys <= 8 && b.log.maxSurveys > 4, `hidden tabs at once: ${b.log.maxSurveys}`);
  const batch = await b.session("agent_batch");
  assert.equal(batch.ready.length, 50, JSON.stringify(batch.out.slice(0, 3)));
});

test("a second Prepare plans again from the form already read: no page is loaded again", async () => {
  const b = background({ agentSubmits: true });
  await b.signIn();
  await b.queue(Array.from({ length: 12 }, (_, i) => lever(`re${i}`)));
  await b.ask({ type: "answer-once-prepare" });
  assert.equal(b.log.surveyTabs, 12);
  const again = await b.ask({ type: "answer-once-prepare" });
  assert.equal(again.ok, true);
  assert.equal(b.log.surveyTabs, 12, "no hidden tab was opened the second time");
  assert.equal((await b.session("answer_once")).read, 12);
  assert.equal((await b.session("agent_batch")).ready.length, 12);
});

test("Prepare leaves a second posting at the same company out of the batch, with the 30-day reason", async () => {
  const b = background({ agentSubmits: true });
  await b.signIn();
  const first = lever("acme"), second = lever("acme"), gh = "https://job-boards.greenhouse.io/acme/jobs/4012345", other = lever("beta");
  await b.queue([first, second, other, gh]);
  await b.ask({ type: "answer-once-prepare" });
  const batch = await b.session("agent_batch"), key = (u) => b.ctx.TraineeCore.postingKey(u);
  assert.deepEqual(batch.ready.map((e) => key(e.url)), [first, other].map(key));
  assert.deepEqual(batch.out.map((e) => key(e.url)).sort(), [second, gh].map(key).sort());
  for (const o of batch.out) assert.match(o.why.join(" "), /one application per company in 30 days/i);
});

test("the proof list: only the newest 10 proofs keep their pictures inline; an older one reads back whole; Clear removes all", async () => {
  const b = background();
  for (let i = 0; i < 15; i++) await b.ctx.keepEvidence({ id: "p" + i, at: i, screenshot: "data:A" + i, screenshot_after: "data:B" + i });
  const list = (await b.chrome.storage.local.get("evidence")).evidence;
  assert.equal(list.length, 15);
  assert.deepEqual(list.slice(0, 10).map((e) => e.screenshot), Array.from({ length: 10 }, (_, i) => "data:A" + (14 - i)));
  for (const e of list.slice(10)) assert.ok(!("screenshot" in e) && !("screenshot_after" in e), e.id);
  const old = await b.ask({ type: "proof", id: "p0" });
  assert.equal(old.proof.screenshot, "data:A0");
  assert.equal(old.proof.screenshot_after, "data:B0");
  assert.equal((await b.ask({ type: "proof", id: "p14" })).proof.screenshot, "data:A14");
  await b.ask({ type: "clear-proof", confirm: "clear" });
  assert.deepEqual([...b.chrome.storage.local.m.keys()], []);
});

test("the agent sends on one tab by default; three only when agentTabs says 3; never two of one company at once", async () => {
  for (const [flags, lanes] of [[{ agentSubmits: true }, 1], [{ agentSubmits: true, agentTabs: 3 }, 3], [{ agentSubmits: false, agentTabs: 3 }, 1]]) {
    const b = background(flags);
    const own = await b.chrome.tabs.create({ url: "https://upmore-topaz.vercel.app/", active: true });
    await b.queue([lever("acme"), lever("acme"), lever("beta"), lever("gamma"), lever("delta")]);
    assert.equal((await b.ask({ type: "queue-start", tabId: own.id })).ok, true);
    const q = await b.session("queue");
    const open = q.items.filter((x) => x.state === "open");
    assert.equal(b.log.windows, lanes - 1, JSON.stringify(flags));
    assert.equal(open.length, lanes, JSON.stringify(flags));
    assert.equal(new Set(open.map((x) => new URL(x.url).pathname.split("/")[1])).size, open.length, "one company per lane");
    await b.ask({ type: "batch-stop" });
    assert.equal((await b.session("queue")).running, false);
    assert.equal(new Set(b.log.sent.filter((s) => s.type === "agent-stop").map((s) => s.id)).size, lanes, "Stop reaches every lane");
  }
});

test("pictures are taken one at a time, at least 520 ms apart", async () => {
  const b = background();
  await Promise.all([1, 2, 3].map(() => b.ctx.capture(1)));
  const gaps = b.log.shots.slice(1).map((t, i) => t - b.log.shots[i]);
  assert.equal(b.log.shots.length, 3);
  for (const g of gaps) assert.ok(g >= 510, `gap ${g} ms`);
});

// The panel in a vm: every element is a stub; "status" never answers, so each render is one "status" request.
function stub() {
  const own = {};
  const p = new Proxy(function () {}, {
    get: (_, k) => (k === "then" ? undefined : k === Symbol.iterator ? function* () {} : k === Symbol.toPrimitive ? () => "" : k in own ? own[k] : (own[k] = stub())),
    set: (_, k, v) => ((own[k] = v), true),
    apply: () => stub(),
  });
  return p;
}
test("the panel redraws at most once every 250 ms however often storage changes", async () => {
  let changed = null, renders = 0;
  const chrome = {
    runtime: { sendMessage: (m) => (m.type === "status" ? (renders++, new Promise(() => {})) : Promise.resolve({ ok: true })) },
    storage: { onChanged: { addListener: (f) => (changed = f) } },
    tabs: { query: async () => [], onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
  };
  vm.runInContext(fs.readFileSync(path.join(EXT, "panel.js"), "utf8"), vm.createContext({ chrome, document: stub(), location: { search: "?tab=5" }, URLSearchParams, setTimeout, clearTimeout, console }));
  await sleep(20);
  assert.equal(renders, 1, "the first render");
  for (let i = 0; i < 25; i++) changed();
  await sleep(20);
  assert.ok(renders <= 2, `25 changes at once: ${renders - 1} redraws`);
  await sleep(300);
  assert.equal(renders, 2, "the changes are drawn once");
  const start = renders, t0 = Date.now();
  while (Date.now() - t0 < 1000) {
    changed();
    await sleep(10);
  }
  await sleep(300);
  assert.ok(renders - start >= 3 && renders - start <= 5, `${renders - start} redraws in 1 s of changes`);
});
