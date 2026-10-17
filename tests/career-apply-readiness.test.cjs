// Apply-readiness guards (2026-10-17, branch finish/apply-readiness).
// Three mechanisms, each with the live evidence that motivated it:
//
//  A. DRIVE RELAY (scripts/career/drive-connect-relay.cjs): refuses to
//     start without an upstream proxy in env, and tunnels CONNECT with
//     the credentials taken from the env AT RUNTIME — rotating the env
//     value rotates what the upstream sees (memory-only sourcing; a
//     baked-in or persisted credential fails this guard).
//  B. CHROMIUM WRAPPER (scripts/career/drive-chromium.sh): the proxy
//     flag appears iff UPMORE_DRIVE_RELAY_PORT is set; the egress CA
//     SPKI flag is always present; an operator SPKI override wins.
//  C. BOARD DRIVES against fixtures reproducing MEASURED live shapes:
//     - /captcha-passive: a usable form + an invisible hCaptcha mount
//       (1220x0, data-size="invisible" — Lever/Spotify live, 2026-10-17)
//       + a reCAPTCHA v3 badge iframe. FAIL-FIRST: the run stops
//       CAPTCHA_HANDOFF at open on the unmodified helper — passive
//       tech is not a presented challenge.
//     - /captcha-presented: a real-sized challenge widget (304x78) and
//       no challenge text. Must stop CAPTCHA_HANDOFF before AND after
//       the passive fix (the presented leg may not weaken).
//     - /captcha-open (pre-existing): challenge text page. Must keep
//       stopping (the text leg may not weaken).
//     - /spa-late-form: fields injected ~3.5s after load (the Ashby
//       live shape: 0 fields at first paint, 13 inputs by ~9s).
//       FAIL-FIRST: EMPTY_FORM on the unmodified helper.
// Check: node --test tests/career-apply-readiness.test.cjs
// (browser legs need the repo's usual posture: UPMORE_CHROMIUM_SANDBOX=off on this VM.)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(root, "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const PW = resolvePlaywright();
const SKIP = PW ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-apply-readiness-"));
const RESUME_PATH = path.join(tmpDir, "alex-testcase-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n");
const RESUME_SHA = crypto.createHash("sha256").update(fs.readFileSync(RESUME_PATH)).digest("hex");
const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100",
  location: "Chicago, IL", country: "United States",
  resume: { filename: "alex-testcase-resume.txt", sha256: RESUME_SHA },
  answers: { work_authorization: { value: "Yes", confirmed: true }, sponsorship: { value: "No", confirmed: true } },
};

