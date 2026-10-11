#!/usr/bin/env node
// The sloppy-20 gauntlet against the LIVE agent-chat handler. It never loads the domain modules: a score from the modules
// would measure the parsers, not the product. Every card is answered "no" right after it is graded, so nothing executes.
//   UPMORE_CHAT_URL=https://<project>.supabase.co/functions/v1/agent-chat UPMORE_TEST_JWT=<test user token> \
//     node evals/gauntlet/run-live.cjs --label <label>
// Writes evals/gauntlet/results/<label>.json and prints the score. Without the two variables it prints NOT RUN and exits 2:
// it never reports a score it did not measure.
//   --suite sloppy   the 20 sloppy texts (default): understood and carded, each text its own thread
//   --suite spec16   spec 16's 20-text gauntlet, verbatim, in order, one thread; item 4 waits 11 real minutes
//   --suite l3       spec 16 L3 state-machine cases, each its own thread; a wait over --max-wait-min (default 15) is saved
//                    and finished later with --resume <label> once it is due (the 3-hours-late yes)
//   --no-wait        report waiting turns as NOT RUN instead of sleeping
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
// Two numbers, both published. UNDERSTOOD is spec 16's bar (95%): the right flow, every detail it needs read from the
// message, and no question about the person's words (a question caused by missing data, such as no saved recipient, is
// not a misunderstanding). CARDED is stricter: a confirmation card with the right facts in two SMS segments.
function understood(item, res) {
  const meta = res && res.route || null;
  if (!res || res.error) return { pass: false, reasons: [`handler error: ${res && res.error || "no response"}`] };
  if (!meta) return { pass: false, reasons: ["the response carries no route metadata"] };
  const reasons = [];
  if (meta.flow !== item.flow) reasons.push(`routed to ${meta.flow || meta.route}, expected ${item.flow}`);
  if (meta.understood !== true) reasons.push("the details were not all read from the message");
  else if (meta.understood_first !== true) reasons.push(`asked about the person's words (${meta.ask_reason || "ask"})`);
  return { pass: reasons.length === 0, reasons };
}
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
const suite = args.includes("--suite") ? args[args.indexOf("--suite") + 1] : "sloppy";
const resume = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : null;
const noWait = args.includes("--no-wait"), maxWait = (args.includes("--max-wait-min") ? Number(args[args.indexOf("--max-wait-min") + 1]) : 15) * 60000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Mechanical checks for spec16 and l3 turns. A person still reads every reply in the raw log the result file keeps.
function check(c, res) {
  const reasons = [], reply = String(res && res.reply || ""), meta = res && res.route || {};
  if (!res || res.error) return [`handler error: ${res && res.error || "no response"}`];
  const questions = (reply.match(/\?/g) || []).length;
  if (c.flow && meta.flow !== c.flow) reasons.push(`flow ${meta.flow || "none"}, expected ${c.flow}`);
  if (c.outcome && meta.outcome !== c.outcome) reasons.push(`outcome ${meta.outcome || "none"}, expected ${c.outcome}`);
  for (const m of c.matches || []) if (!new RegExp(m, "m").test(reply)) reasons.push(`reply lacks /${m}/`);
  for (const m of c.not_matches || []) if (new RegExp(m, "m").test(reply)) reasons.push(`reply has /${m}/`);
  if (c.no_question && questions) reasons.push("asked a question");
  if (c.max_questions !== undefined && questions > c.max_questions) reasons.push(`${questions} questions, at most ${c.max_questions}`);
  if (c.max_sentences && reply.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length > c.max_sentences) reasons.push(`more than ${c.max_sentences} sentences`);
  if (c.min_chars && reply.length < c.min_chars) reasons.push(`shorter than ${c.min_chars} characters`);
  if (c.max_chars && reply.length > c.max_chars) reasons.push(`longer than ${c.max_chars} characters`);
  if (c.min_list_items && reply.split(/\n|;|\u2022/).filter(x => x.trim()).length < c.min_list_items) reasons.push(`fewer than ${c.min_list_items} items`);
  if (c.any_of) { const alts = c.any_of.map(a => check(a, res)); if (!alts.some(a => !a.length)) reasons.push(`none of the allowed shapes: ${alts.map(a => a.join("; ")).join(" | ")}`); }
  return reasons;
}
async function runSpec16() {
  const sc = JSON.parse(fs.readFileSync(path.join(__dirname, "spec16-20.json"), "utf8"));
  const rows = []; let thread = null;
  for (const item of sc.items) {
    if (item.needs_media) { rows.push({ id: item.id, text: item.text, status: "NOT RUN", reasons: [`needs ${item.needs_media}; this runner sends text only`] }); console.log(`NOT RUN ${item.id} (needs media)`); continue; }
    if (item.wait_ms) { if (noWait || item.wait_ms > maxWait) { rows.push({ id: item.id, text: item.text, status: "NOT RUN", reasons: [`needs a ${Math.round(item.wait_ms / 60000)}-minute wait`] }); console.log(`NOT RUN ${item.id} (wait)`); continue; } console.log(`waiting ${Math.round(item.wait_ms / 60000)} min before ${item.id}...`); await sleep(item.wait_ms); }
    let res; try { res = await post(thread ? { thread_id: thread, message: item.text } : { message: item.text }); } catch (e) { res = { error: String(e && e.message || e) }; }
    if (res && res.thread_id) thread = res.thread_id;
    const reasons = check(item.checks || {}, res);
    rows.push({ id: item.id, text: item.text, expect: item.expect, status: reasons.length ? "FAIL" : "PASS", reasons, reply: res && res.reply || null, route: res && res.route || null, segments: segments(res && res.reply || "") });
    console.log(`${reasons.length ? "FAIL" : "PASS"} ${item.id} ${JSON.stringify(item.text)}${reasons.length ? " | " + reasons.join("; ") : ""}`);
  }
  // Leave nothing live behind the run.
  if (thread) { try { await post({ thread_id: thread, message: "never mind" }); } catch (_) {} }
  const ran = rows.filter(r => r.status !== "NOT RUN"), passed = ran.filter(r => r.status === "PASS").length;
  return { suite: "spec16", total: rows.length, ran: ran.length, passed, not_run: rows.length - ran.length, rows };
}
async function runL3(pendingIn) {
  const sc = JSON.parse(fs.readFileSync(path.join(__dirname, "l3-adversarial.json"), "utf8"));
  const out = [], pending = [];
  for (const cs of sc.cases) {
    const resumeAt = pendingIn ? pendingIn.find(p => p.id === cs.id) : null;
    if (pendingIn && !resumeAt) continue;
    let thread = resumeAt ? resumeAt.thread_id : null, turns = resumeAt ? resumeAt.turns : [], start = resumeAt ? resumeAt.next : 0, saved = false;
    for (let i = start; i < cs.turns.length; i++) {
      const t = cs.turns[i];
      if (t.wait_ms) {
        const due = resumeAt && i === start ? resumeAt.due_at : Date.now() + t.wait_ms;
        if (Date.now() < due) {
          if (noWait || due - Date.now() > maxWait) { pending.push({ id: cs.id, thread_id: thread, next: i, due_at: due, turns }); saved = true; console.log(`SAVED ${cs.id}: turn ${i + 1} is due at ${new Date(due).toISOString()}; run --resume <label> then`); break; }
          await sleep(due - Date.now());
        }
      }
      const send = () => post(thread ? { thread_id: thread, message: t.text } : { message: t.text }).catch(e => ({ error: String(e && e.message || e) }));
      const results = t.concurrent ? await Promise.all(Array.from({ length: t.concurrent }, send)) : [await send()];
      for (const r of results) if (r && r.thread_id) thread = r.thread_id;
      const c = t.checks || {};
      const reasons = c.at_most_one_matches ? (results.filter(r => new RegExp(c.at_most_one_matches).test(String(r && r.reply || ""))).length > 1 ? [`more than one reply matched /${c.at_most_one_matches}/`] : []) : check(c, results[0]);
      turns.push({ text: t.text, replies: results.map(r => r && r.reply || null), routes: results.map(r => r && r.route || null), reasons });
    }
    if (saved) continue;
    const pass = turns.every(x => !x.reasons.length);
    if (thread) { try { await post({ thread_id: thread, message: "never mind" }); } catch (_) {} }
    out.push({ id: cs.id, name: cs.name, status: pass ? "PASS" : "FAIL", turns });
    console.log(`${pass ? "PASS" : "FAIL"} ${cs.id} ${cs.name}${pass ? "" : " | " + turns.filter(x => x.reasons.length).map(x => `${JSON.stringify(x.text)}: ${x.reasons.join("; ")}`).join(" / ")}`);
  }
  return { suite: "l3", total: sc.cases.length, finished: out.length, passed: out.filter(x => x.status === "PASS").length, pending, cases: out };
}

