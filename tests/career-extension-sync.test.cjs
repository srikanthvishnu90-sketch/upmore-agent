// SAVED-ANSWERS SYNC (2026-10-20) — the extension stops filling from
// the built-in test fixture and uses the signed-in user's own saved
// answers, served by the new extension-sync function (module 149's
// derivation over the user's confirmed 122 profile), and employer-
// confirmation reports land as tracker records. This suite pins:
//   * composition: the served map is the product's own composition —
//     identity from the master basics, module 149 deriveAnswers over
//     the confirmed facts, module 132's saved-answer seam for the
//     sensitive questions — and fills the demo form with the persona's
//     OWN values through the real fill engine;
//   * isolation: a read is keyed by the VERIFIED user id only — an
//     unauthenticated read is refused, and persona B's token returns
//     persona B's answers with zero of persona A's values, whatever
//     the request claims;
//   * the report gate: a confirmation is recorded only when the
//     excerpt the report carries re-parses (module 150's rules,
//     server-side) to the claimed confirmation — bare claims, open
//     forms, and mismatched ids are refused; a valid report lands as
//     a module 126 tracker record (stage Confirmed, employer-record
//     confirmation event) with a receipt; duplicates are idempotent
//     per user;
//   * the fixture rule: the demo fixture is usable ONLY on the demo
//     host while signed out — never while signed in, never off the
//     demo host, and a synced set is usable only while signed in
//     (bank-source rule + the shipped content script's real behavior
//     under jsdom);
//   * §6.3: the shipped extension sources contain no submit-invoking
//     code path (mechanical grep, the port lane's check as a suite).
// Check: node --experimental-vm-modules --test tests/career-extension-sync.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "packages", "extension");
const CareerProfile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const CareerTrack = require(path.join(ROOT, "packages/domain/126-career-track.js"));
const CareerPortalApply = require(path.join(ROOT, "packages/domain/149-career-portal-apply.js"));
const engine = require(path.join(EXT, "src/fill-engine.js"));
const BankSource = require(path.join(EXT, "src/bank-source.js"));
const SyncClient = require(path.join(EXT, "src/sync-client.js"));

let JSDOM;
try { ({ JSDOM } = require(path.join(EXT, "tools/node_modules/jsdom"))); }
catch (e) { ({ JSDOM } = require("jsdom")); }

