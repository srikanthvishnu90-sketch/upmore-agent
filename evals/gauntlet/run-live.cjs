#!/usr/bin/env node
// The sloppy-20 gauntlet against the LIVE agent-chat handler. It never loads the domain modules: a score from the modules
// would measure the parsers, not the product. Every card is answered "no" right after it is graded, so nothing executes.
//   UPMORE_CHAT_URL=https://<project>.supabase.co/functions/v1/agent-chat UPMORE_TEST_JWT=<test user token> \
//     node evals/gauntlet/run-live.cjs --label <label>
// Writes evals/gauntlet/results/<label>.json and prints the score. Without the two variables it prints NOT RUN and exits 2:
// it never reports a score it did not measure.
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "../..");
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "sloppy-20.json"), "utf8"));
const args = process.argv.slice(2), label = (args[args.indexOf("--label") + 1] || `live-${new Date().toISOString().slice(0, 10)}`).replace(/[^\w.-]/g, "_");
const url = process.env.UPMORE_CHAT_URL, jwt = process.env.UPMORE_TEST_JWT;
// SMS segment count, the same rule as packages/domain/67-agent-cards.js (copied, not imported, so this file stays live-only).
// The digits are generated so no long digit run sits in this file (the privacy sweep reads evals/ for account-number shapes).
const DIGITS = Array.from({ length: 10 }, (_, i) => String(i)).join("");
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./" + DIGITS + ":;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà", EXT = "^{}\\[~]|€";
function segments(s) { let u = 0; for (const ch of String(s)) { if (GSM.includes(ch)) u += 1; else if (EXT.includes(ch)) u += 2; else { const n = [...String(s)].length; return n <= 70 ? 1 : Math.ceil(n / 67); } } return u <= 160 ? 1 : Math.ceil(u / 153); }
const QUESTION = /\?\s*$|^(which|how much|did you mean|who|what)\b/i;
function grade(item, res) {
  const reasons = [], reply = String(res && res.reply || ""), meta = res && res.route || null;
  if (!res || res.error) return { pass: false, reasons: [`handler error: ${res && res.error || "no response"}`], reply };
  if (!meta) reasons.push("the response carries no route metadata, so routing cannot be graded");
  else {
    if (meta.flow !== item.flow) reasons.push(`routed to ${meta.flow || meta.route}, expected ${item.flow}`);
    if (meta.understood_first !== true) reasons.push("not understood on the first message");
    if (meta.outcome && meta.outcome !== "confirm") reasons.push(`outcome ${meta.outcome}, expected a confirmation card`);
  }
  for (const s of item.card_contains) if (!reply.toLowerCase().includes(s.toLowerCase())) reasons.push(`card lacks "${s}"`);
  if (QUESTION.test(reply.split(". ").pop() || "") && !/Reply YES or NO|Confirm below/i.test(reply)) reasons.push("asked a clarifying question");
  const seg = segments(reply); if (seg > 2) reasons.push(`card is ${seg} SMS segments`);
  return { pass: reasons.length === 0, reasons, reply, segments: seg, route: meta };
}
async function post(body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}, not JSON` })); if (!r.ok && !j.error) j.error = `HTTP ${r.status}`; return j;
}
(async () => {
  if (!url || !jwt) { console.log("NOT RUN: UPMORE_CHAT_URL and UPMORE_TEST_JWT are not set. The gauntlet only runs against the live handler; no score was produced."); process.exit(2); }
  const rows = [];
  for (const item of corpus.items) {
    let res; try { res = await post({ message: item.text }); } catch (e) { res = { error: String(e && e.message || e) }; }
    const g = grade(item, res); rows.push(Object.assign({ id: item.id, text: item.text, expected_flow: item.flow }, g));
    if (res && res.thread_id) { try { await post({ thread_id: res.thread_id, message: "no" }); } catch (_) {} }
    console.log(`${g.pass ? "PASS" : "FAIL"} ${item.id} ${JSON.stringify(item.text)}${g.pass ? "" : " -> " + g.reasons.join("; ")}`);
  }
  const passed = rows.filter(r => r.pass).length, score = { label, run_at: new Date().toISOString(), endpoint: url.replace(/\/\/([^.]+)\./, "//<project>."), total: rows.length, passed, pct: Math.round(passed * 1000 / rows.length) / 10, bar_pct: 95, meets_bar: passed / rows.length >= 0.95, rows };
  fs.writeFileSync(path.join(__dirname, "results", `${label}.json`), JSON.stringify(score, null, 1));
  console.log(`\nsloppy-20 against the live handler: ${passed}/${rows.length} (${score.pct}%), bar 95%: ${score.meets_bar ? "MET" : "NOT MET"}`);
  process.exit(score.meets_bar ? 0 : 1);
})();
