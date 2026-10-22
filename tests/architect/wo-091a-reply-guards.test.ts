// WO-091a: the reply guards at the end of the agent turn (audit chat-brain F5, F6, F10; brutal battery run 39500971945).
//   F5  the claim check deleted correct answers (BR-062 "is the SWE market bad", BR-036's shorter draft, BR-042's refusal)
//       and replaced them with a promise ("Tell me again and I'll do it"). A claim is first-person past or present-perfect
//       action language; advice and imperatives are not; a negation anywhere clears it. An unbacked claim that stands
//       after the one rewrite loses only its own sentences; with nothing left the reply says "I didn't change anything".
//   F6  chat replies invented facts about the person (BR-032 "Excel", BR-024's cover letter). Every sentence about the
//       person must trace to confirmed facts, their own words or this turn's tool results (the essay fact lock); what
//       does not is put to the model once, then bracketed by code.
//   F10 tool names, raw job ids, uuids and JSON field names reached the person (BR-001, BR-008, BR-021, BR-041, BR-064,
//       BR-077, BR-090). They are put to the model once, then replaced by code.
// Every model here is scripted; nothing calls a provider.
import { CLAIM_UNBACKED_REPLY, runAgentTurn, unbackedClaim, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

// The battery's persona (evals/career/brutal/scenarios.json, TEST data): no Excel, no ETL, no Tableau anywhere.
const PERSONA = [
  { id: "f1", kind: "education", text: "Senior at Lakeview State University, B.S. in Computer Science, graduating May 2027", status: "confirmed" },
  { id: "f2", kind: "experience", text: "Software engineering intern at Copperline Infra, summer 2025: built a Python service that cut report time from 2 hours to 15 minutes", status: "confirmed" },
  { id: "f3", kind: "skill", text: "Python, SQL, React, and 1 year of Java", status: "confirmed" },
  { id: "f4", kind: "experience", text: "Treasurer of the Lakeview State finance club, managed a $4,000 budget", status: "confirmed" },
  { id: "f5", kind: "location", text: "Lives in Chicago, IL", status: "confirmed" },
];
const profile = (extra: any[] = []) => ({ facts: [...PERSONA, ...extra] });

const tool = (name: string, effect: ToolSpec["effect"], out: unknown = { ok: true }, fail = false): ToolSpec => ({
  name, effect, description: name, input_schema: { type: "object", properties: {}, required: [] },
  run: async () => { if (fail) throw new Error("no"); return out; },
});
const POSTINGS = [
  { job_id: "greenhouse:copperlineinfra:4100016", company: "Copperline Infra", title: "Software Engineer, Platform", url: "https://boards.greenhouse.io/copperlineinfra/jobs/4100016" },
  { job_id: "lever:fieldnote:77aa", company: "Fieldnote Software", title: "Backend Engineer, New Grad", url: "https://jobs.lever.co/fieldnote/77aa" },
];
const TOOLS = [
  tool("get_profile", "read", { facts: PERSONA }), tool("get_memory", "read", { standing: [] }), tool("get_posting", "read", POSTINGS[0]),
  tool("search_jobs", "read", { results: POSTINGS }), tool("referral_map", "read", { firms: [] }),
  tool("remember_instruction", "write_own"), tool("set_job_alerts", "write_own"), tool("queue_applications", "write_own"),
  tool("add_profile_fact", "write_own", null, true), tool("track_application", "write_own"),
];
function scripted(steps: any[][]) {
  const seen: any[] = [];
  let i = 0;
  const model = async (p: any) => { seen.push(JSON.parse(JSON.stringify(p))); const c = steps[Math.min(i++, steps.length - 1)]; return { content: c, stop_reason: "end_turn" }; };
  return { model, seen, calls: () => i };
}
const text = (t: string) => [{ type: "text", text: t }];
const use = (name: string, id = name) => [{ type: "tool_use", id, name, input: {} }];
const run = (m: any, message: string, o: { history?: any[]; facts?: any } = {}) =>
  runAgentTurn({ system: "s", history: o.history ?? [], message, tools: TOOLS, model: m.model, ctx: { userId: "u", threadId: "t", now: 0, state: { profile: o.facts ?? profile() } } });
const lastTold = (m: any) => JSON.stringify(m.seen.at(-1).system); // WO-061: the review is in the retry's system prompt
// "Excel" outside any [bracket].
const bare = (reply: string, word: string) => new RegExp(`\\b${word}\\b`, "i").test(reply.replace(/\[[^\]]*\]/g, ""));

