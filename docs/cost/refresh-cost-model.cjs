"use strict";
/* refresh-cost-model.cjs — recompute the O5 cost-per-user model from
   cost-model-inputs.json. No network, no dependencies.
   Usage: node docs/cost/refresh-cost-model.cjs [inputs.json]
   Every input in the JSON carries a MEASURED / ESTIMATE / NOT_COUNTED
   label; the script prints the labels beside the numbers it derives.
   When a better measurement lands (live token metering via the hook in
   metering-hook-spec-2026-10-21.md, a session-reuse drive time, a real
   host invoice), edit the JSON and re-run — the doc's tables are this
   script's output. */
const fs = require("node:fs");
const path = require("node:path");

const inputsPath = process.argv[2] || path.join(__dirname, "cost-model-inputs.json");
const I = JSON.parse(fs.readFileSync(inputsPath, "utf8"));

const usd = (n, dp = 4) => "$" + n.toFixed(dp);
const hostPerHour = I.host.usd_per_month / I.host.hours_per_month;
const hostPerSecond = hostPerHour / 3600;

// ---- per-application legs ----
function perApplication(drivesPerApp) {
  const driveSeconds = drivesPerApp * I.drive.seconds_per_drive;
  const drive = driveSeconds * hostPerSecond;
  const nonDriveSeconds = I.non_drive_compute.seconds_per_50_batch / 50;
  const nonDrive = nonDriveSeconds * hostPerSecond;
  const t = I.tokens.essay_draft;
  const essayPerApp =
    t.drafts_per_application_headline *
    t.expected_calls_per_draft *
    ((t.input_tokens_per_call * t.price_input_per_million +
      t.output_tokens_per_call * t.price_output_per_million) / 1e6);
  return {
    drivesPerApp,
    driveSeconds,
    drive,
    nonDriveSeconds,
    nonDrive,
    essayPerApp,
    total: drive + nonDrive + essayPerApp,
    totalNoEssay: drive + nonDrive,
  };
}

const today = perApplication(I.drive.drives_per_application_today);
const reuse = perApplication(1);

// ---- per-user per-month ----
const capPerMonth = I.cap.applications_per_day * I.cap.days_per_month;
const pack = I.provisioned_view.lane_packing_efficiency;
function perUser(perApp, utilization) {
  const apps = Math.round(capPerMonth * utilization);
  return { apps, marginal: apps * perApp.total, marginalNoEssay: apps * perApp.totalNoEssay };
}
function perUserProvisioned(perApp, utilization) {
  const apps = Math.round(capPerMonth * utilization);
  const provisionedPerApp = perApp.totalNoEssay / pack + (perApp.total - perApp.totalNoEssay);
  return { apps, provisioned: apps * provisionedPerApp };
}

// ---- Tsenta ----
const tsentaPerApp = I.tsenta_starter.usd_per_month / I.tsenta_starter.applications_per_cycle;

// ---- report ----
const L = [];
L.push(`COST MODEL REFRESH — inputs as of ${I.as_of} (${path.basename(inputsPath)})`);
L.push("");
L.push("INPUTS");
L.push(`  drive: ${I.drive.seconds_per_drive}s/drive [${I.drive.seconds_per_drive_label}], x${I.drive.drives_per_application_today} drives/application today [${I.drive.drives_per_application_today_label}]`);
L.push(`  host: ${usd(I.host.usd_per_month, 2)}/month, ${I.host.hours_per_month}h -> ${usd(hostPerHour)}/drive-hour [${I.host.label}]`);
L.push(`  non-drive compute: ${I.non_drive_compute.seconds_per_50_batch}s per 50-batch [${I.non_drive_compute.label}]`);
L.push(`  tokens, apply composition: ${I.tokens.composition_tokens_per_application} per application [${I.tokens.composition_label}]`);
L.push(`  tokens, essay draft: ${I.tokens.essay_draft.expected_calls_per_draft} calls x (${I.tokens.essay_draft.input_tokens_per_call} in / ${I.tokens.essay_draft.output_tokens_per_call} out) per drafted answer [${I.tokens.essay_draft.label}]`);
L.push("");
L.push("PER APPLICATION");
L.push(`  headline (x${today.drivesPerApp} drives): drive ${today.driveSeconds}s = ${usd(today.drive)} · non-drive ${usd(today.nonDrive)} · essay ${usd(today.essayPerApp)} (only when a written answer is drafted) · TOTAL ${usd(today.total)} (${usd(today.totalNoEssay)} with no drafted answer)`);
L.push(`  session-reuse (x${reuse.drivesPerApp} drive): drive ${reuse.driveSeconds}s = ${usd(reuse.drive)} · TOTAL ${usd(reuse.total)} (${usd(reuse.totalNoEssay)} with no drafted answer)`);
L.push("");
L.push("PER ACTIVE USER PER MONTH (marginal, perfectly packed lanes)");
L.push(`  cap = ${I.cap.applications_per_day}/day x ${I.cap.days_per_month} days = ${capPerMonth} applications at 100%`);
for (const u of I.cap.utilizations) {
  const a = perUser(today, u), b = perUser(reuse, u), p = perUserProvisioned(today, u);
  L.push(`  ${Math.round(u * 100)}% of cap (${a.apps} apps): headline ${usd(a.marginal, 2)} · session-reuse ${usd(b.marginal, 2)} · provisioned view (packing ${pack}) ${usd(p.provisioned, 2)}`);
}
L.push("");
L.push("PER 1,000 ACTIVE USERS PER MONTH at 100% of cap");
{
  const a = perUser(today, 1), p = perUserProvisioned(today, 1);
  const driveHours = (a.apps * 1000 * today.driveSeconds) / 3600;
  L.push(`  ${a.apps * 1000} applications · marginal ${usd(a.marginal * 1000, 0)} · provisioned view ${usd(p.provisioned * 1000, 0)} · drive load ${Math.round(driveHours).toLocaleString()} host-hours = ${Math.ceil(driveHours / I.host.hours_per_month)} hosts perfectly packed, ${Math.ceil(driveHours / pack / I.host.hours_per_month)} at packing ${pack}`);
}
L.push("");
L.push("HEAD-TO-HEAD — Tsenta Starter (PUBLIC, baseline doc)");
L.push(`  Tsenta: ${usd(I.tsenta_starter.usd_per_month, 2)}/month for ${I.tsenta_starter.applications_per_cycle} applications = ${usd(tsentaPerApp)} per application`);
L.push(`  Trainee marginal: ${usd(today.total)} per application (headline) / ${usd(reuse.total)} (session-reuse) -> Tsenta's per-application price is ${(tsentaPerApp / today.total).toFixed(1)}x / ${(tsentaPerApp / reuse.total).toFixed(1)}x ours`);
L.push(`  Trainee at Tsenta's volume (${I.tsenta_starter.applications_per_cycle} apps): marginal ${usd(today.total * I.tsenta_starter.applications_per_cycle, 2)} vs Tsenta's ${usd(I.tsenta_starter.usd_per_month, 2)}`);
L.push(`  Trainee user at 100% of our 15/day cap (${capPerMonth} apps): marginal ${usd(perUser(today, 1).marginal, 2)}/month, provisioned view ${usd(perUserProvisioned(today, 1).provisioned, 2)}/month — both under Tsenta's ${usd(I.tsenta_starter.usd_per_month, 2)}`);
L.push("");
L.push("NOT_COUNTED (by design, see doc): Supabase (flat plan, unmetered per application) · egress (unmetered today) · chat-turn model spend (metered per turn in production, not attributable per application until the hook lands)");
console.log(L.join("\n"));
