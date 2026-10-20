// WO-031: the browser extension's decisions (extension/src/apply_core.ts) and its wiring. The extension in a real Chromium
// against the captured forms is tests/career-extension-browser.test.cjs; the record is tests/db/career_apply_extension.test.sql.
// Contract: docs/architect/work-orders/WO-031-extension.md.
import {
  applyUrl, approvalHash, BEFORE_CLICK, blockers, cardLines, cardOutcome, changedFields, detectPortal, evidenceRecord, isIdentityField,
  looksLikeIdNumber, MASKED, outcomeAfterClick, payloadText, planForm, postingKey, postingLinks, reviewPayload, scrubIdentity, type SnapField,
  WORKDAY_NOTICE,
} from "../../extension/src/apply_core.ts";
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { bindFields } from "../../scripts/career/form-bind.ts";
import BACKGROUND from "../../extension/background.js" with { type: "text" };
import CONTENT from "../../extension/content.js" with { type: "text" };
import PANEL from "../../extension/panel.js" with { type: "text" };
import PANEL_HTML from "../../extension/panel.html" with { type: "text" };
import BUNDLE from "../../extension/lib/trainee-core.js" with { type: "text" };
import MANIFEST from "../../extension/manifest.json" with { type: "json" };
import README from "../../extension/README.md" with { type: "text" };
import RUN_SH from "../db/run.sh" with { type: "text" };
import GO_LIVE from "../../scripts/launch/trainee-go-live.sh" with { type: "text" };
import GO_LIVE_DOC from "../../docs/launch/TRAINEE-GO-LIVE.md" with { type: "text" };
import MIGRATION from "../../supabase/migrations/20261021000000_career_apply_extension.sql" with { type: "text" };
import KEY from "../fixtures/extension/answer-key.json" with { type: "json" };

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const fact = (value: string, id = "TEST-fact") => ({ value, factId: id });
const YN = [{ label: "Yes", value: "Yes" }, { label: "No", value: "No" }];
const field = (name: string, label: string, o: Partial<{ type: string; required: boolean; options: { label: string; value: string }[] }> = {}) =>
  ({ name, label, type: o.type ?? "text", required: o.required ?? false, options: o.options ?? [] });

Deno.test("WO-031/1 the bundle is the apply stack's own modules, built from these sources, never a copy", async () => {
  const r = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", new URL("../../extension/build.ts", import.meta.url).pathname, "--check"] }).output();
  assert(r.success, "extension/lib/trainee-core.js is stale: " + new TextDecoder().decode(r.stderr));
  for (const m of ["supabase/functions/_shared/career_apply.ts", "supabase/functions/_shared/question_map.ts", "supabase/functions/_shared/fact_schema.ts",
    "supabase/functions/_shared/answer_options.ts", "supabase/functions/_shared/career_apply_store.ts", "workers/career-browser/ask-once.ts",
    "scripts/career/form-bind.ts", "scripts/career/page-functions.cjs"]) {
    assert(BUNDLE.includes(`// ${m}`), `the bundle carries ${m}`);
  }
  // The hand-written scripts call the bundle; none of them re-implements a planner, a question map, a hash or a reader.
  for (const [name, src] of [["background.js", BACKGROUND], ["content.js", CONTENT], ["panel.js", PANEL]]) {
    for (const fn of ["planBatch", "mapQuestion", "classifyField", "answerKey", "hashApplyPayload", "canonical", "fnDiscoverFields", "matchOption", "chooseOption"]) {
      assert(!new RegExp(`function\\s+${fn}\\b|const\\s+${fn}\\s*=`).test(src), `${name} defines no ${fn} of its own`);
    }
  }
});

