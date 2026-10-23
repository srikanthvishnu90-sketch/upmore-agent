// MEASUREMENT HOST — unit + environment construction tests.
//
// The variant service's code deny (tests/career-board-measure-host
// .test.cjs) is only half the construction. This file pins the other
// half, from the artifacts themselves:
//   (a) the systemd unit runs the variant as a dedicated
//       UNPRIVILEGED user — never root, never an omitted User=
//       (systemd's default IS root, so an omitted User= is a root
//       service wearing a template's clothes);
//   (b) the unit declares NO EnvironmentFile — the mechanism by
//       which the executor's credential file would enter a process —
//       and every Environment= line it does declare is free of
//       production-database variable names, so the service user's
//       environment contains none BY CONSTRUCTION;
//   (c) the variant's source carries no reference to the executor's
//       env file or config module and no production-database client,
//       URL, or key identifier. These are grep-level assertions and
//       are labeled as such: they pin the absence of the reference,
//       while the behavioral half (the deny, the facade, the spy
//       counts) is proven in the companion suite.
// Check: node --test tests/career-board-measure-unit.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

const UNIT_PATH = path.join(root, "scripts/career/systemd/upmore-career-board-measure.service");
const SERVICE_PATH = path.join(root, "workers/career-browser/board-service-measure.cjs");

test("measure unit: runs as the dedicated unprivileged service user, never root, never defaulted", () => {
  const unit = fs.readFileSync(UNIT_PATH, "utf8");
  const userLines = unit.match(/^User=.*$/gm) || [];
  assert.equal(userLines.length, 1, "exactly one User= line — an omitted User= would mean root");
  assert.equal(userLines[0], "User=trainee-measure", "the named, dedicated, unprivileged service user");
  assert.ok(!/^User=(root|0)\s*$/m.test(unit), "never root, by name or by uid");
});

test("measure unit: no EnvironmentFile, and no production-database variable in its environment", () => {
  const unit = fs.readFileSync(UNIT_PATH, "utf8");
  assert.ok(!/^EnvironmentFile\s*=/m.test(unit), "no EnvironmentFile directive in the unit — that directive is how the executor's credential file would be loaded (the word may appear in comments explaining its absence; the directive may not)");
  const envLines = unit.match(/^Environment=.*$/gm) || [];
  assert.ok(envLines.length > 0, "the unit declares its environment explicitly");
  const names = envLines.map((l) => l.replace(/^Environment=/, "").split("=")[0]);
  for (const name of names) {
    assert.ok(!/^SUPABASE_/i.test(name), `environment variable ${name} must not be a production-database variable`);
    assert.ok(!/SERVICE_?ROLE/i.test(name), `environment variable ${name} must not be a privileged-key variable`);
  }
  // The measurement surface's actual needs, present by name: the
  // egress proxy block and the Chromium facts (mirroring the
  // production board unit's recorded environment).
  for (const needed of ["http_proxy", "NODE_USE_ENV_PROXY", "NODE_EXTRA_CA_CERTS", "NO_PROXY", "UPMORE_CHROMIUM_SANDBOX", "UPMORE_CHROMIUM_PATH"]) {
    assert.ok(names.includes(needed), `the unit declares ${needed} — the drive surface's own environment`);
  }
  const exec = (unit.match(/^ExecStart=.*$/m) || [""])[0];
  assert.ok(exec.includes("board-service-measure.cjs"), "ExecStart runs the submit-disabled variant, never the production service");
  assert.ok(!exec.includes("board-service.cjs "), "and not the production entrypoint by a near-miss name");
});

test("measure service source: no executor credential surface is referenced (grep-level)", () => {
  const src = fs.readFileSync(SERVICE_PATH, "utf8");
  const forbidden = [
    [/executor\.env/, "the executor's env file, by name"],
    [/executor-config/, "the executor's config module, by name"],
    [/SUPABASE_[A-Z]/, "a production-database env variable name"],
    [/service[-_]?role/i, "a privileged-key identifier"],
    [/supabase/i, "any production-database client, URL, or key reference"],
    [/createClient/, "a database client constructor"],
    [/process\.env/, "ambient environment reads — config comes from the operator module only"],
    [/batch-executor/, "the batch executor"],
    [/board-service-shard/, "the production service's shard worker (it builds the UNRESTRICTED core)"],
  ];
  for (const [pattern, what] of forbidden) {
    assert.ok(!pattern.test(src), `the variant source must not reference ${what}`);
  }
});
