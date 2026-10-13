"use strict";
// SC-270 replay eval: a user-reported correction must stay in the Stripe CIR.
// Fails if the corrections_log entry or the amended referral claim regresses.
const test=require("node:test"); const assert=require("node:assert"); const fs=require("fs"); const path=require("path");
const cir=JSON.parse(fs.readFileSync(path.join(__dirname,"..","packages/career-data/cirs/stripe.json"),"utf8"));
const I=require("../packages/domain/125-career-intel.js"); const CI=I.CareerIntel||I;
test("SC-270 correction persisted in stripe.json",()=>{ assert.ok(Array.isArray(cir.corrections_log)&&cir.corrections_log.length>=1); const c=cir.corrections_log[cir.corrections_log.length-1]; assert.strictEqual(c.date,"2026-10-13"); assert.match(c.report,/referral/i); assert.match(cir.referral_weight_notes.statement,/Correction \(2026-10-13/); });
test("SC-270 patched file still validates",()=>{ const v=CI.validateCIR(cir); assert.ok(v.ok, JSON.stringify(v.errors).slice(0,300)); });
