// WO-091d: the application's states tell the truth and always end (docs/architect/work-orders/WO-091d-apply-states.md).
// The pure decisions here (extension/src/apply_core.ts, supabase/functions/_shared/posting_key.ts); the extension in a real
// Chromium is tests/career-extension-browser.test.cjs ("091d" tests); the record is tests/db/career_apply_states.test.sql.
import {
  BROWSER_REFUSED, cardOutcome, INTERRUPTED, outcomeAfterClick, postingKey, recoveredOutcome, refusedMessage, workdayEmployer,
} from "../../extension/src/apply_core.ts";
import BACKGROUND from "../../extension/background.js" with { type: "text" };
import CONTENT from "../../extension/content.js" with { type: "text" };
import PANEL from "../../extension/panel.js" with { type: "text" };
import RUN_SH from "../db/run.sh" with { type: "text" };
import GO_LIVE from "../../scripts/launch/trainee-go-live.sh" with { type: "text" };
import SCHEDULE from "../../scripts/launch/schedule-career-proactive.sql" with { type: "text" };
import MIGRATION from "../../supabase/migrations/20261023091400_career_apply_states.sql" with { type: "text" };

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const obs = (o: Record<string, unknown> = {}) => ({
  url_before: "https://job-boards.greenhouse.io/testco/jobs/1", url_after: "https://job-boards.greenhouse.io/testco/jobs/1", form_present_after: true,
  required_empty_after: 0, validation_errors: [] as string[], captcha: false, email_code_prompt: false, page_text: "Apply for this job", ...o,
});

Deno.test("WO-091d/F1 the browser's own refusal is 'not sent', never 'Sent', never counted", () => {
  // The browser fired `invalid` on a field and no `submit`: provably nothing left the page.
  const r = outcomeAfterClick({ ...obs(), browser_refused: ["LinkedIn URL: Please enter a URL."] }, [], true);
  eq(r.state, "not_submitted", "a submit the browser refused is not sent");
  assert(r.reason.startsWith(BROWSER_REFUSED), r.reason);
  assert(r.reason.includes("LinkedIn URL"), "the reason names the field");
  // Without that signal the old rule holds: after a click, a page that does not say is unknown and never resent.
  eq(outcomeAfterClick(obs(), [], true).state, "unknown_outcome");
  eq(outcomeAfterClick({ ...obs(), browser_refused: [] }, [], true).state, "unknown_outcome", "an empty list is no signal");
  // A refusal list on a page whose form is gone means nothing (the page moved on).
  eq(outcomeAfterClick({ ...obs({ form_present_after: false, url_after: "https://x.test/thanks", page_text: "Thank you for applying" }), browser_refused: ["x"] }).state, "confirmed");
  // What the person reads: not sent, fix the named field.
  const m = refusedMessage([{ label: "LinkedIn URL *", message: "Please enter a URL." }]);
  assert(/^Not sent — fix LinkedIn URL\b/.test(m), m);
  assert(m.includes("Please enter a URL."), m);
  assert(!/^Sent/.test(m));
});