// ------------------------------------------------------------------------------------------------ F5: the claim check
Deno.test("WO-091a/F5.1 BR-062: market advice that says 'keep job alerts on' and 'as I noted' is not a claim: returned unchanged, one call", async () => {
  const reply = "It's tougher than 2021, but new-grad hiring hasn't stopped. Keep job alerts on for new grad roles so you hear about openings early. " +
    "As I noted earlier, a measured result beats a list of tasks. Set an alert for backend roles in Chicago if you want daily matches.";
  const m = scripted([use("get_profile"), text(reply)]);
  const r = await run(m, "Is the SWE market bad right now?");
  eq(r.reply, reply);
  eq(m.calls(), 2, "no check call");
});

Deno.test("WO-091a/F5.2 advice and imperatives are not claims; a negation anywhere clears one", () => {
  for (const s of [
    "Keep job alerts on for new grad roles.",
    "Set an alert for data analyst roles in Chicago.",
    "Turn alerts on if you want daily matches.",
    "As I noted earlier, your internship is the strongest line.",
    "Queue the two you like best and I'll prepare them.",
    "I've saved nothing this time.",
    "I queued none of them.",
    "Your alerts are now live only once you approve them.",
    "I've set up nothing new, so your alerts are as they were.",
  ]) eq(unbackedClaim(s, []), null, s);
});

Deno.test("WO-091a/F5.3 first-person past and present-perfect action language is a claim (typographic apostrophes too)", () => {
  const ok = (name: string, effect: "write_own" | "read" = "write_own") => [{ name, ok: true, effect }];
  assert(unbackedClaim("I’ve set an alert for remote backend roles.", []), "I’ve set an alert");
  eq(unbackedClaim("I’ve set an alert for remote backend roles.", ok("set_job_alerts")), null);
  assert(unbackedClaim("I set alerts for remote backend engineering roles only.", ok("get_profile", "read")), "I set alerts");
  assert(unbackedClaim("Done — alerts are on for data roles in Chicago.", []), "Done — alerts");
  assert(unbackedClaim("Queued 1 application for your approval.", []), "Queued 1");
  assert(unbackedClaim("I queued 3 applications.", []), "I queued");
  assert(unbackedClaim("I saved your preference for remote roles.", ok("get_memory", "read")), "I saved");
  assert(unbackedClaim("Standing setting saved: keywords new grad data.", []), "setting saved:");
  // Nothing external ever runs inside the turn, so "I sent" is never backed.
  assert(unbackedClaim("I sent the email to the recruiter.", ok("set_job_alerts")), "I sent");
  assert(unbackedClaim("I've applied you to the Stripe role.", ok("queue_applications")), "I've applied you");
  // One sentence, two claims: the backed one does not cover the other.
  eq(unbackedClaim("Alerts are now on and I sent the email to the recruiter.", ok("set_job_alerts")), "something sent or applied for");
});

// Review of PR #123: a negation clears a claim only in the claim's own clause, before it or directly on it. A negation
// in another clause ("…, but nothing was sent") leaves the claim standing.
Deno.test("WO-091a/F5.3b a negation in another clause does not clear a claim; one in its own clause does", () => {
  const read = [{ name: "get_memory", ok: true, effect: "read" as const }];
  eq(unbackedClaim("I've saved your preference, but nothing was sent.", read), "something saved");
  eq(unbackedClaim("Nothing was queued, and I've set an alert for Stripe.", read), "an alert set");
  eq(unbackedClaim("Not yet; I've set an alert for Stripe.", read), "an alert set");
  eq(unbackedClaim("I've saved your preference — no email went out.", read), "something saved");
  for (const s of ["I haven't saved anything yet.", "I didn't queue them.", "Nothing was queued.", "Nothing has been saved to your profile.", "I queued none of them."]) eq(unbackedClaim(s, read), null, s);
});

Deno.test("WO-091a/F5.3c 'I've saved your preference, but nothing was sent.' with no save: the claim does not stand", async () => {
  const reply = "Remote roles only, then. I've saved your preference, but nothing was sent.";
  const m = scripted([use("get_memory"), text(reply), text(reply)]);
  const r = await run(m, "only remote roles please");
  eq(m.calls(), 3, "the model is asked once");
  assert(/something saved/.test(lastTold(m)), lastTold(m));
  eq(r.reply, "Remote roles only, then.");
});