// ---------- A. relay ----------
test("A1 relay: refuses to start with no upstream proxy in env", () => {
  const env = { ...process.env };
  delete env.https_proxy; delete env.HTTPS_PROXY; delete env.all_proxy; delete env.http_proxy; delete env.HTTP_PROXY;
  const r = spawnSync(process.execPath, [path.join(root, "scripts/career/drive-connect-relay.cjs"), "0"], { env, encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 2, "relay must exit 2 without an upstream, got " + r.status + " / " + (r.stderr || ""));
});

test("A2 relay: tunnels CONNECT with the credentials the env carries at runtime", async () => {
  const seen = [];
  const upstream = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (ch) => {
      buf = Buffer.concat([buf, ch]);
      const idx = buf.indexOf("\r\n\r\n");
      if (idx === -1) return;
      const head = buf.slice(0, idx).toString("latin1");
      seen.push(head);
      sock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      sock.on("data", () => {});
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  const uport = upstream.address().port;
  const startRelay = (user, pass) => new Promise((resolve, reject) => {
    const env = { ...process.env, https_proxy: `http://${user}:${pass}@127.0.0.1:${uport}` };
    const relay = spawn(process.execPath, [path.join(root, "scripts/career/drive-connect-relay.cjs"), "0"], { env, stdio: ["ignore", "pipe", "inherit"] });
    let buf = "";
    const to = setTimeout(() => reject(new Error("relay port timeout")), 15000);
    relay.stdout.on("data", (d) => { buf += d; const m = buf.match(/RELAY_PORT (\d+)/); if (m) { clearTimeout(to); resolve({ relay, port: Number(m[1]) }); } });
  });
  const connectThrough = (port) => new Promise((resolve, reject) => {
    const c = net.connect(port, "127.0.0.1", () => c.write("CONNECT example.test:443 HTTP/1.1\r\nHost: example.test:443\r\n\r\n"));
    let got = Buffer.alloc(0);
    c.on("data", (d) => { got = Buffer.concat([got, d]); if (got.includes("\r\n\r\n")) { c.destroy(); resolve(got.toString("latin1")); } });
    c.on("error", reject);
    setTimeout(() => reject(new Error("tunnel timeout")), 15000);
  });
  try {
    const r1 = await startRelay("fakeuser", "fakepass-one");
    const resp1 = await connectThrough(r1.port);
    assert.match(resp1, /200 Connection Established/);
    r1.relay.kill("SIGTERM");
    const r2 = await startRelay("fakeuser", "fakepass-two");
    await connectThrough(r2.port);
    r2.relay.kill("SIGTERM");
    assert.equal(seen.length, 2, "upstream must see both tunnels");
    const authOf = (head) => (head.match(/Proxy-Authorization: Basic (\S+)/i) || [])[1];
    assert.equal(Buffer.from(authOf(seen[0]), "base64").toString(), "fakeuser:fakepass-one");
    assert.equal(Buffer.from(authOf(seen[1]), "base64").toString(), "fakeuser:fakepass-two",
      "rotating the env credential must rotate what the relay presents — runtime sourcing, nothing baked in or persisted");
  } finally { upstream.close(); }
});

// ---------- B. wrapper ----------
test("B1 wrapper: proxy flag iff relay port set; SPKI flag always; override wins", () => {
  const script = path.join(root, "scripts/career/drive-chromium.sh");
  const print = (env) => spawnSync("bash", [script], { env: { ...process.env, DRIVE_CHROMIUM_PRINT: "1", ...env }, encoding: "utf8", timeout: 15000 }).stdout.trim();
  const bare = print({ UPMORE_DRIVE_RELAY_PORT: "" });
  assert.match(bare, /--ignore-certificate-errors-spki-list=/, "SPKI pin must always be present");
  assert.ok(!bare.includes("--proxy-server"), "no relay port -> no proxy flag");
  const withPort = print({ UPMORE_DRIVE_RELAY_PORT: "43210" });
  assert.ok(withPort.includes("--proxy-server=http://127.0.0.1:43210"), "relay port -> proxy flag at the relay");
  const override = print({ UPMORE_EGRESS_CA_SPKI: "OVERRIDEhash=" });
  assert.ok(override.includes("--ignore-certificate-errors-spki-list=OVERRIDEhash="), "operator SPKI override must win");
});

// ---------- C. board drives ----------
let fixtureProc, base;
before(async () => {
  fixtureProc = spawn(process.execPath, [path.join(__dirname, "fixtures", "portal-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
  base = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("fixture server did not report a port in 15s")), 15000);
    fixtureProc.stdout.on("data", (d) => { buf += d; const m = buf.match(/FIXTURE_PORT (\d+)/); if (m) { clearTimeout(timer); resolve(`http://localhost:${m[1]}`); } });
  });
});
after(() => { if (fixtureProc) fixtureProc.kill(); if (BrowserBoard.shutdownAll) BrowserBoard.shutdownAll(); });

async function drive(route) {
  const url = `${base}${route}`;
  const board = BrowserBoard.createBrowserBoard({ url, userId: "readiness-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  try {
    const session = Portal.createPortalSession({ userId: "readiness-test", board });
    return Portal.runApply(session, {
      posting: { id: "TEST-" + route, canonicalKey: "localhost:readiness:" + route, company: "TEST Systems", role: "Software Engineering Intern", url, status: "open", atsFamily: null },
      profile: PROFILE, log: { records: [] }, attestations: { certify_true: { value: true, explicit: true } },
    });
  } finally { try { board.close(); } catch (e) { /* already closed */ } }
}

test("C1 passive captcha tech does not stop the drive (Lever live shape)", { skip: SKIP, timeout: 180000 }, async () => {
  const r = await drive("/captcha-passive");
  assert.notEqual(r.code, "CAPTCHA_HANDOFF", "passive captcha tech (invisible mount + v3 badge) must not be read as a presented challenge; got " + JSON.stringify({ status: r.resultStatus, code: r.code }));
  // discovery merges the split first/last inputs into one full_name
  // field, so the 3 inputs analyze as 2 rows (full_name + email).
  assert.ok((r.formAnalysis || []).length >= 2, "the form behind passive tech must be discovered, got " + (r.formAnalysis || []).length);
  assert.equal(r.resultStatus, "prepared", "a fully covered form behind passive tech must reach the doorstep, got " + r.resultStatus);
});

test("C2 presented challenge widget still stops the drive (geometry leg)", { skip: SKIP, timeout: 180000 }, async () => {
  const r = await drive("/captcha-presented");
  assert.equal(r.code, "CAPTCHA_HANDOFF", "a real-sized presented challenge widget must stop the drive, got " + JSON.stringify({ status: r.resultStatus, code: r.code }));
});

test("C3 challenge text page still stops the drive (text leg)", { skip: SKIP, timeout: 180000 }, async () => {
  const r = await drive("/captcha-open");
  assert.equal(r.code, "CAPTCHA_HANDOFF", "the pre-existing challenge-text fixture must keep stopping, got " + JSON.stringify({ status: r.resultStatus, code: r.code }));
});

test("C4 late-rendering SPA form is discovered (Ashby live shape)", { skip: SKIP, timeout: 180000 }, async () => {
  const r = await drive("/spa-late-form");
  assert.notEqual(r.code, "EMPTY_FORM", "a form injected seconds after load must not be reported as a formless page");
  assert.ok((r.formAnalysis || []).length >= 2, "late fields must be discovered (full_name + email after the name merge), got " + (r.formAnalysis || []).length);
  assert.equal(r.resultStatus, "prepared", "the late form must reach the doorstep once discovered, got " + r.resultStatus);
});
