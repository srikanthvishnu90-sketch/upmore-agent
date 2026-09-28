// Cancel-watcher merchant-matching fixtures.
// Extracts normalizeMerchant + txnMatchesMerchant from the REAL
// supabase/functions/cancel-watcher/index.ts (no copies) and exercises them
// against realistic statement descriptors. Run: node tests/execution/watcher-match.js
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  path.join(here, "../../supabase/functions/cancel-watcher/index.ts"), "utf8");

function extract(name) {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`function ${name} not found in cancel-watcher/index.ts`);
  // naive brace-balance extraction
  let depth = 0, start = src.indexOf("{", i), j = start;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    if (src[j] === "}") { depth--; if (!depth) break; }
  }
  return src.slice(i, j + 1)
    .replace(/: string/g, "").replace(/: boolean/g, "").replace(/: any/g, "");
}

const normSrc = extract("normalizeMerchant");
const matchSrc = extract("txnMatchesMerchant");
const normalizeMerchant = new Function(`${normSrc}; return normalizeMerchant;`)();
const txnMatchesMerchant = new Function(
  `${normSrc}; ${matchSrc}; return txnMatchesMerchant;`)();

const cases = [
  // [descriptor, merchantKey, merchantName, expect, why]
  ["NETFLIX.COM 866-579-7172 CA", "netflix", "Netflix", true, "standard descriptor"],
  ["Spotify USA", "spotify", "Spotify", true, "standard descriptor"],
  ["AMZN MKTP US*PRIME", "amazon_prime", "Amazon Prime", true, "abbreviated AMZN descriptor (was a miss pre-fix)"],
  ["HULU 877-8244858 CA", "hulu", "Hulu", true, "standard descriptor"],
  ["APPLE.COM/BILL", "apple_music", "Apple Music", true, "whole-word apple"],
  ["WHOLEFDS MKT 10234", "netflix", "Netflix", false, "unrelated merchant"],
  ["NETFLIX", "spotify", "Spotify", false, "cross-merchant"],
  ["CHULU VISTA CA 92123", "hulu", "Hulu", false, "substring trap: chulu contains hulu"],
  ["", "netflix", "Netflix", false, "empty descriptor"],
  ["PRIME VIDEO", "amazon_prime", "Amazon Prime", true, "prime whole word"],
];

let pass = 0, fail = 0;
for (const [d, k, n, exp, why] of cases) {
  const got = txnMatchesMerchant(d, k, n);
  if (got === exp) pass++;
  else { fail++; console.log(`FAIL [${why}]: ${JSON.stringify(d)} vs ${k} — expected ${exp}, got ${got}`); }
}
console.log(`watcher-match: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