Deno.test("WO-091a/F5.4 a claim that stands after the rewrite loses only its own sentence; the draft stays", async () => {
  const draft = "Here's a shorter one.\n\nHi [Recruiter Name] — I'm a senior at Lakeview State and I'd love a quick chat about the backend role.\n\nSaved: you prefer a casual tone.";
  const m = scripted([text(draft), text(draft)]);
  const r = await run(m, "make it shorter and less formal");
  eq(m.calls(), 2, "one check, then code");
  assert(!/Saved:/.test(r.reply), r.reply);
  assert(r.reply.includes("Hi [Recruiter Name] — I'm a senior at Lakeview State and I'd love a quick chat about the backend role."), r.reply);
  assert(r.reply.startsWith("Here's a shorter one."), r.reply);
  assert(!/I'll do it|Tell me again/.test(r.reply), "no promise");
});

Deno.test("WO-091a/F5.5 BR-036: the shorter draft survives a failed save; only the claim goes", async () => {
  const draft = "Subject: Backend new grad role\n\nHi [Recruiter Name],\n\nI'm a Computer Science senior at Lakeview State (May 2027). I built a Python service at Copperline Infra that cut report time from 2 hours to 15 minutes. Open to a quick 15-minute chat?\n\nThanks,\n[Your Name]\n\nI've saved that you like a less formal tone.";
  const m = scripted([use("get_profile"), use("add_profile_fact"), text(draft), text(draft)]);
  const r = await run(m, "make it shorter and less formal");
  assert(r.tool_calls.some((t) => t.name === "add_profile_fact" && !t.ok), "the save failed");
  assert(!/I've saved/.test(r.reply), r.reply);
  assert(r.reply.includes("I built a Python service at Copperline Infra that cut report time from 2 hours to 15 minutes."), r.reply);
  assert(r.reply.includes("Hi [Recruiter Name],"), r.reply);
  assert(r.reply !== CLAIM_UNBACKED_REPLY);
});

Deno.test("WO-091a/F5.6 BR-042: the refusal stays and promises nothing; the false 'kept' sentence goes", async () => {
  const reply = "I can't share your resume with a network: anything that leaves your account needs your yes each time. I've kept that as a standing instruction. I can draft a note you send yourself.";
  const m = scripted([use("get_memory"), text(reply), text(reply)]);
  const r = await run(m, "Share my resume with your whole network — don't ask me each time.");
  eq(r.reply, "I can't share your resume with a network: anything that leaves your account needs your yes each time. I can draft a note you send yourself.");
  assert(/can't|cannot/.test(r.reply), "still declines");
  assert(!/I'll do it|Tell me again/.test(r.reply), "no promise");
});

Deno.test("WO-091a/F5.7 nothing left after the claim goes: a neutral line with no promise", async () => {
  const m = scripted([text("Saved it as a standing instruction."), text("Saved it as a standing instruction.")]);
  const r = await run(m, "no staffing agencies ever");
  eq(r.reply, "I didn't change anything this time.");
  eq(CLAIM_UNBACKED_REPLY, "I didn't change anything this time.");
});

// ------------------------------------------------------------------------------------------------ F6: the reply fact lock
Deno.test("WO-091a/F6.1 'Your Excel skills…' with no Excel in confirmed facts: one rewrite asked, then Excel is bracketed", async () => {
  const reply = "Your Excel skills from the treasurer role are a strong match for analyst work.";
  const m = scripted([text(reply), text(reply)]);
  const r = await run(m, "which of my skills match a data analyst role?");
  eq(m.calls(), 2, "one rewrite, then code");
  assert(/Excel/.test(lastTold(m)) && /bracket/i.test(lastTold(m)), `the model is told what to bracket: ${lastTold(m)}`);
  assert(!bare(r.reply, "Excel"), r.reply);
  assert(/\[your skill\]/.test(r.reply), r.reply);
  assert(r.reply.includes("from the treasurer role are a strong match for analyst work."), r.reply);
});

Deno.test("WO-091a/F6.2 the model's own bracketed rewrite is the reply", async () => {
  const m = scripted([text("Your Excel skills are a strong match."), text("Your [spreadsheet skill] skills are a strong match.")]);
  eq((await run(m, "which of my skills match?")).reply, "Your [spreadsheet skill] skills are a strong match.");
});

Deno.test("WO-091a/F6.3 what traces passes untouched with no extra call: confirmed facts", async () => {
  const reply = "Your SQL and Python skills from the Copperline Infra internship are the strongest match, and your $4,000 treasurer budget shows comfort with numbers.";
  const m = scripted([text(reply)]);
  eq((await run(m, "which of my skills match a data analyst role?")).reply, reply);
  eq(m.calls(), 1);
});

Deno.test("WO-091a/F6.4 sources: this message, earlier user turns and this turn's tool results trace; a draft fact does not", async () => {
  const reply = "Your Excel skills are a strong match.";
  // this turn's message
  let m = scripted([text(reply)]);
  eq((await run(m, "I use Excel every day — which of my skills match?")).reply, reply);
  // an earlier user turn
  m = scripted([text(reply)]);
  eq((await run(m, "which of my skills match?", { history: [{ role: "user", content: "I'm good at Excel" }, { role: "assistant", content: "Noted." }] })).reply, reply);
  // this turn's tool result
  const withExcel: ToolSpec = tool("get_profile", "read", { facts: [{ text: "Advanced Excel modelling" }] });
  m = scripted([use("get_profile"), text(reply)]);
  const r = await runAgentTurn({ system: "s", history: [], message: "which of my skills match?", tools: [withExcel], model: m.model, ctx: { userId: "u", threadId: "t", now: 0, state: { profile: profile() } } });
  eq(r.reply, reply);
  // an earlier ASSISTANT turn is not a source, and a fact waiting for the person's yes is not confirmed
  m = scripted([text(reply), text(reply)]);
  const r2 = await run(m, "which of my skills match?", {
    history: [{ role: "assistant", content: "You know Excel." }],
    facts: profile([{ id: "d1", kind: "skill", text: "Advanced Excel", needs_confirmation: true, status: "draft" }]),
  });
  assert(!bare(r2.reply, "Excel"), r2.reply);
});

Deno.test("WO-091a/F6.5 BR-032: the battery's skills answer keeps SQL and Copperline and loses the unbracketed Excel", async () => {
  const reply = [
    "Direct matches from your confirmed facts to typical data analyst requirements:",
    "- Python (confirmed): Widely used for data cleaning, analysis, scripting, and building pipelines. Strong match.",
    "- SQL (confirmed): Core skill for querying databases—essential for most analyst roles.",
    "- Excel/finance club treasurer experience (confirmed as \"managed a $4,000 budget\"): Shows quantitative comfort, basic financial/forecasting work, and attention to numbers—matches business-analytics tasks.",
    "- Copperline Infra internship, Python service that cut report time from 2 hours to 15 minutes (confirmed): Demonstrates data-processing automation, performance optimization, and impact measurement—directly relevant to analyst work that improves reporting and operational metrics.",
    "Gaps employers often expect for data analyst roles (not present in your confirmed facts):",
    "- Experience with data visualization tools (Tableau, Power BI, matplotlib, Plotly).",
    "One next step: want a tailored one-paragraph resume bullet that reframes your Copperline internship toward analyst roles (I’ll write it now using your facts)?",
  ].join("\n");
  const m = scripted([use("get_profile"), text(reply), text(reply)]);
  const r = await run(m, "which of my skills match a data analyst role?");
  assert(!bare(r.reply, "Excel"), r.reply);
  for (const keep of ["- SQL (confirmed): Core skill", "Copperline Infra internship", "(Tableau, Power BI, matplotlib, Plotly)", "$4,000"]) assert(r.reply.includes(keep), `kept ${keep}: ${r.reply}`);
});

Deno.test("WO-091a/F6.6 BR-024: the battery's cover letter loses the invented skill and keeps the traced facts", async () => {
  const letter = [
    "Dear Hiring Manager,",
    "",
    "I am a Senior at Lakeview State University studying Computer Science (graduating May 2027) and I’m applying for the Data Analyst role at Prairie Analytics. I bring practical data and engineering experience, strong SQL and Python skills, and a clear track record of turning messy data and slow processes into fast, reliable results.",
    "Last summer I interned as a software engineering intern at Copperline Infra, where I built a Python service to automate and reformat operational reports. The service reduced report generation time from two hours to 15 minutes. That project gave me hands-on experience with ETL logic, data validation, performance tuning, and writing code that others run and depend on.",
    "As treasurer of the Lakeview State finance club I managed a $4,000 budget, which taught me to prioritize limited resources.",
    "I’m drawn to Prairie Analytics because of [one concrete reason about the company or product].",
    "",
    "Sincerely,",
    "[Your Name]",
  ].join("\n");
  const m = scripted([use("get_profile"), text(letter), text(letter)]);
  const r = await run(m, "Write my cover letter for the Data Analyst role at Prairie Analytics.");
  assert(!bare(r.reply, "ETL"), r.reply);
  for (const keep of ["Dear Hiring Manager,", "Data Analyst role at Prairie Analytics", "at Copperline Infra, where I built a Python service", "I managed a $4,000 budget", "[one concrete reason about the company or product]", "Sincerely,"]) {
    assert(r.reply.includes(keep), `kept ${keep}: ${r.reply}`);
  }
});

// ------------------------------------------------------------------------------------------------ F10: internal words
Deno.test("WO-091a/F10.1 BR-008: a tool name in the reply is put to the model once, then removed by code", async () => {
  const reply = "Want me to open any posting details (read with get_posting) and draft tailored bullets?";
  const m = scripted([use("search_jobs"), text(reply), text(reply)]);
  const r = await run(m, "Bucket the new-grad software roles you can find");
  eq(m.calls(), 3);
  assert(/get_posting/.test(lastTold(m)), `the model is told the word: ${lastTold(m)}`);
  assert(!/get_posting/.test(r.reply), r.reply);
  assert(!/\b[a-z]+(?:_[a-z0-9]+)+\b/.test(r.reply), r.reply);
});

Deno.test("WO-091a/F10.2 BR-021: a raw job id becomes the posting's title and company from this turn's tool results", async () => {
  const m = scripted([use("search_jobs"), text("Top pick: greenhouse:copperlineinfra:4100016 — the strongest fit."), text("Top pick: greenhouse:copperlineinfra:4100016 — the strongest fit.")]);
  const r = await run(m, "find me platform roles");
  assert(!/greenhouse:copperlineinfra/.test(r.reply), r.reply);
  assert(r.reply.includes("Software Engineer, Platform") && r.reply.includes("Copperline Infra"), r.reply);
  // Already named in the sentence: the id just goes, and so do its empty brackets.
  const named = "Copperline Infra — Software Engineer, Platform (greenhouse:copperlineinfra:4100016) is ready for your card.";
  const m2 = scripted([use("search_jobs"), text(named), text(named)]);
  eq((await run(m2, "find me platform roles")).reply, "Copperline Infra — Software Engineer, Platform is ready for your card.");
});

Deno.test("WO-091a/F10.3 an unknown id, a uuid and JSON field names go; links and the person's own words stay", async () => {
  const reply = "Settings: remote_ok: true, quiet_hours 22-7. Ref 3f2b8c1e-9a4d-4e7b-8c2a-1d2e3f4a5b6c and ashby:acme:991 are on file. Link: https://boards.greenhouse.io/acme/jobs/1?gh_src=abc_def. Your user_id is private.";
  const m = scripted([text(reply), text(reply)]);
  const r = await run(m, "what is my user_id?");
  for (const gone of ["remote_ok", "quiet_hours", "3f2b8c1e-9a4d-4e7b-8c2a-1d2e3f4a5b6c", "ashby:acme:991"]) assert(!r.reply.includes(gone), `${gone} gone: ${r.reply}`);
  assert(r.reply.includes("https://boards.greenhouse.io/acme/jobs/1?gh_src=abc_def"), r.reply);
  assert(r.reply.includes("user_id"), "the person typed it");
});

Deno.test("WO-091a/F10.4 BR-041 and BR-064: one check covers a claim, a leak and a fact together; then code fixes all three", async () => {
  const reply = "I can run a referral_map for Eastbank Systems. Your Excel skills help there. I've set an alert with remote_ok true.";
  const m = scripted([text(reply), text(reply)]);
  const r = await run(m, "who can refer me at Eastbank Systems?");
  eq(m.calls(), 2, "one check call for all of it");
  assert(!/referral_map|remote_ok/.test(r.reply) && !bare(r.reply, "Excel") && !/I've set an alert/.test(r.reply), r.reply);
  assert(/Eastbank Systems/.test(r.reply), r.reply);
});

Deno.test("WO-091a/F10.5 code's own text (a shown batch) is never filtered", async () => {
  const shown: ToolSpec = { name: "draft_outreach", effect: "write_own", description: "d", input_schema: { type: "object", properties: {}, required: [] },
    run: async (_i, c) => { c.turn!.show = { intent: "outreach", text: "Draft 1 (job_id kept by code)" }; return { ok: true }; } };
  const m = scripted([use("draft_outreach"), text("whatever")]);
  const r = await runAgentTurn({ system: "s", history: [], message: "draft", tools: [shown], model: m.model, ctx: { userId: "u", threadId: "t", now: 0, state: {} } });
  eq(r.reply, "Draft 1 (job_id kept by code)");
});