Deno.test("WO-031/2 recognized forms: Greenhouse (hosted, EU, embedded), Lever, Ashby; Workday only to say so; nothing else", () => {
  eq(detectPortal("https://job-boards.greenhouse.io/acme/jobs/123"), { family: "greenhouse", embedded: false });
  eq(detectPortal("https://boards.greenhouse.io/embed/job_app?for=acme&token=123"), { family: "greenhouse", embedded: true });
  eq(detectPortal("https://job-boards.eu.greenhouse.io/acme/jobs/123")?.family, "greenhouse");
  eq(detectPortal("https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5/apply")?.family, "lever");
  eq(detectPortal("https://jobs.ashbyhq.com/acme/0130d854-9bae/application")?.family, "ashby");
  eq(detectPortal("https://acme.wd1.myworkdayjobs.com/en-US/External/job/X_R1/apply")?.family, "workday");
  for (const u of ["https://www.linkedin.com/jobs/view/1", "https://www.indeed.com/viewjob?jk=1", "http://jobs.lever.co/a/b", "https://evil-greenhouse.io/a/jobs/1", "not a url"]) {
    eq(detectPortal(u), null, u);
  }
  eq(postingKey("https://job-boards.greenhouse.io/acme/jobs/123?gh_src=x"), "greenhouse:acme:123");
  eq(postingKey("https://boards.greenhouse.io/embed/job_app?for=acme&token=123"), "greenhouse:acme:123");
  eq(postingKey("https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5"), "lever:acme:0130d854-9bae-48d4-8ef0-e9da1ee778a5");
  eq(postingKey("https://jobs.ashbyhq.com/acme"), null, "a board page is not a posting");
  eq(applyUrl("https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5"), "https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5/apply");
  eq(applyUrl("https://jobs.ashbyhq.com/acme/0130d854-9bae-48d4"), "https://jobs.ashbyhq.com/acme/0130d854-9bae-48d4/application");
  const links = postingLinks("Strong match:\nhttps://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5\nhttps://www.linkedin.com/jobs/view/1\nhttps://www.indeed.com/viewjob?jk=2\nagain https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5/apply.");
  eq(links, ["https://jobs.lever.co/acme/0130d854-9bae-48d4-8ef0-e9da1ee778a5/apply"], "LinkedIn and Indeed are never queued; one posting once");
});

const BASE = { userId: "TEST-user", jobId: "lever:acme:1", company: "acme", now: Date.UTC(2026, 9, 20), saved: {} };
Deno.test("WO-031/3 the planner fills only what the person stated: never an identity number, an EEO answer or an attestation they did not give", () => {
  const schema = [
    field("name", "Full name✱", { required: true }),
    field("ssn", "Social Security Number", { required: true }),
    field("passport", "Passport number"),
    field("gender", "Gender", { type: "select", options: [{ label: "Male", value: "m" }, { label: "Female", value: "f" }, { label: "Decline to self-identify", value: "d" }] }),
    field("felony", "Have you ever been convicted of a felony?", { type: "radio", required: true, options: YN }),
    field("spons", "Will you require sponsorship?", { type: "radio", required: true, options: YN }),
  ];
  const answers = { full_name: fact("Test Person"), sponsorship: fact("No") };
  const p = planForm({ ...BASE, family: "lever", schema, answers });
  eq(p.fill.map((f) => [f.name, f.value]), [["name", "Test Person"], ["spons", "No"]]);
  eq(p.identity.map((f) => f.name), ["ssn", "passport"], "identity numbers are the person's to type");
  assert(isIdentityField({ label: "SSN" }) && isIdentityField({ label: "", name: "social_security_number" }) && !isIdentityField({ label: "Phone" }));
  eq(p.needs.map((n) => n.label), ["Have you ever been convicted of a felony?"], "an attestation not given is asked, never filled; the SSN is never asked by text");
  // Once the person states them, they fill.
  const given = planForm({ ...BASE, family: "lever", schema, answers: { ...answers, criminal_history: fact("No"), eeo: fact("decline") } });
  eq(given.fill.find((f) => f.name === "felony")?.value, "No");
  eq(given.fill.find((f) => f.name === "gender")?.value, "d", "the person's own decline, on the employer's own option");
});

Deno.test("WO-031/4 the planner fills what it is sure of even when a required question is still open", () => {
  const schema = [field("name", "Full name✱", { required: true }), field("why", "Why do you want to work here?", { type: "textarea", required: true })];
  const p = planForm({ ...BASE, family: "ashby", schema, answers: { full_name: fact("Test Person") } });
  eq(p.fill.map((f) => f.name), ["name"]);
  eq(p.needs, [{ label: "Why do you want to work here?", type: "textarea", options: [] }]);
  // planBatch itself still holds the whole posting back, as the engine needs.
  const strict = planBatch({ userId: "u", postings: [{ job_id: "j", company: "c", title: "", fields: schema }], answers: { full_name: fact("Test Person") }, saved: {}, log: [], now: 0 });
  eq(strict.ready.length, 0);
});

