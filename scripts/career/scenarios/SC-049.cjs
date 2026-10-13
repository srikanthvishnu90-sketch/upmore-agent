"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms, FIRM_SETS } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-049", "honest-yield-before-approval");
  const firms = [].concat(FIRM_SETS.sets.elite_boutique.firms, FIRM_SETS.sets.bulge_bracket.firms.filter((f) => f.status !== "historical")).map((f) => f.name).slice(0, 16);
  const records = poolOverFirms(firms, 20, { per: (i) => { const r = i % 16; if (r < 10) return {}; if (r < 14) return { email_verification: null, email_source: "pattern", email_confidence: 0.6 }; if (r === 14) return { email_verification: "risky", email_source: "pattern", email_confidence: 0.4 }; const d = i % 4; return d === 0 ? { work_email: null } : d === 1 ? { email_verification: "invalid" } : d === 2 ? { opt_out: true } : { geography: "London", office: "London", country: "GB" }; } });
  const q = M.parseTarget("Find 300 bankers for a campaign — tell me the honest yield before I approve anything", PROFILE);
  const y = M.honestYield(records, Object.assign({}, q, { count: 300 }), { profile: PROFILE, nowMs: NOW });
  s.user("Find 300 bankers for a campaign — tell me the honest yield before I approve anything");
  s.tool("124.honestYield (engine breakdown over the fixture pool)", { found: y.found, verified: y.verified, patterned_out: y.patterned_out, trusted_emails: y.trusted_emails, risky_emails: y.risky_emails, sendable: y.sendable, selected: y.selected, reserve: y.reserve, exclusions: y.exclusions });
  s.agent(`Honest yield, before any approval: ${y.text} Nothing sends until you approve — and the patterned, unverified addresses never get counted as trustworthy.`, { card: { title: "Honest yield", found: y.found, trustworthy: y.trusted_emails, verified: y.verified, patterned_out: y.patterned_out, sendable: y.sendable, selected: y.selected, reserve: y.reserve, exclusions: y.exclusions } });
  s.verify("yield numbers are the engine's own buildList breakdown over the fixture pool (not the canonical example numbers)", { found: y.found, sendable: y.sendable, verified_plus_patterned_le_sendable: y.verified + y.patterned_out <= y.sendable, exclusions_sum: Object.values(y.exclusions).reduce((a, b) => a + b, 0) });
  await s.finish({ status: "COMPLETE", outcome: `Honest yield quoted from the engine's own breakdown: ${y.found} found, ${y.trusted_emails} trustworthy emails, ${y.sendable} sendable (${y.verified} verified, ${y.patterned_out} patterned/unverified kept separate) — quoted before any approval, exactly as computed` });
})();
=======
const L = require("./_f03-lib.cjs");
const { execFileSync } = require("child_process");
const os = require("os");
(async () => {
  const s = L.H.session("SC-049", "doorstep-lever-demo-board");
  s.user("apply for me (Lever posting)");
  const postings = await L.feed("lever", "leverdemo");
  const posting = postings[0];
  const applyUrl = posting.url.replace(/\/?$/, "/apply");
  s.tool("121-career-jobs lever/leverdemo feed", { count: postings.length, chosen: { title: posting.title, url: posting.url, applyUrl } });
  // Capture the REAL apply page verbatim (the VM's Chromium cannot tunnel to
  // jobs.lever.co directly; curl through the egress proxy returns the full
  // 748KB server-rendered form). Fill the capture locally — the task's
  // allowed doorstep route — and STOP before submit.
  const capPath = L.path.join(os.tmpdir(), "lever-demo-apply-capture.html");
  execFileSync("curl", ["-s", "-o", capPath, "-A", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36", applyUrl], { timeout: 90000 });
  const html = L.fs.readFileSync(capPath, "utf8");
  const fieldNames = [...new Set([...html.matchAll(/name="([^"]+)"/g)].map((m) => m[1]).filter((n) => n && !n.startsWith("twitter") && n !== "robots"))];
  const outPng = L.path.join(L.H.OUT_DIR, "SC-049-doorstep-lever-filled-form.png");
  const fillOut = JSON.parse(execFileSync("python3", [L.path.join(__dirname, "lever-doorstep.py"), capPath, outPng], { timeout: 120000 }).toString().trim().split("\n").pop());
  s.tool("lever-doorstep.py (fill captured real form, read back DOM state)", { captureBytes: html.length, fieldMap: fieldNames, fill: fillOut, filledFormScreenshot: "SC-049-doorstep-lever-filled-form.png" });
  const t = L.Tailor.tailorResume(L.persona(), posting.jd_text, { jobId: posting.job_id, company: "Lever Demo" });
  const core = ["name", "email", "phone", "org"];
  const filledOk = core.every((f) => String(fillOut.filled[f] || "").includes("TEST") || String(fillOut.filled[f] || "").includes("example.test"));
  s.agent(`Doorstep reached on Lever's own demo board for "${posting.title}". I filled the real form (name, email, phone, current company, location, pronouns — all TEST persona values) and read the values back from the form itself; the filled form is screenshotted in the evidence. Two honest notes: the form carries an h-captcha, which under our rules is your tap, not mine — and I stopped BEFORE Submit. Nothing was submitted to the demo board. Your tailored resume (audit passed) is ready to attach.`, { card: { type: "doorstep", title: "Lever demo — filled to review, stopped", posting: posting.title, filled: fillOut.filled, captchaPresent: fillOut.captchaPresent, submitted: false, resumeVersion: t.version && t.version.versionId } });
  s.verify("filled values read back from the captured real form's own DOM state; submit never clicked (submitted:false); captcha presence recorded as the user-handoff point", { filledOk, submitted: fillOut.submitted, captchaPresent: fillOut.captchaPresent, tailorOk: t.ok });
  await s.finish({ status: filledOk && !fillOut.submitted ? "COMPLETE" : "LEARN", outcome: `Lever demo-board form filled to the doorstep with TEST values (read back from the form), screenshot evidence saved, submit never clicked; h-captcha noted as the user tap.`, reason: filledOk ? null : "core fields did not read back as filled — see tool record", unblock: filledOk ? null : "Inspect the captured form markup in /tmp and the field map in messages.json." });
})().catch((e) => { console.error(e); process.exit(1); });
>>>>>>> origin/career/sc-f03
