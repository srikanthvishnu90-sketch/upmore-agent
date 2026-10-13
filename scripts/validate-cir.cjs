// Standalone CIR validator: node scripts/validate-cir.cjs <cir.json> [...more]
// Exit 0 = every file's facts validate; prints per-file OK/FAIL with reasons.
"use strict";
const fs = require("fs");
const _m = require("../packages/domain/125-career-intel.js");
const Intel = _m.CareerIntel || _m;
let bad = 0;
for (const f of process.argv.slice(2)) {
  let cir; try { cir = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.log(`FAIL ${f}: unreadable (${e.message})`); bad++; continue; }
  const v = Intel.validateCIR(cir);
  if (v && v.ok) console.log(`OK   ${f}`);
  else { bad++; console.log(`FAIL ${f}: ${JSON.stringify((v && (v.errors || v.reasons)) || v).slice(0, 400)}`); }
}
process.exit(bad ? 1 : 0);
