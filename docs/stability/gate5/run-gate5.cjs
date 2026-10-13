#!/usr/bin/env node
"use strict";
/*
 * Gate 5 live-evidence runner — PREPARED, NEVER FIRED BY ITS AUTHORS.
 *
 * Spec: docs/quality-spec/05-RELEASE-GATES-AND-OPERATING-RULES.md, Gate 5.
 * Plan: docs/stability/gate5/RUN-PLAN.md (read it before touching this file).
 *
 * Safety construction (this is the point of the file — do not weaken it):
 *  1. NO live step runs without the owner's per-run go-ahead token, supplied
 *     TWICE out of band: --owner-go <token> AND env GATE5_OWNER_GO_TOKEN,
 *     and the two must match. The token's value is NOT in this repo and is
 *     never written to any log (only a sha256 prefix is recorded).
 *  2. The gate is checked BEFORE any network call — including preflight.
 *  3. The recipient allowlist is hard-coded below (the founder's own two
 *     addresses, on program record). Every recipient is re-checked before
 *     every send-shaped call; any miss aborts the run (exit 4) before send.
 *  4. The only credential this script touches arrives via env
 *     (UPMORE_TEST_JWT) alongside UPMORE_CHAT_URL, the same contract as
 *     evals/gauntlet/run-live.cjs. Values are never logged.
 *  5. --explain (and a bare invocation) prints the plan and exits 0 with
 *     zero network I/O and zero writes. That is the only mode its authors
 *     have ever run.
 *
 * Exit codes: 0 ok/explain · 2 missing env/config · 3 owner-go gate ·
 *             4 allowlist violation · 5 step failure (evidence preserved)
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------- allowlist
// The founder's own two addresses (program record). Closed list: a recipient
// not in this array is an abort, never a warning. Widening this list is a
// new plan + new owner go-ahead, per RUN-PLAN.md §1.2/§1.3.
const ALLOWLIST = Object.freeze([
  "srikanthvishnu90@gmail.com",
  "vishnusrikanth8@gmail.com",
]);

// The five self-test campaign sends (RUN-PLAN.md Step 4). Recipients are the
// founder's own inboxes wearing persona hats; the draft bodies live in the
// staged drafts file and are loaded at run time so the approval hash in
// Step 4 covers the exact bytes approved (R-A2) — no draft text is duplicated
// into this script.
const CAMPAIGN = Object.freeze([
  { draftId: "G5-D1", personaHat: "IB analyst contact", recipient: ALLOWLIST[0] },
  { draftId: "G5-D2", personaHat: "PE associate contact", recipient: ALLOWLIST[1] },
  { draftId: "G5-D3", personaHat: "VC analyst contact", recipient: ALLOWLIST[0] },
  { draftId: "G5-D4", personaHat: "Alumni banker contact", recipient: ALLOWLIST[1] },
  { draftId: "G5-D5", personaHat: "Club-connection contact", recipient: ALLOWLIST[0] },
]);

const SEQUENCE = Object.freeze([
  "0-preflight", "1-connect", "2-selftest-email", "3-selftest-event",
  "4-campaign", "5-reply", "6-suppression", "7-killswitch",
]);

const DEPENDENCIES = Object.freeze([
  "D-1 staging deploy of the career build at a recorded SHA (owner)",
  "D-2 item-7 HTTP wiring: career dispatch reachable from agent-chat behind a test-account flag, HTTP-proven (Codex lane)",
  "D-3 gmail-oauth career grant live on the staging project (owner/Codex lane)",
  "D-4 founder's consent tap + sandbox Gmail/Calendar + staging test account (owner only)",
  "D-5 suppression + queue/pause state readable over the staging surface (Codex lane)",
  "D-6 five drafts integrated into the master email doc and approved as exact batch text (coordinator + owner)",
  "D-7 the per-run owner go-ahead with a fresh token (owner only)",
]);

// ------------------------------------------------------------------- args
function parseArgs(argv) {
  const args = { explain: false, ownerGo: null, evidenceDir: null, draftsFile: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--explain") args.explain = true;
    else if (a === "--owner-go") args.ownerGo = argv[++i] || null;
    else if (a === "--evidence-dir") args.evidenceDir = argv[++i] || null;
    else if (a === "--drafts-file") args.draftsFile = argv[++i] || null;
    else { console.error(`unknown argument: ${a}`); process.exit(2); }
  }
  return args;
}

function explain() {
  console.log("Gate 5 — live evidence run (PREPARED; this mode performs no network I/O)");
  console.log("\nSequence:");
  for (const s of SEQUENCE) console.log(`  ${s}`);
  console.log("\nAllowlist (hard-coded, closed):");
  for (const a of ALLOWLIST) console.log(`  ${a}`);
  console.log("\nCampaign (self-test; recipients are the founder's own inboxes):");
  for (const c of CAMPAIGN) console.log(`  ${c.draftId}  [${c.personaHat}] -> ${c.recipient}`);
  console.log("\nTo arm a live run the owner must supply, per run, out of band:");
  console.log("  --owner-go <token>   AND   GATE5_OWNER_GO_TOKEN=<same token>");
  console.log("  UPMORE_CHAT_URL=<staging surface>   UPMORE_TEST_JWT=<test-user token>");
  console.log("  --drafts-file <approved drafts file> (its sha256 is the Step 4 batch identity)");
  console.log("  The token value is not in this repo. Without a matching pair the");
  console.log("  script exits (code 3) before any network call.");
  console.log("\nUnbuilt dependencies (RUN-PLAN.md §5):");
  for (const d of DEPENDENCIES) console.log(`  ${d}`);
}

// ------------------------------------------------------------- owner-go gate
// Returns a log-safe fingerprint of the token, or exits 3. Called before ANY
// network use. Both copies are required so a stray CLI history entry or a
// stray env dump alone cannot arm a run.
function requireOwnerGo(args) {
  const envToken = process.env.GATE5_OWNER_GO_TOKEN || null;
  if (!args.ownerGo || !envToken || args.ownerGo !== envToken) {
    console.error(
      "REFUSED: owner go-ahead gate. A live Gate 5 run needs --owner-go <token> " +
      "and GATE5_OWNER_GO_TOKEN set to the same fresh per-run token, supplied " +
      "by the owner out of band. Exiting before any network call."
    );
    process.exit(3);
  }
  return crypto.createHash("sha256").update(args.ownerGo).digest("hex").slice(0, 12);
}

// ------------------------------------------------------------- allowlist gate
function assertAllowlisted(recipient, stepName) {
  if (!ALLOWLIST.includes(String(recipient || "").trim().toLowerCase())) {
    console.error(
      `ABORT (allowlist): step ${stepName} attempted recipient "${recipient}", ` +
      "which is outside the Gate 5 allowlist. No send was attempted. The run ends here."
    );
    process.exit(4);
  }
}

// ---------------------------------------------------------------- evidence
function makeEvidence(evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const records = [];
  return {
    write(step, record) {
      const entry = { step, at: new Date().toISOString(), ...record };
      records.push(entry);
      fs.writeFileSync(
        path.join(evidenceDir, `step-${step}.json`),
        JSON.stringify(entry, null, 2) + "\n"
      );
      console.log(`[gate5] ${step}: ${record.verdict || "recorded"}`);
      return entry;
    },
    summary(extra) {
      const s = { gate: 5, steps: records, ...extra };
      fs.writeFileSync(
        path.join(evidenceDir, "RUN-SUMMARY.json"),
        JSON.stringify(s, null, 2) + "\n"
      );
    },
  };
}

// ------------------------------------------------------------- staging HTTP
// One thin chat-path client. It exists so every step goes through the product
// path (the doorstep rule) — there is deliberately no direct provider call
// anywhere in this file: no Gmail API, no Calendar API, no SMTP.
function makeChatClient({ url, jwt }) {
  return async function chat(message, extra = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ message, ...extra }),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* reply text is evidence as-is */ }
    return { status: res.status, text, json };
  };
}

