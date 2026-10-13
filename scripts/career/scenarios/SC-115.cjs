"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-115", "stripe-application-status");
  s.user("What happened with my Stripe application?");
  const log = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/fixtures/test-application-log.json"), "utf8"));
  const inbox = JSON.parse(fs.readFileSync(path.join(L.ROOT, "packages/career-data/fixtures/test-inbox.json"), "utf8"));
  const rows = A3.statusAnswer(log, inbox, "Stripe");
  s.tool("132.statusAnswer over TEST application log + TEST inbox fixtures", rows);
  s.agent(`From your application log, cross-checked against your inbox (TEST fixtures — no real application exists; the shapes are the tracker seam): you have ${rows.length} Stripe applications. ${rows.map((x) => `${x.title} (applied ${x.applied_at}, variant ${x.variant_id}): stage = ${x.stage.toUpperCase()} — proof: log events ${x.log_events.join(" → ")}, inbox messages ${x.inbox_proof.map((m) => m.msg_id + " (" + m.kind + ")").join(", ")}`).join(" | ")}. Every stage I just stated traces to a log entry AND an inbox message id — that pairing is the proof, not my say-so.`, { card: { title: "Stripe applications — log + inbox", applications: rows } });
  s.verify("each answer row carries its app_id, log events and inbox msg_ids from the fixtures themselves", { rows: rows.length, all_have_proof: rows.every((x) => x.inbox_proof.length >= 1) });
  await s.finish({ status: rows.length === 4 && rows.every((x) => x.inbox_proof.length) ? "COMPLETE" : "LEARN", outcome: `Stripe status answered for all ${rows.length} logged applications, each with log-entry + inbox-message proof ids (TEST log/inbox seam, flagged for the 126 tracker)` });
})().catch((e) => { console.error(e); process.exit(1); });