Deno.test("WO-031/5 Workday: only the basic contact fields, and it says so", () => {
  const schema = [field("first", "First Name*", { required: true }), field("email", "Email Address*", { required: true }),
    field("auth", "Are you legally authorized to work in the United States?*", { type: "select", required: true, options: YN })];
  const answers = { first_name: fact("Test"), email: fact("t@example.test"), work_authorization: fact("Yes") };
  const p = planForm({ ...BASE, jobId: "workday:acme:1", family: "workday", schema, answers });
  eq(p.fill.map((f) => f.name), ["first", "email"]);
  eq(p.needs.map((n) => n.label), ["Are you legally authorized to work in the United States?*"]);
  eq(WORKDAY_NOTICE, "Workday needs you signed in on the employer's site; I fill the fields I can.");
});

Deno.test("WO-031/6 the shared planner: a follow-up is never answered by a fact; another person's contact never by the person's", () => {
  const plan = (label: string, type = "text", answers: Record<string, any> = { work_authorization: fact("Yes"), phone: fact("+1 555 010 0000"), country: fact("United States") }) =>
    planBatch({ userId: "u", postings: [{ job_id: "j", company: "c", title: "", fields: [field("q", label, { type })] }], answers, saved: {}, log: [], now: 0 }).ready[0].fields;
  eq(plan("If no, please describe your work authorization status.", "textarea"), []);
  eq(plan('If you selected "REST OF WORLD", where are you based?'), []);
  eq(plan("Phone number of the person referring you"), []);
  eq(plan("Phone number").map((f) => f.value), ["+1 555 010 0000"]);
  // Saved for that wording by the person, a follow-up does fill.
  const saved = planBatch({ userId: "u", postings: [{ job_id: "j", company: "c", title: "", fields: [field("q", "If other, please specify")] }], answers: {}, saved: { "if other please specify": fact("A friend") }, log: [], now: 0 });
  eq(saved.ready[0].fields.map((f) => f.value), ["A friend"]);
});

Deno.test("WO-031/7 the shared binder: options without distinct values are chosen by their text, never the first one", () => {
  const radio = (label: string, value: string, i: number) => ({ domIndex: i, selector: `#r${i}`, tag: "input", inputType: "radio", name: "spons", id: `r${i}`, label, groupLabel: "Will you require sponsorship?", optionValue: value, ref: String(i) });
  const ashby = bindFields([radio("Yes, I will require sponsorship", "on", 0), radio("No, I do not require sponsorship", "on", 1)]);
  eq(ashby.schema[0].options.map((o: any) => o.value), ["Yes, I will require sponsorship", "No, I do not require sponsorship"]);
  const lever = bindFields([radio("Yes", "Yes", 0), radio("No", "No", 1)]);
  eq(lever.schema[0].options.map((o: any) => o.value), ["Yes", "No"]);
});

const snap = (o: Partial<SnapField> & { name: string }): SnapField => ({ label: o.name, value: "v", source: "trainee", factId: "f", masked: false, ...o });
const payloadOf = (fields: SnapField[]) => reviewPayload({
  userId: "00000000-0000-4000-8000-000000000931", jobId: "ashby:harvey:977e6184", company: "harvey", url: "https://jobs.ashbyhq.com/harvey/977e6184/application",
  family: "ashby", fields, resume: { filename: "résumé.pdf", sha256: "a".repeat(64) }, account: { epoch: 2, version: 3 }, expiresAt: "2026-10-20T12:00:00.000Z",
});
Deno.test("WO-031/8 the approval is the hash of the exact payload, the database's own hash; identity numbers never in it", async () => {
  const fields = [
    snap({ name: "_systemfield_name", label: "Legal First and Last Name✱", value: "Test Person", factId: "text-answer:1" }),
    snap({ name: "x", label: "Yes, I’m based in this location — “quotes” \\ back\nline", value: "No, I do not require sponsorship", source: "you", factId: null, detail: "checked=No" }),
    snap({ name: "ssn", label: "Social Security Number", value: "123-45-6789", source: "you", factId: null, masked: true }),
  ];
  const p = payloadOf(fields);
  assert(!JSON.stringify(p).includes("123-45-6789"), "the payload never carries an identity number");
  eq(p.fields[2].value, MASKED);
  // tests/db/career_apply_extension.test.sql checks the database computes this same hash for this same payload.
  eq(await approvalHash(p), "135758525121be33e9b3157064d35c75e1f2986056a436d7f3d593a1eaf1b21b");
  const changed = await approvalHash(payloadOf(fields.map((f) => (f.name === "x" ? { ...f, value: "Yes, I will require sponsorship" } : f))));
  assert(changed !== (await approvalHash(p)), "any change to any answer is another approval");
  // What is sent, not only what is shown: the same text with another option value or other file bytes is another approval.
  const sent = await approvalHash(payloadOf(fields.map((f) => (f.name === "x" ? { ...f, detail: "checked=Yes" } : f))));
  assert(sent !== (await approvalHash(p)), "the option value / checked state / file bytes are bound to the approval");
  eq(payloadText(p), JSON.stringify(p), "the payload as text, for the check next to the click");
});