function fail(evidence, step, why, detail = {}) {
  evidence.write(step, { verdict: "FAIL", why, ...detail });
  evidence.summary({ abortedAt: step, why });
  console.error(`[gate5] ABORT at ${step}: ${why}`);
  process.exit(5);
}

// ------------------------------------------------------- operator pauses
// Steps 1, 5 and 6 contain acts only the founder may do (OAuth consent,
// replying from his own inbox). The runner pauses for Enter at those points;
// it never automates consent and never holds the founder's credentials.
function waitForEnter(what) {
  return new Promise((resolve) => {
    process.stdout.write(`\n[gate5] OPERATOR PAUSE — ${what}\nPress Enter when done (Ctrl-C aborts the run; evidence so far is preserved).\n`);
    process.stdin.resume();
    process.stdin.once("data", () => { process.stdin.pause(); resolve(); });
  });
}

const replyText = (r) => (r && r.json && typeof r.json.reply === "string" ? r.json.reply : (r ? r.text : "")) || "";
// A claim is evidence only when the surface returns structured state with it
// (R-C4). Callers pass the field path they require; absence = FAIL, never a
// charitable read of prose.
function stateField(r, field) {
  let cur = r && r.json ? r.json.state || r.json : null;
  for (const part of field.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

// -------------------------------------------------------------------- main
async function main() {
  const args = parseArgs(process.argv);
  if (args.explain || (!args.ownerGo && !process.env.GATE5_OWNER_GO_TOKEN)) {
    // Bare invocation behaves as --explain: a prepared script must be safe
    // to run by accident. Live mode requires the explicit token pair.
    explain();
    process.exit(0);
  }

  // GATE — before env reads that matter, before evidence writes, before net.
  const tokenFp = requireOwnerGo(args);

  const url = process.env.UPMORE_CHAT_URL || null;
  const jwt = process.env.UPMORE_TEST_JWT || null;
  if (!url || !jwt) {
    console.error(
      "NOT RUN: UPMORE_CHAT_URL (staging surface) and UPMORE_TEST_JWT (test user) " +
      "must be set in the environment. Values are never stored in the repo."
    );
    process.exit(2);
  }
  if (!args.draftsFile || !fs.existsSync(args.draftsFile)) {
    console.error(
      "NOT RUN: --drafts-file <path> must point at the approved Gate 5 drafts file " +
      "(its sha256 becomes the batch identity the Step 4 approval covers, R-A2)."
    );
    process.exit(2);
  }
  const draftsBytes = fs.readFileSync(args.draftsFile);
  const batchSha256 = crypto.createHash("sha256").update(draftsBytes).digest("hex");

  const evidenceDir =
    args.evidenceDir || path.join(process.cwd(), "gate5-evidence", new Date().toISOString().replace(/[:.]/g, "-"));
  const evidence = makeEvidence(evidenceDir);
  const chat = makeChatClient({ url, jwt });

  // ---- Step 0: preflight -------------------------------------------------
  // The allowlist check here is against the script's own constant: if the
  // file was edited, the diff is the review surface (RUN-PLAN.md §1.2).
  for (const c of CAMPAIGN) assertAllowlisted(c.recipient, "0-preflight");
  evidence.write("0-preflight", {
    verdict: "PASS",
    surfaceHost: new URL(url).host,
    credentialPresent: Boolean(jwt), // presence only — never the value (R-F1)
    ownerGoFingerprint: tokenFp,
    allowlistChecked: [...ALLOWLIST],
    campaignRecipients: CAMPAIGN.map((c) => c.recipient),
    batchSha256,
  });

  // ---- Step 1: connect ----------------------------------------------------
  // SC-286 shape: the reply MUST carry the secure connect link. Its absence
  // is a recorded defect and an abort — this script never constructs an
  // OAuth URL itself. If the account is already connected the surface says
  // so and no consent pause is needed.
  const connect = await chat("Connect my Gmail and Calendar for my career search in one go.");
  const connectTxt = replyText(connect);
  const alreadyConnected = stateField(connect, "connection.scope_set") === "career";
  if (!alreadyConnected) {
    if (!/https:\/\/\S+/.test(connectTxt)) {
      fail(evidence, "1-connect", "connect reply carried no secure link (SC-286 regression shape)", {
        replyVerbatim: connectTxt, httpStatus: connect.status,
      });
    }
    await waitForEnter("Founder: open the secure connect link from the Step 1 reply and complete the Google consent on the founder's own sandbox Gmail/Calendar account.");
    const status = await chat("Show my connected accounts and the scopes on each.");
    const scopeSet = stateField(status, "connection.scope_set");
    if (scopeSet !== "career") {
      fail(evidence, "1-connect", `post-consent scope set is "${scopeSet}", expected "career" (send + calendar events)`, {
        connectReplyVerbatim: connectTxt, statusReplyVerbatim: replyText(status),
      });
    }
    evidence.write("1-connect", { verdict: "PASS", replyVerbatim: connectTxt, statusReplyVerbatim: replyText(status), scopeSet });
  } else {
    evidence.write("1-connect", { verdict: "PASS", note: "already connected with career scope set", replyVerbatim: connectTxt });
  }

  // ---- Step 2: self-test email -------------------------------------------
  const selfEmail = await chat("Send the connection self-test email to my own connected address now, and confirm it landed in the inbox.");
  const msgId = stateField(selfEmail, "selftest.email.message_id");
  const arrived = stateField(selfEmail, "selftest.email.arrived");
  if (!msgId || arrived !== true) {
    fail(evidence, "2-selftest-email", "self-test email not proven: message_id and inbox-arrival must both come back as structured state (R-C4)", {
      replyVerbatim: replyText(selfEmail), messageId: msgId || null, arrived: arrived ?? null,
    });
  }
  evidence.write("2-selftest-email", { verdict: "PASS", messageId: msgId, arrived, replyVerbatim: replyText(selfEmail) });

  // ---- Step 3: self-test calendar event -----------------------------------
  const selfEvent = await chat("Create the connection self-test event on my calendar now — label it as a Gate 5 self-test, 30 minutes, no other attendees — and read it back to confirm.");
  const eventId = stateField(selfEvent, "selftest.event.event_id");
  const readBack = stateField(selfEvent, "selftest.event.read_back_ok");
  if (!eventId || readBack !== true) {
    fail(evidence, "3-selftest-event", "self-test event not proven: event_id and a matching read-back are required", {
      replyVerbatim: replyText(selfEvent), eventId: eventId || null, readBack: readBack ?? null,
    });
  }
  evidence.write("3-selftest-event", { verdict: "PASS", eventId, readBack, replyVerbatim: replyText(selfEvent) });

  // ---- Step 4: the 5-recipient self-test campaign -------------------------
  // Doorstep first (F1): list + drafts + safety-plan card, THEN an approval
  // turn naming the batch hash, THEN the send turn. Recipients are re-checked
  // immediately before the send-shaped turn (RUN-PLAN.md §3 Step 4).
  const plan = await chat(
    "Build the Gate 5 self-test campaign: 5 outreach drafts (IDs G5-D1 to G5-D5) to my own two addresses only, " +
    "and show me the list counts and the full safety-plan card. Do not send anything yet."
  );
  const cardTxt = replyText(plan);
  if (!/12\s*\/\s*day/.test(cardTxt) || !/15/.test(cardTxt)) {
    fail(evidence, "4-campaign", "safety-plan card missing the standing caps (12/day ramp start C-1 default; per-firm 15/30d R-B2)", {
      cardVerbatim: cardTxt,
    });
  }
  const approval = await chat(`I approve the Gate 5 self-test campaign exactly as shown on that card, batch sha256 ${batchSha256}.`);
  evidence.write("4-campaign-approval", {
    verdict: "RECORDED", cardVerbatim: cardTxt, approvalReplyVerbatim: replyText(approval), batchSha256,
  });
  for (const c of CAMPAIGN) assertAllowlisted(c.recipient, "4-campaign");
  const send = await chat("Send the approved Gate 5 self-test campaign now — only the approved batch, only my own two addresses.");
  const sentCount = stateField(send, "campaign.sent_count");
  const sentRecipients = stateField(send, "campaign.recipients");
  if (Array.isArray(sentRecipients)) for (const r of sentRecipients) assertAllowlisted(r, "4-campaign");
  if (sentCount !== CAMPAIGN.length) {
    fail(evidence, "4-campaign", `campaign sent_count is ${JSON.stringify(sentCount)}, expected exactly ${CAMPAIGN.length} with reconciled recipients`, {
      replyVerbatim: replyText(send), sentRecipients: sentRecipients || null,
    });
  }
  evidence.write("4-campaign", { verdict: "PASS", sentCount, sentRecipients, replyVerbatim: replyText(send), batchSha256 });

  // ---- Step 5: a reply ------------------------------------------------------
  await waitForEnter(`Founder: from one of your own inboxes, reply to one campaign email (recipient ${CAMPAIGN[0].recipient} or ${CAMPAIGN[1].recipient}) agreeing to the proposed time.`);
  const reply = await chat("Check my inbox for replies to the Gate 5 campaign. Classify any reply, tell me the stage change (before → after) and its source, and do not send any follow-up.");
  const replyCount = stateField(reply, "campaign.reply_count");
  if (replyCount !== 1) {
    fail(evidence, "5-reply", `expected exactly 1 counted reply after the founder's reply, state reports ${JSON.stringify(replyCount)}`, {
      replyVerbatim: replyText(reply),
    });
  }
  evidence.write("5-reply", { verdict: "PASS", replyCount, replyVerbatim: replyText(reply) });

  // ---- Step 6: suppression proof --------------------------------------------
  const optOutTarget = CAMPAIGN[1].recipient; // the other inbox vs Step 5's default
  await waitForEnter(`Founder: from your OTHER inbox (${optOutTarget}), reply to its campaign email with an opt-out: "stop — please don't email me".`);
  const supp = await chat("Apply any opt-out from the Gate 5 campaign now: suppress that address everywhere, remove its queued items, and tell me how many it had already been sent.");
  const suppressedAddr = stateField(supp, "suppression.address");
  if (suppressedAddr !== optOutTarget) {
    fail(evidence, "6-suppression", `suppressed address is ${JSON.stringify(suppressedAddr)}, expected the opted-out ${optOutTarget}`, {
      replyVerbatim: replyText(supp),
    });
  }
  assertAllowlisted(optOutTarget, "6-suppression");
  const requeue = await chat(`Queue one more Gate 5 test email to ${optOutTarget}.`);
  const blocked = stateField(requeue, "enqueue.blocked_reason");
  if (!blocked || !/suppress/i.test(String(blocked))) {
    fail(evidence, "6-suppression", "re-enqueue to the suppressed address was not rejected as suppressed (R-B3)", {
      replyVerbatim: replyText(requeue), blockedReason: blocked || null,
    });
  }
  evidence.write("6-suppression", {
    verdict: "PASS", suppressedAddress: suppressedAddr, reenqueueBlockedReason: blocked,
    replyVerbatim: replyText(supp), reenqueueReplyVerbatim: replyText(requeue),
  });

  // ---- Step 7: kill-switch proof ---------------------------------------------
  const before = await chat("Show the Gate 5 campaign queue state: sent, in-flight, and queued counts.");
  const halt = await chat("Stop everything.");
  const after = await chat("Show the Gate 5 campaign queue state again, and whether my global pause is on.");
  const sent = stateField(after, "queue.sent"), inFlight = stateField(after, "queue.in_flight_unconfirmed"),
    halted = stateField(after, "queue.halted"), total = stateField(after, "queue.total"),
    paused = stateField(after, "queue.global_pause");
  const reconciles = [sent, inFlight, halted, total].every((n) => Number.isInteger(n)) && sent + inFlight + halted === total;
  if (paused !== true || !reconciles) {
    fail(evidence, "7-killswitch", "kill switch not proven: global pause must be on and sent + in-flight + halted must reconcile to the queue total (R-A4; the SC-300 failure shape)", {
      beforeVerbatim: replyText(before), haltVerbatim: replyText(halt), afterVerbatim: replyText(after),
      counts: { sent, inFlight, halted, total, paused },
    });
  }
  evidence.write("7-killswitch", {
    verdict: "PASS", counts: { sent, inFlight, halted, total }, globalPause: paused,
    beforeVerbatim: replyText(before), haltVerbatim: replyText(halt), afterVerbatim: replyText(after),
  });

  evidence.summary({ verdict: "ALL STEPS PASS", ownerGoFingerprint: tokenFp, batchSha256 });
  console.log("[gate5] Gate 5 run complete: all steps PASS. Evidence in " + evidenceDir);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[gate5] unexpected error: ${err && err.message ? err.message : err}`);
    process.exit(5);
  });
}