if (!vm.SourceTextModule) {
  test("saved-answers sync suites (respawned with VM modules)", () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // the nested runner must report its own exit status
    const run = spawnSync(process.execPath, ["--experimental-vm-modules", "--test", __filename], { encoding: "utf8", env });
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
} else {

  async function loadEsm(file, globals) {
    const code = fs.readFileSync(file, "utf8");
    const context = vm.createContext({ console, URL, Response, Request, Headers, ...(globals || {}) });
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    await mod.link(() => { throw new Error("extension_sync modules must have no imports"); });
    await mod.evaluate();
    return mod.namespace;
  }
  let coreP = null;
  const core = () => (coreP ||= loadEsm(path.join(ROOT, "supabase/functions/_shared/extension_sync.js")).then((ns) => ns.ExtensionSync));

  const NOW = Date.parse("2026-10-20T12:00:00Z");
  const personaMaster = (file) => CareerProfile.profileFromData(JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures", file), "utf8")));
  const alexMaster = personaMaster("test-persona.json");
  const mayaMaster = personaMaster("persona-medicine-nursing.json");

  function makeWorld(Sync) {
    const users = {
      "token-a": { id: "user-a", email: "alex.testcase@example.test" },
      "token-b": { id: "user-b", email: "maya.testcase@example.test" },
      "token-c": { id: "user-c", email: "casey.testcase@example.test" },
    };
    const flow = {
      "user-a": [{ state: { career: { stores: { profile: alexMaster } } }, updated_at: "2026-10-20T00:00:00Z" }],
      "user-b": [{ state: { career: { stores: { profile: mayaMaster } } }, updated_at: "2026-10-20T00:00:00Z" }],
      "user-c": [],
    };
    const reports = [];
    const letIn = new Set(["user-a", "user-b", "user-c"]); // the people Trainee has let in (the database's trainee_may_act)
    const reads = [];
    const service = Sync.createExtensionSyncService({
      mayAct: async (uid) => letIn.has(uid),
      portalApply: CareerPortalApply,
      track: CareerTrack,
      verifyToken: async (jwt) => users[jwt] || null,
      readFlowRows: async (uid) => { reads.push(uid); return flow[uid] || []; },
      findReportByConfirmation: async (uid, cid) => reports.find((r) => r.user_id === uid && r.confirmation_id === cid) || null,
      insertReport: async (row) => { const rec = { ...row, id: `receipt-${reports.length + 1}`, reported_at: "2026-10-20T12:00:00.000Z" }; reports.push(rec); return rec; },
      now: () => NOW,
    });
    return { service, reports, letIn, reads };
  }
  const req = (method, p, token, body) => new Request(`https://example.test/functions/v1/extension-sync${p}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  // ---------------- composition ----------------

  test("composition: Alex's served map is the product's composition of his own record", async () => {
    const Sync = await core();
    const map = Sync.composeSavedAnswers(alexMaster, NOW, CareerPortalApply);
    assert.equal(map.source, "saved-answers");
    assert.equal(map.profile.name, "Alex Testcase (TEST)");
    assert.equal(map.profile.email, "alex.testcase@example.test");
    assert.equal(map.profile.linkedin, "https://www.linkedin.com/in/example-testcase (TEST)");
    assert.equal(map.profile.github, "https://github.com/example-testcase (TEST)");
    assert.equal(map.profile.website, "https://example.test/testcase (TEST)");
    assert.equal(map.profile.education.school, "TEST University");
    assert.equal(map.profile.education.gpa, "3.7");
    // sensitive saved answers via the module 132 seam over constraints
    // (field-wise: the map is built in the core's vm realm)
    for (const [key, expected] of [
      ["work_authorization", { value: "Yes", confirmed: true, factId: "profile.constraints.workAuthorization" }],
      ["sponsorship", { value: "No", confirmed: true, factId: "profile.constraints.needsSponsorship" }],
    ]) {
      assert.equal(map.answers[key].value, expected.value, key);
      assert.equal(map.answers[key].confirmed, expected.confirmed, key);
      assert.equal(map.answers[key].factId, expected.factId, key);
    }
    assert.equal(map.answers.pronouns.value, "they/them (TEST)");
    assert.equal(map.answers.located_in_us.value, "Yes"); // residence seam: Chicago, IL
    assert.equal(map.answers.years_of_experience.confirmed, true); // module 149 derivation
    assert.equal(map.eeoPolicy, "decline");
    assert.ok(map.savedAnswersVersion.startsWith("sa-"));
    const again = Sync.composeSavedAnswers(alexMaster, NOW, CareerPortalApply);
    assert.equal(again.savedAnswersVersion, map.savedAnswersVersion); // content tag is content-stable
  });

  test("KNOWN-GAP control (module 149): abbreviated degree text derives no education_level / degree / discipline; end dates stay verbatim", async () => {
    // Module 149's DEGREE_LEVELS and its education-block extraction match
    // only spelled-out degree words ("bachelor", "master", ...). Alex's
    // education fact says "B.S. Computer Science", so the derivation —
    // faithfully served — carries no education_level answer and no
    // degree/discipline profile fields, and those form fields stay
    // needs-user. Lane C's hand-frozen fixture bank filled them; the
    // sync layer serves the derivation, it does not fork it. If module
    // 149 is fixed, this control goes red and the lane record's named
    // gap (extension-sync-record-2026-10-20.md) must be updated.
    const Sync = await core();
    const map = Sync.composeSavedAnswers(alexMaster, NOW, CareerPortalApply);
    assert.equal(map.answers.education_level, undefined);
    assert.equal(map.profile.education.degree, undefined);
    assert.equal(map.profile.education.discipline, undefined);
    // Second half of the same recorded gap family: deriveAnswers
    // carries the education end date verbatim ("2028-05") into
    // end_date/graduation_year, where boards offer year-only options —
    // the fill engine then records one honest no_matching_option
    // failure (asserted in the fill test below) instead of guessing.
    assert.equal(map.profile.education.end_date, "2028-05");
    assert.equal(map.profile.education.graduation_year, "2028-05");
  });

  test("composition: the served map fills the demo form with the persona's own values (real fill engine)", async () => {
    const Sync = await core();
    const map = Sync.composeSavedAnswers(alexMaster, NOW, CareerPortalApply);
    const html = fs.readFileSync(path.join(EXT, "fixtures/demo-form.html"), "utf8");
    const dom = new JSDOM(html, { url: "http://localhost:8000/demo-form.html" });
    const entries = engine.discoverFields(dom.window.document);
    const plan = engine.planFill(entries, map);
    const cov = engine.coverageOf(plan);
    assert.equal(cov.total, 28);
    // 19/28 from the true derivation. Lane C's hand-frozen fixture
    // reaches 21/28; the 2-field delta is exactly the module 149
    // abbreviated-degree gap pinned by the KNOWN-GAP control above.
    assert.equal(cov.answerable, 19);
    const result = engine.applyPlan(plan);
    // Exactly one recorded failure, and it is the KNOWN-GAP control's
    // verbatim end date ("2028-05") against the form's year-only
    // options — surfaced to the user as a failed fill, never guessed.
    assert.deepEqual(result.failed.map((f) => [f.label, f.reason]), [["End date year", "no_matching_option"]]);
    const filled = Object.fromEntries(result.filled.map((f) => [f.label, f.value]));
    assert.equal(filled["Full name"], "Alex Testcase (TEST)");
    assert.equal(filled["Email *"], "alex.testcase@example.test");
    assert.equal(filled["School"], "TEST University");
    assert.equal(filled["Are you legally authorized to work in the United States? *"], "Yes");
    assert.equal(filled["Will you now or in the future require visa sponsorship for employment? *"], "No");
    assert.equal(filled["Are you currently located in the United States?"], "Yes");
    assert.equal(filled["Pronouns"], "they/them (TEST)");
    const needsLabels = result.needsUser.map((n) => n.label);
    assert.ok(needsLabels.includes("Degree") && needsLabels.includes("Discipline"));
    // every needs-user field is one the derivation honestly cannot answer
    for (const n of result.needsUser) assert.ok(n.reason && n.reason.length > 0, n.label);
  });

  test("composition: Maya's map is Maya's — and carries zero of Alex's values", async () => {
    const Sync = await core();
    const maya = Sync.composeSavedAnswers(mayaMaster, NOW, CareerPortalApply);
    assert.equal(maya.profile.name, "Maya Testcase (TEST)");
    assert.equal(maya.profile.email, "maya.testcase@example.test");
    assert.equal(maya.answers.pronouns.value, "she/her (TEST)");
    assert.equal(maya.answers.work_authorization.value, "Yes");
    assert.equal(maya.answers.sponsorship.value, "No");
    const blob = JSON.stringify(maya);
    // Alex-distinctive values only: the two fixtures legitimately share
    // the "TEST University" root (Alex's school vs Maya's own "TEST
    // University School of Nursing" education fact).
    for (const alexBit of ["Alex Testcase", "alex.testcase", "example-testcase", "555-0100", "they/them"]) {
      assert.ok(!blob.includes(alexBit), `Maya's map leaked Alex's "${alexBit}"`);
    }
  });

  // ---------------- saved-answers read: auth + isolation ----------------

  test("read: unauthenticated and bad-token reads are refused", async () => {
    const Sync = await core();
    const { service } = makeWorld(Sync);
    const noTok = await Sync.handleRequest(req("GET", "/saved-answers", null), service);
    assert.equal(noTok.status, 401);
    assert.equal((await noTok.json()).code, "UNAUTHENTICATED");
    const bad = await Sync.handleRequest(req("GET", "/saved-answers", "token-nope"), service);
    assert.equal(bad.status, 401);
  });

  test("read: persona B's token serves persona B only — a claimed user_id changes nothing", async () => {
    const Sync = await core();
    const { service } = makeWorld(Sync);
    const res = await Sync.handleRequest(req("GET", "/saved-answers?user_id=user-a", "token-b"), service);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.id, "user-b");
    assert.equal(body.savedAnswers.profile.email, "maya.testcase@example.test");
    const blob = JSON.stringify(body);
    for (const alexBit of ["Alex Testcase", "alex.testcase", "example-testcase", "555-0100", "they/them"]) {
      assert.ok(!blob.includes(alexBit), `cross-user leak: "${alexBit}"`);
    }
  });

  test("read: a user with no stored profile gets the honest 404, not an invented map", async () => {
    const Sync = await core();
    const { service } = makeWorld(Sync);
    const res = await Sync.handleRequest(req("GET", "/saved-answers", "token-c"), service);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "PROFILE_NOT_FOUND");
  });

  // ---------------- submission reports ----------------

  const GOOD_EXCERPT = "Thank you for applying to Example Corp. Your application was received. Application confirmation #GH-DEMO-2026-0001 — a confirmation email is on its way.";
  const goodReport = (over) => ({
    employer: "Example Corp (TEST)",
    role: "Software Engineering Intern (TEST)",
    posting: { url: "https://job-boards.greenhouse.io/examplecorp/jobs/123" },
    confirmation: { confirmationId: "GH-DEMO-2026-0001", confirmationText: GOOD_EXCERPT, successText: true, formStillOpen: false },
    answersSubmitted: { Email: "maya.testcase@example.test" },
    observedAt: "2026-10-20T11:59:00Z",
    ...(over || {}),
  });

  test("report: a bare claim with no parsing excerpt is refused and records nothing", async () => {
    const Sync = await core();
    const { service, reports } = makeWorld(Sync);
    const bare = goodReport({ confirmation: { confirmationId: "GH-DEMO-2026-0001", confirmationText: "", successText: true, formStillOpen: false } });
    const res = await Sync.handleRequest(req("POST", "/application-proofs", "token-b", bare), service);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "CONFIRMATION_NOT_SHOWN");
    assert.equal(reports.length, 0);
  });

  test("report: claimed id that the excerpt does not show in a labeled context is refused", async () => {
    const Sync = await core();
    const { service, reports } = makeWorld(Sync);
    const mismatch = goodReport({ confirmation: { confirmationId: "GH-FAKE-9999", confirmationText: GOOD_EXCERPT, successText: true, formStillOpen: false } });
    const res = await Sync.handleRequest(req("POST", "/application-proofs", "token-b", mismatch), service);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "CONFIRMATION_NOT_SHOWN");
    const unlabeled = goodReport({ confirmation: { confirmationId: "12345678", confirmationText: "Order 12345678 is being prepared, thanks!", successText: false, formStillOpen: false } });
    const res2 = await Sync.handleRequest(req("POST", "/application-proofs", "token-b", unlabeled), service);
    assert.equal(res2.status, 400);
    assert.equal(reports.length, 0);
  });

  test("report: a still-open form vetoes the page, however good the excerpt looks", async () => {
    const Sync = await core();
    const { service, reports } = makeWorld(Sync);
    const open = goodReport({ confirmation: { confirmationId: "GH-DEMO-2026-0001", confirmationText: GOOD_EXCERPT, successText: true, formStillOpen: true } });
    const res = await Sync.handleRequest(req("POST", "/application-proofs", "token-b", open), service);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "FORM_STILL_OPEN");
    assert.equal(reports.length, 0);
  });

  test("report: a valid confirmation lands as an employer-record tracker entry with a receipt; duplicates are idempotent per user", async () => {
    const Sync = await core();
    const { service, reports } = makeWorld(Sync);
    const res = await Sync.handleRequest(req("POST", "/application-proofs", "token-b", goodReport({ user_id: "user-a" })), service);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.duplicate, false);
    assert.ok(body.receipt.id);
    assert.equal(reports.length, 1);
    const row = reports[0];
    assert.equal(row.user_id, "user-b"); // the body's claimed user_id was ignored
    assert.equal(row.record_class, "employer_confirmation");
    assert.equal(row.confirmation_id, "GH-DEMO-2026-0001");
    const tr = row.tracker_record;
    assert.equal(tr.company, "Example Corp (TEST)");
    assert.equal(tr.stage, "Confirmed");
    assert.equal(tr.confirmation_id, "GH-DEMO-2026-0001");
    assert.equal(tr.origin, "extension");
    const confEvent = tr.events.find((e) => e.type === "confirmation");
    assert.ok(confEvent && confEvent.source === "employer_record", "tracker record carries the employer-record confirmation event");
    // duplicate: same user, same confirmation -> same receipt, still one row
    const dup = await Sync.handleRequest(req("POST", "/application-proofs", "token-b", goodReport()), service);
    assert.equal(dup.status, 200);
    const dupBody = await dup.json();
    assert.equal(dupBody.duplicate, true);
    assert.equal(dupBody.receipt.id, body.receipt.id);
    assert.equal(reports.length, 1);
    // the same confirmation under ANOTHER user is that user's own record
    const other = await Sync.handleRequest(req("POST", "/application-proofs", "token-a", goodReport()), service);
    assert.equal(other.status, 200);
    assert.equal(reports.length, 2);
    assert.equal(reports[1].user_id, "user-a");
  });

  test("report: success wording without an id records with a null id; unauthenticated reports are refused", async () => {
    const Sync = await core();
    const { service, reports } = makeWorld(Sync);
    const wording = goodReport({ confirmation: { confirmationId: null, confirmationText: "Thank you for applying — we've received your application.", successText: true, formStillOpen: false } });
    const res = await Sync.handleRequest(req("POST", "/application-proofs", "token-a", wording), service);
    assert.equal(res.status, 200);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].confirmation_id, null);
    const noTok = await Sync.handleRequest(req("POST", "/application-proofs", null, goodReport()), service);
    assert.equal(noTok.status, 401);
    assert.equal(reports.length, 1);
  });

  test("report body mapping: the extension's proof record becomes the contract body verbatim", () => {
    const proof = {
      employer: "Example Corp (TEST)", role: "Software Engineering Intern (TEST)",
      url: "https://job-boards.greenhouse.io/examplecorp/jobs/123",
      confirmationId: "GH-DEMO-2026-0001", confirmationText: GOOD_EXCERPT,
      successText: true, formStillOpen: false,
      answersSubmitted: { Email: "maya.testcase@example.test" }, timestamp: "2026-10-20T11:59:00Z",
    };
    const body = SyncClient.proofToReportBody(proof);
    assert.deepEqual(body, {
      employer: "Example Corp (TEST)", role: "Software Engineering Intern (TEST)",
      posting: { url: "https://job-boards.greenhouse.io/examplecorp/jobs/123" },
      confirmation: { confirmationId: "GH-DEMO-2026-0001", confirmationText: GOOD_EXCERPT, successText: true, formStillOpen: false },
      answersSubmitted: { Email: "maya.testcase@example.test" },
      observedAt: "2026-10-20T11:59:00Z",
    });
  });

  // ---------------- the fixture rule ----------------

  test("bank source rule: the fixture is demo-host + signed-out only; a synced set is signed-in only", () => {
    const R = BankSource.resolveBankSource;
    const synced = { source: "saved-answers" };
    const fixture = { source: "demo-fixture" };
    assert.deepEqual(R({ hasSession: true, storedBank: synced, isDemoHost: false }), { action: "use-stored", source: "synced" });
    assert.deepEqual(R({ hasSession: false, storedBank: synced, isDemoHost: false }), { action: "none", source: null }); // signed out: another user's set never fills
    assert.deepEqual(R({ hasSession: true, storedBank: fixture, isDemoHost: true }), { action: "none", source: null }); // THE guard: signed in -> never the fixture
    assert.deepEqual(R({ hasSession: true, storedBank: fixture, isDemoHost: false }), { action: "none", source: null });
    assert.deepEqual(R({ hasSession: false, storedBank: fixture, isDemoHost: true }), { action: "use-stored", source: "demo-fixture" });
    assert.deepEqual(R({ hasSession: false, storedBank: fixture, isDemoHost: false }), { action: "none", source: null }); // fixture never fills a real host
    assert.deepEqual(R({ hasSession: true, storedBank: null, isDemoHost: true }), { action: "none", source: null });
    assert.deepEqual(R({ hasSession: false, storedBank: null, isDemoHost: true }), { action: "seed-fixture", source: "demo-fixture" });
    assert.deepEqual(R({ hasSession: false, storedBank: null, isDemoHost: false }), { action: "none", source: null });
  });

  // The shipped content script's real behavior under jsdom.
  function makeStorageArea() {
    const data = new Map();
    return {
      data,
      async get(keys) { const out = {}; for (const k of (Array.isArray(keys) ? keys : [keys])) if (data.has(k)) out[k] = data.get(k); return out; },
      async set(obj) { for (const [k, v] of Object.entries(obj)) data.set(k, v); },
      async remove(keys) { for (const k of (Array.isArray(keys) ? keys : [keys])) data.delete(k); },
    };
  }
  async function loadContentScript({ localInit, url } = {}) {
    const html = fs.readFileSync(path.join(EXT, "fixtures/demo-form.html"), "utf8");
    const fixtureText = fs.readFileSync(path.join(EXT, "fixtures/answer-bank.alex-testcase.json"), "utf8");
    const dom = new JSDOM(html, { url: url || "http://localhost:8000/demo-form.html", runScripts: "outside-only" });
    const { window } = dom;
    const local = makeStorageArea(); const session = makeStorageArea();
    for (const [k, v] of Object.entries(localInit || {})) local.data.set(k, v);
    window.chrome = {
      storage: { local, session },
      runtime: { getURL: (p) => "ext://" + p, onMessage: { addListener: () => {} } },
    };
    window.fetch = async (u) => {
      if (String(u).includes("answer-bank.alex-testcase.json")) return { json: async () => JSON.parse(fixtureText) };
      throw new Error("unexpected fetch: " + u);
    };
    for (const f of ["fill-engine.js", "bank-source.js", "content-greenhouse.js"]) {
      window.eval(fs.readFileSync(path.join(EXT, "src", f), "utf8"));
    }
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 10));
    return { window, local, session };
  }

  test("content script: signed in with nothing synced, the fixture is NEVER seeded or used", async () => {
    const { local, session } = await loadContentScript({ localInit: { traineeSession: { accessToken: "token-b", email: "maya.testcase@example.test" } } });
    assert.equal(local.data.has("traineeBank"), false, "the fixture must not be seeded while signed in");
    const cov = session.data.get("traineeCoverage");
    assert.ok(cov, "coverage record written");
    assert.equal(cov.bankPersona, null);
    assert.equal(cov.bankSource, null);
    assert.equal(cov.coverage.answerable, 0);
  });

  test("content script: signed out on the demo host, the fixture seeds and is labeled demo", async () => {
    const { session } = await loadContentScript({ localInit: {} });
    const cov = session.data.get("traineeCoverage");
    assert.ok(cov);
    assert.equal(cov.bankSource, "demo-fixture");
    assert.ok(String(cov.bankPersona).includes("Alex Testcase"));
    assert.equal(cov.coverage.answerable, 21);
  });

  test("content script: signed in with Maya's synced answers, coverage is Maya's and labeled synced", async () => {
    const Sync = await core();
    const mayaMap = Sync.composeSavedAnswers(mayaMaster, NOW, CareerPortalApply);
    const { session } = await loadContentScript({
      localInit: {
        traineeSession: { accessToken: "token-b", email: "maya.testcase@example.test" },
        traineeBank: mayaMap,
      },
    });
    const cov = session.data.get("traineeCoverage");
    assert.ok(cov);
    assert.equal(cov.bankSource, "synced");
    assert.equal(cov.bankPersona, "Maya Testcase (TEST)");
  });

  // ---------------- generated bundle + wrapper ----------------

  test("the generated domain bundle is fresh and composes identically to the sources", async () => {
    const chk = spawnSync("python3", [path.join(ROOT, "scripts/build-extension-sync.py"), "--check"], { encoding: "utf8" });
    assert.equal(chk.status, 0, chk.stderr || chk.stdout);
    const ns = await loadEsm(path.join(ROOT, "supabase/functions/_shared/extension_domain.js"));
    const Sync = await core();
    const viaBundle = Sync.composeSavedAnswers(alexMaster, NOW, ns.CareerPortalApply);
    const viaSources = Sync.composeSavedAnswers(alexMaster, NOW, CareerPortalApply);
    // JSON-normalized: the core runs in a vm realm, so prototypes differ.
    assert.deepEqual(JSON.parse(JSON.stringify(viaBundle)), JSON.parse(JSON.stringify(viaSources)));
    assert.equal(typeof ns.CareerTrack.addApplication, "function");
    assert.equal(typeof ns.CareerProfile.profileFromData, "function");
  });

  // Launch readiness B7 (review of PR #195): a signed-in person Trainee has not let in reads nothing and records nothing.
  test("not admitted: the proof is refused with 403, no row is written and no saved answers are read; admitted, the same call records", async () => {
    const Sync = await core();
    const w = makeWorld(Sync);
    w.letIn.delete("user-a");
    const post = await Sync.handleRequest(req("POST", "/application-proofs", "token-a", goodReport({ confirmationId: "CONF-ADMIT-1" })), w.service);
    const get = await Sync.handleRequest(req("GET", "/saved-answers", "token-a"), w.service);
    assert.deepEqual([post.status, get.status, (await post.json()).code, w.reports.length, w.reads.length], [403, 403, "NOT_ADMITTED", 0, 0]);
    w.letIn.add("user-a");
    const ok = await Sync.handleRequest(req("POST", "/application-proofs", "token-a", goodReport({ confirmationId: "CONF-ADMIT-1" })), w.service);
    assert.deepEqual([ok.status, w.reports.length], [200, 1]);
  });
  test("not admitted: a check that errors refuses too, and a service built without the check refuses to start", async () => {
    const Sync = await core();
    const w = makeWorld(Sync);
    const broken = Sync.createExtensionSyncService({
      portalApply: CareerPortalApply, track: CareerTrack, verifyToken: async () => ({ id: "user-a" }), readFlowRows: async () => [], findReportByConfirmation: async () => null,
      insertReport: async () => { throw new Error("must not be reached"); }, mayAct: async () => { throw new Error("db down"); }, now: () => NOW,
    });
    const r = await Sync.handleRequest(req("POST", "/application-proofs", "t", goodReport()), broken);
    assert.equal(r.status, 403);
    assert.throws(() => Sync.createExtensionSyncService({ portalApply: CareerPortalApply, track: CareerTrack, verifyToken: async () => null, readFlowRows: async () => [],
      findReportByConfirmation: async () => null, insertReport: async () => ({}) }), /mayAct/);
    assert.ok(w.service);
  });

  test("the Deno wrapper parses (types stripped) and wires the real deps", () => {
    const { stripTypeScriptTypes } = require("node:module");
    const src = fs.readFileSync(path.join(ROOT, "supabase/functions/extension-sync/index.ts"), "utf8");
    const stripped = stripTypeScriptTypes(src);
    new vm.Script(stripped.replace(/^import[^;]+;$/gm, "").replace(/^export /gm, ""), { filename: "index.ts" }); // syntax only
    for (const needle of ["auth/v1/user", "agent_flow_state", "extension_submission_reports", "createExtensionSyncService", "handleRequest", "trainee_may_act"]) {
      assert.ok(src.includes(needle), `wrapper must wire ${needle}`);
    }
  });

  // ---------------- §6.3 mechanical guard ----------------

  test("§6.3: the shipped extension contains no submit-invoking code path", () => {
    const srcDir = path.join(EXT, "src");
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".js"));
    assert.ok(files.length >= 6);
    for (const f of files) {
      const code = fs.readFileSync(path.join(srcDir, f), "utf8");
      assert.ok(!/requestSubmit|\.submit\s*\(|\.click\s*\(/.test(code), `${f} must not invoke submit or click programmatically`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.permissions.sort(), ["activeTab", "storage"]);
    assert.ok(manifest.host_permissions.some((h) => h.includes("supabase.co")), "the sync origin is a declared host permission");
    assert.equal(manifest.version, "0.2.0");
  });
}