Deno.test("WO-031/9 after the tap: any change, any new answer, any answer the page set, a verification, or an open question stops it", () => {
  const reviewed = [snap({ name: "a", label: "Email", value: "t@example.test" }), snap({ name: "b", label: "Phone", value: "1" })];
  eq(changedFields(reviewed, reviewed), []);
  eq(changedFields(reviewed, [reviewed[0], { ...reviewed[1], value: "2" }]), ["Phone"]);
  eq(changedFields(reviewed, [reviewed[0], { ...reviewed[1], source: "page" }]), ["Phone"], "the same value set by a script is not the reviewed one");
  eq(changedFields(reviewed, [...reviewed, snap({ name: "c", label: "Twitter", source: "page" })]), ["Twitter"]);
  eq(changedFields(reviewed, [reviewed[0]]), ["Phone"]);
  eq(changedFields(reviewed, [reviewed[0], { ...reviewed[1], detail: "sha:other-bytes" }]), ["Phone"], "same text, other bytes or value: changed");
  eq(blockers({ fields: reviewed, openRequired: [], challenge: false, family: "lever" }), []);
  assert(blockers({ fields: reviewed, openRequired: [], challenge: true, family: "lever" })[0].includes("Finish it yourself"), "a verification is handed to the person");
  assert(/set by the page/.test(blockers({ fields: [snap({ name: "c", label: "Twitter", source: "page" })], openRequired: [], challenge: false, family: "lever" })[0]));
  assert(/required and not answered/.test(blockers({ fields: [], openRequired: ["Why us?"], challenge: false, family: "lever" })[0]));
});

