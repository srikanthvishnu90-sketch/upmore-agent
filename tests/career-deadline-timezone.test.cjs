// A posted deadline is the same calendar day on every host. Date.parse read "November 2, 2026" and "11/2/2026" in the
// host's own timezone, so the stored deadline moved with the server (MI-027's test failed on a Chicago machine and
// passed in UTC CI). Each case below runs in a child process under a different TZ.
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const MODULE = path.join(__dirname, "..", "packages", "domain", "152-career-assign.js");
const PROBE = `
  const A = require(${JSON.stringify(MODULE)});
  const out = {};
  for (const jd of process.argv.slice(1)) { const d = A.extractDeadline({ jd_text: jd }); out[jd] = d ? d.at : null; }
  process.stdout.write(JSON.stringify(out));
`;
const CASES = {
  "Apply by November 2, 2026 to be considered.": "2026-11-02T00:00:00.000Z",
  "Applications close 11/2/2026.": "2026-11-02T00:00:00.000Z",
  "Deadline: 2026-11-02": "2026-11-02T00:00:00.000Z",
  "Apply by Nov 2 2026": "2026-11-02T00:00:00.000Z",
  "Closing date is December 31, 2026": "2026-12-31T00:00:00.000Z",
  "Apply by February 30, 2026": null,
};
const ZONES = ["UTC", "America/Chicago", "America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Pago_Pago"];

for (const tz of ZONES) {
  test(`deadlines are the posted calendar day under TZ=${tz}`, () => {
    const run = spawnSync(process.execPath, ["-e", PROBE, ...Object.keys(CASES)], { encoding: "utf8", env: { ...process.env, TZ: tz } });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), CASES);
  });
}