Deno.test("WO-091d/F1 an unknown outcome or a page asking for something never reads 'Sent'", () => {
  const unknown = cardOutcome({ state: "unknown_outcome", reason: "r", confirmation_id: null }, true).message;
  assert(!/^Sent/.test(unknown), unknown);
  assert(/can't tell whether it went through/.test(unknown), unknown);
  assert(/could not be captured/.test(unknown), "the earlier wording's fact stays");
  const needs = cardOutcome({ state: "needs_user", reason: "captcha", confirmation_id: null }, true).message;
  assert(!/^Sent/.test(needs), needs);
  assert(/^Not finished/.test(needs), needs);
  // Confirmed by the page keeps its words (WO-031).
  assert(/^Sent; the employer's page confirmed it/.test(cardOutcome({ state: "confirmed", reason: "", confirmation_id: null }, true).message));
});

Deno.test("WO-091d/F2 an application found unfinished after a restart ends: unknown once clicked, retriable before", () => {
  const clicked = recoveredOutcome({ clicked_at: 1_700_000_000_000 }, "the browser was closed");
  eq(clicked.state, "unknown_outcome", "after the click the employer may have it: never retried");
  assert(/the browser was closed/.test(clicked.reason), clicked.reason);
  const before = recoveredOutcome({ clicked_at: null }, "the tab was closed");
  eq(before.state, "not_submitted", "no click: nothing was sent");
  assert(before.reason.startsWith(INTERRUPTED), before.reason);
  assert(/the tab was closed/.test(before.reason), before.reason);
});

Deno.test("WO-091d/F7 Workday on myworkdaysite.com and myworkday.com: the employer is the tenant, never the data centre", () => {
  eq(workdayEmployer("https://wd3.myworkdaysite.com/recruiting/acme/External/job/Chicago/Analyst_R1/apply"), "acme");
  eq(workdayEmployer("https://wd3.myworkdaysite.com/en-US/recruiting/globex/Careers/job/NY/Analyst_R1"), "globex");
  eq(workdayEmployer("https://wd5.myworkday.com/initech/d/inst/1$9925/9925$123.htmld"), "initech");
  eq(workdayEmployer("https://northwind.wd5.myworkdayjobs.com/x"), "northwind", "WO-048's tenant host unchanged");
  const a = postingKey("https://wd3.myworkdaysite.com/recruiting/acme/External/job/Chicago/Analyst_R1/apply");
  const g = postingKey("https://wd3.myworkdaysite.com/recruiting/globex/External/job/Chicago/Analyst_R1/apply");
  assert(a && g && a !== g, `two tenants on one data-centre host are two postings: ${a} ${g}`);
  assert(a!.includes(":acme:") && g!.includes(":globex:"), `${a} ${g}`);
  eq(postingKey("https://northwind.wd5.myworkdayjobs.com/en-US/External/job/Chicago/Data-Analyst_R-10421/apply"),
    "workday:northwind.wd5.myworkdayjobs.com:Data-Analyst_R-10421", "WO-048's key unchanged");
});

Deno.test("WO-091d wiring: the extension recovers what it was doing; the new migration ships and is tested", () => {
  assert(/chrome\.runtime\.onStartup\.addListener/.test(BACKGROUND), "start-up recovery");
  assert(/chrome\.tabs\.onRemoved\.addListener/.test(BACKGROUND), "a closed tab ends its work");
  assert(/finish_outbox/.test(BACKGROUND), "a finish that could not be recorded is kept and replayed");
  assert(/career_apply_clicked_own/.test(BACKGROUND), "the click is reported once it happened");
  assert(/career_apply_resolve_own/.test(BACKGROUND) && /career_apply_release_own/.test(BACKGROUND), "the person's own edges");
  assert(/addEventListener\("invalid"/.test(CONTENT) && /addEventListener\("submit"/.test(CONTENT), "the click watches the browser's own verdict");
  assert(/finished-myself/.test(PANEL) && /try-again/.test(PANEL), "the card offers the person's two edges");
  assert(RUN_SH.includes("20261023091400_career_apply_states.sql") && RUN_SH.includes("career_apply_states.test.sql"), "tests/db/run.sh applies and tests it");
  assert(GO_LIVE.includes("20261023091400_career_apply_states.sql") && GO_LIVE.includes("career_apply_resolve_own"), "go-live applies it with its mark");
  // Review of #128: every source's stale drive is swept on a schedule, by the service only; age alone never frees a drive.
  assert(/cron\.schedule\('trainee-apply-sweep-drives', '\*\/15 \* \* \* \*', 'select public\.career_apply_sweep_drives\(\)'\)/.test(SCHEDULE), "scheduled every 15 minutes");
  assert(/grant execute on function public\.career_apply_sweep_drives\(\) to service_role/.test(MIGRATION), "service only");
  assert(/'queued', 'driving', 'confirmed', 'submitted_unconfirmed', 'unknown_outcome'/.test(MIGRATION), "a drive counts at any age");
});