Deno.test("WO-031/10 the card is plain text: every answer as sent, the resume, what is still needed, what only the person types", () => {
  const p = payloadOf([snap({ name: "n", label: "Full name✱", value: "Test Person" }), snap({ name: "ssn", label: "Social Security Number", value: "123-45-6789", source: "you", masked: true }),
    snap({ name: "ack", label: "I have read and agree to the privacy notice.", value: "Yes (checked)" })]);
  const lines = cardLines({ company: "harvey", family: "workday", payload: p, openRequired: ["Why us?"], identity: [{ label: "Social Security Number" }], blockers: ["x"], verification: ["recaptcha"] });
  eq(lines[1], WORKDAY_NOTICE);
  assert(lines.includes("Full name: Test Person"), "the form's star is dropped, the value is exact");
  assert(lines.includes("You agree: I have read and agree to the privacy notice.: Yes (checked)"), "a consent reads as the person's");
  assert(lines.includes("Resume: résumé.pdf"));
  assert(lines.some((l) => l.startsWith("Still needed: Why us?")));
  assert(lines.some((l) => l.startsWith("Type this yourself on the form: Social Security Number")));
  assert(!lines.join("\n").includes("123-45-6789"));
  for (const l of lines) assert(l.length <= 1500 && !/\*\*|^#|`|\[[^\]]*\]\(/.test(l), "plain text: " + l);
});

Deno.test("WO-031/11 evidence: a fixed shape, both screenshots' hashes, no identity number, no picture, always under 64 KB", async () => {
  const p = payloadOf([snap({ name: "ssn", label: "SSN", value: "123-45-6789", source: "you", masked: true })]);
  const ev = await evidenceRecord({ payload: p, hash: "h", outcome: { state: "confirmed", reason: "employer confirmation on the page", confirmation_id: "TEST-1" },
    pageText: "Thank you for applying. Ref 123-45-6789 and 123456789.", urlAfter: "https://x", screenshotSha256: "a".repeat(64), screenshotAfterSha256: "b".repeat(64),
    times: { card: 1000, approved: 2000, clicked: 2100, done: 3500 } });
  assert(!JSON.stringify(ev).includes("123-45-6789") && !JSON.stringify(ev).includes("123456789"));
  eq(scrubIdentity("SSN 123 45 6789"), "SSN [number removed]");
  eq(ev.ms_card_to_done, 2500);
  // The shape WO-042 counts on.
  for (const k of ["times", "screenshot_sha256", "screenshot_after_sha256", "confirmation_text", "confirmation_id", "url_after"]) assert(k in ev, k);
  eq(Object.keys(ev.times), ["card_shown_at", "approved_at", "clicked_at", "finished_at"]);
  eq(ev.screenshot_after_sha256, "b".repeat(64));
  assert(!("screenshot" in ev) && !("screenshot_after" in ev), "the record holds the pictures' hashes; the pictures stay on the computer");
  // A long answer cannot make the record too big to keep (WO-031 review: finish_own failed every retry over 64 KB).
  const huge = payloadOf([snap({ name: "essay", label: "Tell us about yourself", value: "x".repeat(120_000), source: "you" }),
    ...Array.from({ length: 300 }, (_, i) => snap({ name: "f" + i, label: "Question " + i + " " + "q".repeat(250), value: "v".repeat(400), source: "you" }))]);
  const big = await evidenceRecord({ payload: huge, hash: "h", outcome: { state: "confirmed", reason: "r", confirmation_id: null }, pageText: "t".repeat(9000),
    urlAfter: "https://x", screenshotSha256: null, screenshotAfterSha256: null, times: { card: 1, approved: 2, clicked: 3, done: 4 } });
  assert(JSON.stringify(big).length < 65536, "under the 64 KB limit: " + JSON.stringify(big).length);
  assert((big.answers as any[]).every((a) => typeof a.value_sha256 === "string" || String(a.value ?? "").length <= 500), "long answers kept by hash");
});

Deno.test("WO-031/15 identity numbers of many countries are never filled or kept; a long digit string the person typed is masked", () => {
  for (const label of ["SIN", "SIN (Social Insurance Number)", "National Identification Number", "Passport #", "Driver's License #", "Tax File Number",
    "Aadhaar number", "Government-issued ID number", "Personnummer", "NI number", "CPF", "Social Security Number", "ID card number"]) {
    assert(isIdentityField({ label }), label);
  }
  for (const label of ["Phone", "Email", "LinkedIn profile", "Years of experience", "Sincerely, your name", "Business card title"]) assert(!isIdentityField({ label }), label);
  assert(looksLikeIdNumber("123 456 789 01") && looksLikeIdNumber("12345678") && !looksLikeIdNumber("1234567") && !looksLikeIdNumber("Test Person"));
});

Deno.test("WO-031/16 two fields under one label: neither is answered, both are the person's", () => {
  const schema = [field("phone", "Phone"), field("ref_phone", "Phone"), field("email", "Email")];
  const p = planForm({ ...BASE, family: "lever", schema, answers: { phone: fact("+1 555 010 0000"), email: fact("t@example.test") } });
  eq(p.fill.map((f) => f.name), ["email"]);
  eq(p.ambiguous.map((f) => f.name), ["phone", "ref_phone"]);
});

Deno.test("WO-031/17 after the click: never 'not sent'; an old notice is not the employer's answer; confirmed only with the picture after", () => {
  const base = { url_before: "https://a", url_after: "https://a", form_present_after: true, required_empty_after: 0, validation_errors: ["We use cookies"], captcha: false, email_code_prompt: false, page_text: "" };
  eq(outcomeAfterClick(base, ["We use cookies"], true).state, "unknown_outcome", "no answer in time: counted as applied");
  eq(outcomeAfterClick(base, ["We use cookies"], false).state, "unknown_outcome", "the form still there, nothing new: never 'not submitted'");
  eq(outcomeAfterClick({ ...base, validation_errors: ["We use cookies", "Email is required"] }, ["We use cookies"]).state, "failed", "a new error is the employer's");
  eq(outcomeAfterClick({ ...base, form_present_after: false, page_text: "Thank you for applying!" }, ["We use cookies"]).state, "confirmed");
  eq(BEFORE_CLICK, "stopped before the click");
  const ok = { state: "confirmed", reason: "employer confirmation on the page", confirmation_id: "TEST-1" };
  eq(cardOutcome(ok, true).message, "Sent; the employer's page confirmed it (TEST-1). Their email makes it final.");
  eq(cardOutcome(ok, false).message, "Sent; the employer's answer could not be captured. Check your email for their confirmation.");
  assert(!/confirmed by/.test(cardOutcome({ state: "unknown_outcome", reason: "r", confirmation_id: null }, true).message));
});

// What can be checked only in the code (the rest is behavioural, in tests/career-extension-browser.test.cjs: the session
// only in session storage, the person's own tap, panel-only requests, the pinned server).
Deno.test("WO-031/12 manifest and code: MV3, forms only, no remote code, no password field, never a verification token", () => {
  const m = MANIFEST as any;
  eq(m.manifest_version, 3);
  const matches: string[] = m.content_scripts.flatMap((c: any) => c.matches);
  assert(matches.every((x) => /greenhouse\.io|lever\.co|ashbyhq\.com|myworkday(jobs|site)?\.com/.test(x)), "content scripts run only on application forms");
  assert(!matches.some((x) => /linkedin|indeed|<all_urls>/.test(x)));
  eq(m.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'", "no remote code");
  assert(!/type=["']?password/i.test(PANEL_HTML), "the extension never asks for a password");
  assert(!/g-recaptcha-response|h-captcha-response|cf-turnstile-response/.test(CONTENT + BACKGROUND), "it never touches a verification's token");
  assert(/Not in the Chrome Web Store/i.test(README) || /not in the Chrome Web Store/i.test(README));
});

Deno.test("WO-031/13 the migration is wired: applied twice with its test, applied by go-live in order, named in the go-live doc", () => {
  const f = "20261021000000_career_apply_extension.sql";
  eq(RUN_SH.split(f).length - 1, 2, "applied twice by tests/db/run.sh");
  assert(RUN_SH.includes("career_apply_extension.test.sql"));
  assert(GO_LIVE.includes(f) && GO_LIVE.includes("proname = 'career_apply_extension_begin_own'"));
  assert(GO_LIVE.indexOf(f) > GO_LIVE.indexOf("20261020120100_career_events_erase.sql"), "in file order");
  assert(GO_LIVE_DOC.includes(f));
  assert(/create or replace function public\.career_apply_extension_begin_own/.test(MIGRATION) && /grant execute .* to authenticated/.test(MIGRATION));
  assert(!/create table/i.test(MIGRATION), "no new table: the record is a career_apply_jobs row");
});

Deno.test("WO-031/14 the accuracy key keeps a held-out split and covers every family", () => {
  const k = KEY as any;
  const ids = Object.keys(k.forms);
  eq(ids.length, 17);
  for (const fam of ["greenhouse", "lever", "ashby"]) {
    eq(k.split.heldout.filter((x: string) => x.startsWith(fam)).length, 2, fam);
    assert(ids.filter((x) => x.startsWith(fam) && !k.split.heldout.includes(x)).length >= 3);
  }
});

// WO-063 (2026-10-20): the host permission stays "<all_urls>". Measured: narrowing it to the job sites, the app and
// Supabase failed 18 of 70 browser tests, every one at the proof screenshot ("The picture of the filled form could not be
// taken"): chrome.tabs.captureVisibleTab needs <all_urls> (or activeTab, which only a click on the toolbar icon grants).
// The proof of each application is the product's promise, so the store listing justifies the permission instead.
Deno.test("WO-063/1 the proof screenshot keeps its permission: host_permissions is <all_urls> while captureVisibleTab is used", async () => {
  const bg = await Deno.readTextFile("extension/background.js");
  if (bg.includes("captureVisibleTab")) {
    const hp = (MANIFEST as any).host_permissions || [];
    if (!hp.includes("<all_urls>")) throw new Error("captureVisibleTab needs <all_urls>: narrowing breaks every application's proof screenshot");
  }
});
