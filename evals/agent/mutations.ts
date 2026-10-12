// The testing agent tests itself: each defect below is planted in the shipped code, one at a time, and the agent must turn
// the named check red (CRITICAL or FAIL). A check that stays green under its defect is not a check. Defects are planted in
// a throwaway copy of the repo, never in the working tree, so other checks running at the same time (the evidence recorder
// runs them in parallel) always read the real files.
//   deno run -A evals/agent/mutations.ts
const repo = new URL("../../", import.meta.url);
const tmp = await Deno.makeTempDir({ prefix: "upmore-mutations-" });
for (const part of ["evals", "supabase", "packages", "docs", "tests", "scripts", "corpus", "src", "img", "connect", "index.html"]) {
  const r = new Deno.Command("cp", { args: ["-R", decodeURIComponent(new URL(part, repo).pathname), tmp + "/"] }).outputSync();
  if (r.code !== 0) { console.error(`could not copy ${part}: ${new TextDecoder().decode(r.stderr)}`); Deno.exit(2); }
}
const root = new URL(`file://${tmp}/`);
const RC = "supabase/functions/_shared/router_core.js";
const DEFECTS: { id: string; check: string; what: string; file: string; find: string; replace: string }[] = [
  { id: "M01", check: "O-18", what: "an envelope skips the yes again", file: RC, find: 'if (!(policy && policy.envelope_autonomy === true)) return { allowed: true, confirm: true, reason: "fresh_approval_rule", envelope: env.id };', replace: "" },
  { id: "M02", check: "O-10", what: "the $5 cap is not said before the card", file: RC, find: 'if (capC !== null && capEst(parsed.notional_cents && type === "market") > capC)', replace: "if (false)" },
  { id: "M03", check: "O-14", what: "a working order is not settled, so a second yes reaches the model", file: RC, find: '"placed", "working", "partial", "declined"', replace: '"placed", "declined"' },
  { id: "M04", check: "R-07", what: "charges present from the start of history are called new", file: RC, find: "&& !(historyStart && daysBetween(historyStart, r.firstDate) <= stepOf(r.interval))", replace: "" },
  { id: "M05", check: "R-08", what: "monitor amounts lose their thousands separator", file: RC, find: 'const usd = v => "$" + Math.abs(Number(v)).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");', replace: 'const usd = v => "$" + Math.abs(Number(v)).toFixed(2);' },
  { id: "M06", check: "F:ALRT-011", what: "quiet hours are ignored", file: RC, find: "function inQuiet(now, quiet) { if (!quiet || !now) return false;", replace: "function inQuiet(now, quiet) { if (true) return false;" },
  { id: "M07", check: "O-15", what: "the model's false money claims are not corrected", file: "supabase/functions/_shared/claim_guard.ts", find: "if (!CLAIM.test(text) || text.includes(CORRECTION))", replace: "if (true)" },
  { id: "M08", check: "O-20", what: "identity digits are stored and sent to the model", file: "supabase/functions/agent-chat/_shared/chat_input.ts", find: "const text = red.text;", replace: 'const text = typeof message === "string" ? message.trim() : "";' },
  { id: "M09", check: "O-17", what: "the trial message no longer asks before cancelling", file: "supabase/functions/_shared/proactive.ts", find: "const text = offer ? `${p.text} Should I cancel it for you? Reply YES or NO.` : p.text;", replace: "const text = p.text;" },
  { id: "M11", check: "D-07", what: "the connect link is run into the sentence, so no card is drawn", file: RC, find: "return `${o.lead || LEAD}\\n\\n${url(provider, o.base)}`;", replace: "return `${o.lead || LEAD} ${url(provider, o.base)}`;" },
  { id: "M12", check: "D-08", what: "a company with no logo gets a letter tile again", file: "src/upmore-app-template.html", find: 'return `<span class="appicon" style="display:none" aria-hidden="true"></span>`;', replace: 'return `<span class="appicon">${esc((name || "?").trim().charAt(0).toUpperCase())}</span>`;' },
  { id: "M10", check: "L-00", what: "the live guard lets a $10 order through", file: "evals/agent/live_guard.ts", find: "o.cents > ORDER_CAP_CENTS)", replace: "o.cents > ORDER_CAP_CENTS * 2)" },
];
let caught = 0;
for (const d of DEFECTS) {
  const url = new URL(d.file, root), original = Deno.readTextFileSync(url);
  if (!original.includes(d.find)) { console.log(`${d.id} NOT PLANTED: the text to change is gone from ${d.file}; update the defect`); continue; }
  let out = "";
  try {
    Deno.writeTextFileSync(url, original.replace(d.find, d.replace));
    const r = new Deno.Command("deno", { args: ["run", "-A", "evals/agent/run.ts", "--dry"], cwd: root, stdout: "piped", stderr: "piped" }).outputSync();
    out = new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr);
  } finally { Deno.writeTextFileSync(url, original); } // restores the copy for the next defect
  const hit = new RegExp(`^\\s+(CRITICAL|FAIL) ${d.check.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} `, "m").test(out);
  if (hit) caught++;
  console.log(`${d.id} ${hit ? "caught" : "MISSED"} by ${d.check}: ${d.what}`);
}
Deno.removeSync(tmp, { recursive: true });
console.log(`testing agent mutations: ${caught}/${DEFECTS.length} caught`);
if (caught !== DEFECTS.length) Deno.exit(1);