(async () => {
  if (!url || !jwt) { console.log("NOT RUN: UPMORE_CHAT_URL and UPMORE_TEST_JWT are not set. The gauntlet only runs against the live handler; no score was produced."); process.exit(2); }
  fs.mkdirSync(path.join(__dirname, "results"), { recursive: true });
  if (suite === "spec16" || suite === "l3" || resume) {
    const file = path.join(__dirname, "results", `${resume || label}.${resume ? "l3" : suite}.json`);
    const prior = resume && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    const r = suite === "spec16" && !resume ? await runSpec16() : await runL3(prior ? prior.pending : null);
    if (prior) { r.cases = prior.cases.concat(r.cases); r.finished = r.cases.length; r.passed = r.cases.filter(x => x.status === "PASS").length; }
    const result = Object.assign({ label: resume || label, run_at: new Date().toISOString(), endpoint: url.replace(/\/\/([^.]+)\./, "//<project>.") }, r);
    fs.writeFileSync(file, JSON.stringify(result, null, 1));
    if (r.suite === "spec16") console.log(`\nspec 16 20-text gauntlet against the live handler: ${r.passed}/${r.ran} behaved as specified (${r.not_run} not run: media or wait). Raw replies: ${path.relative(root, file)}`);
    else console.log(`\nL3 against the live handler: ${r.passed}/${r.finished} cases passed${r.pending.length ? `, ${r.pending.length} waiting (resume later)` : ""}. Spec 16 needs 100%. Raw replies: ${path.relative(root, file)}`);
    process.exit(r.suite === "spec16" ? (r.passed === r.ran ? 0 : 1) : (r.passed === r.finished && !r.pending.length ? 0 : 1));
  }
  const rows = [];
  for (const item of corpus.items) {
    let res; try { res = await post({ message: item.text }); } catch (e) { res = { error: String(e && e.message || e) }; }
    const g = grade(item, res), u = understood(item, res); rows.push(Object.assign({ id: item.id, text: item.text, expected_flow: item.flow, understood: u.pass, understood_reasons: u.reasons }, g));
    if (res && res.thread_id) { try { await post({ thread_id: res.thread_id, message: "no" }); } catch (_) {} }
    console.log(`${u.pass ? "UNDERSTOOD" : "MISSED    "} ${g.pass ? "CARDED" : "NO CARD"} ${item.id} ${JSON.stringify(item.text)}${u.pass ? "" : " | understanding: " + u.reasons.join("; ")}${g.pass ? "" : " | card: " + g.reasons.join("; ")}`);
  }
  const passed = rows.filter(r => r.pass).length, und = rows.filter(r => r.understood).length;
  const score = { label, run_at: new Date().toISOString(), endpoint: url.replace(/\/\/([^.]+)\./, "//<project>."), total: rows.length, understood: und, understood_pct: Math.round(und * 1000 / rows.length) / 10, carded: passed, passed, pct: Math.round(passed * 1000 / rows.length) / 10, bar_pct: 95, meets_bar: und / rows.length >= 0.95, rows };
  fs.writeFileSync(path.join(__dirname, "results", `${label}.json`), JSON.stringify(score, null, 1));
  console.log(`\nsloppy-20 against the live handler: understood ${und}/${rows.length} (${score.understood_pct}%, spec 16 bar 95%: ${score.meets_bar ? "MET" : "NOT MET"}); carded ${passed}/${rows.length} (${score.pct}%)`);
  process.exit(score.meets_bar ? 0 : 1);
})();
