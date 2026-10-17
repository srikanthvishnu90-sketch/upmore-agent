/* Drive environment launcher — one-command, reproducible drive
 * environment for the apply pipeline (branch finish/apply-readiness).
 *
 * Composes the two durable pieces and runs any drive command inside
 * them:
 *   1. starts scripts/career/drive-connect-relay.cjs on an ephemeral
 *      127.0.0.1 port (the relay reads the credentialed upstream
 *      proxy from ITS env at runtime; credentials stay in the relay
 *      process's memory only — this launcher never sees, prints, or
 *      forwards the upstream URL);
 *   2. exports UPMORE_DRIVE_RELAY_PORT and UPMORE_CHROMIUM_PATH
 *      (→ scripts/career/drive-chromium.sh) into the child's env, so
 *      the portal helper's Playwright launches the wrapper, which
 *      routes Chromium through the relay with the egress CA pinned;
 *   3. spawns the command with inherited stdio, forwards its exit
 *      code, and tears the relay down when the command exits.
 *
 * Sandbox posture is NOT decided here: UPMORE_CHROMIUM_SANDBOX passes
 * through untouched (the helper records the effective posture in its
 * ready.json; on this VM the operator sets =off explicitly — see
 * docs/career/… and the readiness ledger — because no sandboxed
 * Chromium can run here for any user).
 *
 * Usage: node scripts/career/drive-env-launch.cjs -- <command> [args…]
 * Example:
 *   UPMORE_CHROMIUM_SANDBOX=off node scripts/career/drive-env-launch.cjs -- \
 *     node scripts/career/dry-drive.cjs --out /tmp/dry.json
 */
"use strict";
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const HERE = __dirname;
const sep = process.argv.indexOf("--");
if (sep === -1 || sep === process.argv.length - 1) {
  console.error("usage: drive-env-launch.cjs -- <command> [args…]");
  process.exit(2);
}
const cmd = process.argv[sep + 1];
const cmdArgs = process.argv.slice(sep + 2);

function startRelay() {
  return new Promise((resolve, reject) => {
    const relay = spawn(process.execPath, [path.join(HERE, "drive-connect-relay.cjs"), "0"],
      { stdio: ["ignore", "pipe", "inherit"], env: process.env });
    let buf = "";
    const to = setTimeout(() => reject(new Error("relay did not report a port within 15s")), 15000);
    relay.stdout.on("data", (d) => {
      buf += d;
      const m = buf.match(/RELAY_PORT (\d+)/);
      if (m) { clearTimeout(to); resolve({ relay, port: m[1] }); }
    });
    relay.on("exit", (code) => { clearTimeout(to); reject(new Error("relay exited early, code " + code)); });
  });
}

(async () => {
  const { relay, port } = await startRelay().catch((e) => { console.error("drive-env-launch:", e.message); process.exit(3); });
  const env = { ...process.env,
    UPMORE_DRIVE_RELAY_PORT: port,
    UPMORE_CHROMIUM_PATH: path.join(HERE, "drive-chromium.sh") };
  // Egress CA pin: an operator-set UPMORE_EGRESS_CA_SPKI wins; else
  // derive the CURRENT fingerprint (the CA rotates — a recorded
  // value was stale within a day, 2026-10-16 → 10-17); else leave
  // unset and the wrapper's recorded default applies.
  let spkiSource = "operator env";
  if (!env.UPMORE_EGRESS_CA_SPKI) {
    const d = spawnSync(process.execPath, [path.join(HERE, "drive-egress-spki.cjs")], { env: process.env, encoding: "utf8", timeout: 35000 });
    const hash = (d.stdout || "").trim();
    if (d.status === 0 && /^[A-Za-z0-9+/]{43}=$/.test(hash)) { env.UPMORE_EGRESS_CA_SPKI = hash; spkiSource = "derived at launch"; }
    else spkiSource = "wrapper default (derivation failed)";
  }
  console.error(`drive-env-launch: relay on 127.0.0.1:${port}; chromium via drive-chromium.sh; egress CA pin: ${spkiSource}; sandbox posture UPMORE_CHROMIUM_SANDBOX=${env.UPMORE_CHROMIUM_SANDBOX || "(default: sandboxed)"}`);
  const child = spawn(cmd, cmdArgs, { stdio: "inherit", env });
  const done = (code) => { try { relay.kill("SIGTERM"); } catch (e) { /* already gone */ } process.exit(code == null ? 1 : code); };
  child.on("exit", (code, signal) => done(signal ? 1 : code));
  child.on("error", (e) => { console.error("drive-env-launch: spawn failed:", e.message); done(1); });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { try { child.kill(sig); } catch (e) { /* noop */ } });
})().catch((e) => { console.error("drive-env-launch fatal:", e); process.exit(1); });
