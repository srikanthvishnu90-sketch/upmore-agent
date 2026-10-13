// Doorstep surfaces (owner addendum): for every execute/packet portal item, build the two sandbox surfaces from
// PortalCases.doorstep output — the provider sign-in screen as the guided manual-connect lane shows it, and the
// filled review screen stopped before the executing tap — and write /tmp/k8-doorsteps.json for the renderer
// (evals/k8/render-doorstep.py). Environment: sandbox/local surfaces; no live login is claimed or faked.
const fs = require("node:fs");
const P = require("../../packages/domain/118-portal-cases.js");
const FACTS = require("../../tests/portal-cases-facts.cjs");
const S = JSON.parse(fs.readFileSync("/tmp/k8-surfaces.json", "utf8"));
const baseOf = {}; for (const s of S) baseOf[s.id] = s.base;
const out = [];
for (const c of P.CASES) {
  const d = P.doorstep(c.id, FACTS[c.id]);
  if (!d) continue;
  out.push({ id: c.id, title: c.title, base: baseOf[c.id], service: d.service, mode: d.mode,
    signin_title: d.session.signin_title, steps: d.session.steps,
    ready_title: d.ready.title, ready_lines: d.ready.lines, stop: d.ready.stop, state: d.ready.state });
}
fs.writeFileSync("/tmp/k8-doorsteps.json", JSON.stringify(out, null, 2));
console.log(`doorstep specs: ${out.length}`);
