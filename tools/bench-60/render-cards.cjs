"use strict";
/* BENCH-60 harness — render the bench's outcomes through module 175's
   card path (harness code, NOT product code). For every leg, the
   stored run record (career_batch_run/v1 wrapper, exactly as the
   executor's store held it) is handed to 175's buildBatchCard. 175
   renders ONLY a batch that carries a card set hash — a batch with at
   least one doorstep / attestation-pending application (155's cardSha
   is null otherwise, by design: a card is an approval surface and a
   stopped application has nothing approvable). Legs 175 cannot render
   are named with its verdict code and represented in the artifact by
   their 155 summary outcome line — never silently dropped.
   Usage: node render-cards.cjs <bench-record.json> <artifact.txt> <summary.json> */
const fs = require("node:fs");
const crypto = require("node:crypto");
const Ui = require("/home/hatch/workspace/fe-approval-ui-wt/packages/domain/175-career-approval-ui.js");
const UI175_SHA = crypto.createHash("sha256").update(fs.readFileSync("/home/hatch/workspace/fe-approval-ui-wt/packages/domain/175-career-approval-ui.js")).digest("hex");
const record = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const sections = [];
const perLeg = [];
let rendered = 0;
const counts = {};
for (const leg of record.legs) {
  let stored = null;
  try { const r = JSON.parse(fs.readFileSync(leg.resultPath, "utf8")); stored = r.stored || null; } catch (_) {}
  const head = `--- leg ${leg.idx}: ${leg.company} — ${leg.title} [${leg.key}]`;
  if (!stored || !stored.run) {
    perLeg.push({ idx: leg.idx, rendered: false, code: "NO_RUN_RECORD" });
    counts.NO_RUN_RECORD = (counts.NO_RUN_RECORD || 0) + 1;
    sections.push(`${head}\nOUTCOME (bench class: ${leg.benchClass || leg.outcomeClass || "?"}): no run record (leg exit ${leg.exitCode}${leg.inFlightAtWindowEnd ? ", in flight at window end" : ""}; board calls ${leg.boardCalls}, fills ${leg.fills}, call errors ${JSON.stringify(leg.callErrors || [])})`);
    continue;
  }
  const res = Ui.buildBatchCard({ run: stored, world: "TEST bench — executor stored record, TEST profile only; submit flag OFF", basisAnswers: [] });
  if (res.ok) {
    rendered++;
    perLeg.push({ idx: leg.idx, rendered: true, cardSha256: res.card.cardSha256 });
    sections.push(`${head}\n${res.card.text}`);
  } else {
    const sm = stored.run.summary || {};
    const stop = (sm.stops || [])[0];
    const app = Object.values(stored.run.apps || {})[0] || {};
    perLeg.push({ idx: leg.idx, rendered: false, code: res.code, stage: app.stage || null, stopCode: stop ? stop.code : null });
    counts[res.code] = (counts[res.code] || 0) + 1;
    sections.push(`${head}\nOUTCOME (175 cannot render: ${res.code} — ${res.reason}): stage=${app.stage || "?"} stop=${stop ? `${stop.code} — ${stop.reason}` : "none"}`);
  }
}
const artifact = [
  `BENCH-60 rendered cards — ${record.label} — ${record.startedAt} -> ${record.endedAt}`,
  `legs: ${record.legs.length} · completed prepares: ${record.completedCount} · rendered via module 175: ${rendered} · not renderable: ${JSON.stringify(counts)}`,
  `module 175 file sha256: ${UI175_SHA}`,
  "",
  ...sections,
  "",
].join("\n");
fs.writeFileSync(process.argv[3], artifact);
const sha = crypto.createHash("sha256").update(artifact).digest("hex");
const summary = { artifact: process.argv[3], sha256: sha, legs: record.legs.length, rendered, notRendered: counts, module175Sha256: UI175_SHA, perLeg };
fs.writeFileSync(process.argv[4], JSON.stringify(summary, null, 1));
console.log("CARDS_DONE " + JSON.stringify({ rendered, notRendered: counts, sha256: sha }));
