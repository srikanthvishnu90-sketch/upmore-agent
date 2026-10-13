"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-105", "portal-status-check");
  s.user("Portal status check (opt-in): log in and read my real application status");
  const log = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/fixtures/test-application-log.json"), "utf8"));
  const inbox = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/fixtures/test-inbox.json"), "utf8"));
  const seam = A3.statusAnswer(log, inbox, "Stripe");
  s.tool("132.statusAnswer over the TEST log seam (local proof of the read path)", { stripe_rows: seam.length });
  s.agent(`Here is the honest state of this one. The opt-in portal check means: you sign in ONCE in the shown browser session (I never see or store your password), I read the portal's own status line, and I record it against your application log. That read path is proven locally against the TEST log seam (${seam.length} Stripe applications answered with log+inbox proof). But a REAL portal read cannot happen in this run: the TEST persona has no real portal account or credentials, and this worker has no live browser to hold your signed-in session. I will not fake a portal login or invent a status.`, { card: { title: "Portal status check — opt-in plan", steps: ["You open the employer's portal in the shown session and sign in yourself", "Agent reads the status line on the application page (no password ever requested in chat)", "Status is written to the application log with the portal as its source"], local_seam_proof: seam.map((x) => x.app_id + ":" + x.stage) } });
  s.verify("no portal claim is made: the only status data shown comes from the labeled TEST log seam", { seam_rows: seam.length, real_portal_read: false });
  await s.finish({ status: "LEARN", outcome: "Portal status read path proven on the TEST log seam, but no real portal status was read — the TEST persona has no real portal account and this worker has no live browser session", reason: "real portal check requires the user's own signed-in browser session (opt-in design) — unavailable to a headless scenario worker, and no credentials exist for a synthetic persona", unblock: "Owner signs into the employer's portal once in the shown browser session; a browser-capable worker then runs the read against module 132's seam and records portal-sourced status" });
})().catch((e) => { console.error(e); process.exit(1); });
