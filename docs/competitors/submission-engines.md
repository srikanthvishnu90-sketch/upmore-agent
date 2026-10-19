# Submission engines: how the ATSes take an application, how competitors handle the walls, and what `scripts/apply.ts` lacks

Researcher: submission-engine research for Trainee, 2026-10-19. Written for the lead engineer hardening the engine.

Labels follow BUILD-STANDARD-TSENTA section 0:
- **VERIFIED** means read in our captured pages, our code, a fetched primary document, or measured in our own run. The source is given each time.
- **REPORTED** means a third party or an earlier internal doc says it, and nobody re-checked it this session.
- **ASSUMED** means an inference. It is a hypothesis to test, never something to build on.

## 0. What this is based on, and its limits

**The engine as read.** The engineer was editing both files while this was written. Line numbers below refer to the copy hashed here:
- `eng/scripts/apply.ts`, sha256 `c9d17609a073…` (732 lines).
- `eng/scripts/career/portal-browser-helper.cjs`, sha256 `f0699a6f017701…` (1085 lines).
- Committed HEAD is `0408a209` ("WO-009b-4 engine…"). The working copy adds four things, all uncommitted: the captcha-provider pass-through, the captcha token allowed in the body, the new challenge detector, and the submit-time hand-off. Section 6.0 lists them as "in progress, needs a test".

**The fixtures.** The 24 captured forms are in `eng/tests/fixtures/forms-ci/`: 5 Greenhouse applications, 6 Lever, 6 Ashby, 6 SmartRecruiters (403) and 1 Greenhouse redirect. The capture stripped script bodies and iframes. Script `src`, form attributes, hidden inputs and widget containers survive, so iframe-level claims are labeled separately.

**Measured runs (local only, dry run, no `--submit`).** I served stripped copies of three fixtures on 127.0.0.1, ran `apply.ts` in its default dry run as a non-root user, and evaluated the engine's `formAction()` logic on the same pages. The commands and results are in section 7.

**Research limits, recorded rather than worked around:**
- The WebSearch budget for this turn was used up before my first query.
- The egress proxy answered 403 to CONNECT for simplify.jobs, jobright.ai, usemassive.com and huntr.co (proxy status log, 17:05 UTC).
- support.greenhouse.io, developers.greenhouse.io, developers.ashbyhq.com, docs.cloud.google.com and docs.hcaptcha.com did not resolve.
- github.com was reachable, so the Lever, Greenhouse and hCaptcha sources below come from GitHub.
- As a result, every competitor statement here is REPORTED (from our own internal docs) or ASSUMED. Section 8 lists the exact checks to run once those hosts are reachable.

**Hard lines, unchanged by anything in this document.** Trainee never solves, bypasses or outsources a captcha, and uses no proxies and no stealth. Bot checks are handed to the person. Invisible checks run as they would for a person in the browser. Nothing here was signed up for or submitted.

---

## 1. How a candidate submission actually works, per ATS

### 1.1 Greenhouse, new UI (job-boards.greenhouse.io)

**Page and form.** The page is a Remix / React Router app (VERIFIED: the `remix-css-…-requiredInput` class and `data-discover="true"` on the form, all 5 Greenhouse fixtures).
- The application is in the server-rendered HTML (5/6 VERIFIED; Databricks redirects to its own site, so the sixth has none).
- The `<form>` is `method="get" action="/{board}/jobs/{id}"` with `id="application-form"` (VERIFIED, all 5).

**The request.** Not observable from the page.
- The form holds no named application controls. Across the 5 fixtures, 1 or 2 of 13 to 52 controls carry a `name`, and those are only `g-recaptcha-response` and, at WPP, a GDPR checkbox (VERIFIED, section 7).
- A native GET submit of this form would therefore send nothing but the reCAPTCHA token. The real submission has to be a request the page's JavaScript builds from React state (VERIFIED by deduction from the markup).
- The endpoint, method and body encoding (JSON or multipart) are **ASSUMED** unknown. Find them in the owner's first headed trial (gap 2).

**Resume upload.**
- `<input id="resume" type="file">` has no name and sits behind "Attach / Dropbox / Google Drive / Enter manually" buttons (VERIFIED).
- Whether the file goes inside the final body or as a separate upload that returns a URL or id is ASSUMED unknown.
- The documented server-side Job Board API accepts `resume` (multipart), `resume_content` plus `resume_content_filename` (JSON base64), `resume_url` plus `resume_url_filename`, or `resume_text` (VERIFIED, greenhouse-api-docs `_applications.md`). That API needs the board's API key over HTTP Basic auth and "!!REQUEST MUST BE PROXIED ON YOUR SERVERS!!", so it is employer-side only and not a candidate path.

**Bot check.**
- reCAPTCHA Enterprise, score-based: `https://www.recaptcha.net/recaptcha/enterprise.js?render=6LfmcbcpAAAAAChNTbhUShzUOAMj_wY9LQIvLFX0` (VERIFIED, all 5; the same sitekey everywhere, so it is Greenhouse's key, not the employer's).
- The badge `div.grecaptcha-badge` is `display:block; position:fixed`, and the hidden `<textarea name="g-recaptcha-response">` is present (VERIFIED).
- `render=<sitekey>` is the score-based, no-checkbox mode. Its token is minted by `grecaptcha.enterprise.execute()`, which sites normally call at the submit click (ASSUMED for Greenhouse: the script bodies were stripped). Tokens are short-lived and single-use per Google's documentation (ASSUMED here; the docs host was unreachable).
- The token field is `g-recaptcha-response` (VERIFIED: the textarea name).

**Email verification code.**
- No code field before submit in any fixture (VERIFIED: grep).
- Our 2026-10-14 probe of one tenant found none either ("Email verification to apply? None. [probed]", `docs/career/board-automation-map.md`) (REPORTED, internal).
- The brief says Greenhouse sends codes for some boards after submit. I could not reach support.greenhouse.io to confirm the wording or which boards (REPORTED, unconfirmed). Treat a post-submit "security code" prompt as a real possibility (gap 5).

**Confirmation.** The page text and URL after submit, and the confirmation email's sender and subject, are ASSUMED unknown. The email is employer-templated, so expect "Thank you for applying to {Company}" from a Greenhouse no-reply sender (ASSUMED).

**Limits and spam.**
- The Job Board API page says the hosted form "has built-in spam protection measures" (VERIFIED, `_applications.md`).
- A "spam sensitivity" setting is REPORTED by the brief and not checked.

### 1.2 Greenhouse, legacy (boards.greenhouse.io and the `embed/job_app` iframe)

- No legacy page is in our fixtures. The Databricks posting left job-boards.greenhouse.io for `www.databricks.com/...?gh_jid=` (VERIFIED, manifest `final_url`). That is the embed pattern: the employer's site hosts the Greenhouse iframe.
- Legacy forms are native `POST multipart/form-data` with `job_application[...]` names and `answers_attributes[...]` nesting (ASSUMED, from prior knowledge; not re-checked).
- The engine would refuse the employer's host anyway: `NAV_SUFFIXES` in the helper and `ATS_HOSTS` in 149 (VERIFIED, code).

### 1.3 Lever (jobs.lever.co)

**The request.** A native form (VERIFIED, all 6 fixtures):
- `<form id="application-form" enctype="multipart/form-data" method="POST">` with no `action`, so it posts to the `/apply` URL itself (VERIFIED: measured `formAction()` returns `{method:"post", url:<page>}`, section 7).
- Named fields: `name`, `email`, `phone`, `location`, `org`, `urls[LinkedIn]`, `cards[<uuid>][field0]`, `eeo[gender]`, and `surveysResponses[...]` (53 fields at Lyra Health).
- Hidden fields: `accountId`, `timezone`, `selectedLocation`, `resumeStorageId`, `h-captcha-response`, `consent[marketing]=0`, `source`, `origin`, `referer`, `linkedInData`, `socialReferralKey`, and one JSON `cards[<uuid>][baseTemplate]` per custom card.

**Resume.**
- `<input name="resume" type="file" class="invisible-resume-upload">` is inside the form, so the file travels in the multipart body (VERIFIED).
- A page script `/js/parseResume.js` and the empty hidden `resumeStorageId` show a separate parse/upload step that returns a storage id (VERIFIED names). Its endpoint and timing are ASSUMED.
- During our probe the resume label read "Couldn't auto-read resume. Analyzing resume... Success!" (VERIFIED). Those are the parse widget's status strings.
- Lever's public Postings API "only accepts resumes in multipart form data mode" (VERIFIED, github.com/lever/postings-api).

**Bot check.** hCaptcha, invisible, run at submit (VERIFIED markup):
- `https://js.hcaptcha.com/1/secure-api.js?host=jobs.lever.co&onload=onLoad` (hCaptcha's enterprise "secure API" script).
- An empty `<div id="h-captcha" class="h-captcha" data-sitekey="e33f87f8-88ec-4e1a-9a13-df9bbb1d8120">` on 5 of 6 pages.
- A visible `<button id="btn-submit" type="button">Submit application</button>` and a hidden `<button id="hcaptchaSubmitBtn" type="submit" class="hidden">`.
- The pattern is: click → `hcaptcha.execute()` → a token lands in `<input type="hidden" name="h-captcha-response">` → the hidden submit button posts the form (ASSUMED sequence; the markup is VERIFIED).
- "Invisible" means no button is rendered. Whether a challenge appears "will depend on the sitekey difficulty level", and `execute()` "programmatically trigger[s] a challenge request" (VERIFIED, github.com/hCaptcha/react-hcaptcha README).
- Our 2026-10-14 live probe of Lever's demo tenant met a visible hCaptcha challenge at open (REPORTED, internal board-automation-map).

**Email code.** None observed (REPORTED internal probe; VERIFIED absent from the fixtures).

**Confirmation.** A redirect to a thanks page on the same tenant, with "Application submitted" or similar wording, is ASSUMED. The confirmation email's sender and subject are ASSUMED to be employer-templated.

**Limits.**
- Lever returns 429 when a custom job site sends "more than 2 application POST requests per second" (VERIFIED, postings-api README; this applies to the API path, not the hosted form).
- The API's success response is `{ok:true, applicationId}` (VERIFIED, same source). The hosted form exposes no id.

### 1.4 Ashby (jobs.ashbyhq.com)

**Page.** A React SPA with no `<form>` element (VERIFIED: 0/6 in raw HTML and 6/6 rendered, per the WO-009b table; `forms: 0` in the manifest).
- The form is built from GraphQL queries POSTed to `/api/non-user-graphql`. Our CI renderer had to let GraphQL queries through for the form to render at all (VERIFIED: `scripts/career/render-form.cjs` lines 68-77 and the test in `tests/career-form-ci-fixtures.test.cjs`).

**The request.**
- Submission is a GraphQL mutation to the same endpoint with a JSON body (ASSUMED. The endpoint family is VERIFIED; the operation name and the shape of the field submissions are not. Read them in the first headed trial).

**Resume.**
- `<input id="_systemfield_resume" type="file" required>` with no name, behind a dropzone (VERIFIED, all 6).
- The page says "Drop your resume here! Parsing your resume. Autofilling key fields..." (VERIFIED text, OpenAI fixture). So a resume upload triggers a server parse and an autofill of other fields.
- A separate upload request that returns a file handle (likely off-origin storage) is ASSUMED.

**Bot check.**
- reCAPTCHA Enterprise score-based: `enterprise.js?render=6LezdY0tAAAAAEnollNLCAI0z1VDGwM7AzGrU4XZ&onload=onLoadReCaptcha`, the same sitekey on all 6 (VERIFIED).
- A visible fixed badge and a `g-recaptcha-response` textarea (VERIFIED).
- Execute at submit is ASSUMED. Where the token goes is ASSUMED: probably a field in the mutation's JSON, not a form field.

**Email code.** None observed (REPORTED internal probe; VERIFIED absent from the fixtures).

**Confirmation.** An in-page "Thank you for applying" view with no URL change is ASSUMED.

**Limits.** Published per candidate, on the form itself (VERIFIED, quoted from the fixtures):
- OpenAI: "Candidates may not apply more than 5 times in any 180 day span."
- Harvey: "You can submit up to 4 applications to Harvey in any 30-day period... you're welcome to reapply to it after 90 days."
- Lilt: "Candidates may not re-apply to the same role within 90 days if not presented with an offer."
- Each sits under the heading "This job has application limits".

### 1.5 Workday (*.myworkdayjobs.com)

- **Accounts.** One account per employer tenant (email, password, email verification), multi-page application (REPORTED: internal `board-automation-map.md` [vendor flow] and DECISIONS D-013).
- **Our host gate refuses it** (VERIFIED: `ATS_HOSTS` in 149 lines 62-67 and `NAV_SUFFIXES` in the helper line 75).
- **Job listings** come from an undocumented JSON endpoint, `POST /wday/cxs/{tenant}/{site}/jobs` (REPORTED, internal spec 2, source S6). The application requests themselves are ASSUMED to be JSON calls under `/wday/cxs/`.
- **Tsenta's `/workday-api` URL** hints at direct API submission (REPORTED, BUILD-STANDARD 6.1, itself ASSUMED).
- **Bot management** "at the provider's discretion" (REPORTED internal).

### 1.6 SmartRecruiters (jobs.smartrecruiters.com/oneclick-ui/…)

- **All 6 application pages answered 403 behind DataDome** (VERIFIED: manifest, `bot_check: ["datadome"]`; `build-form-fixtures.cjs` maps `captcha-delivery.com` to DataDome).
- WO-009b concluded it is not automatable under the standing rules: the posting is shown and the person applies in their own browser (REPORTED, internal decision).
- The submission mechanics are ASSUMED to be JSON API calls from the oneclick-ui SPA.

### 1.7 iCIMS (careers-*.icims.com)

- A candidate profile (login or create) per employer portal, with email verification on most tenants and reCAPTCHA on login and registration (REPORTED, internal [vendor flow]).
- Refused by the host gate (VERIFIED code).
- Often embedded in an iframe on the employer's site (ASSUMED).

### 1.8 Summary table

| ATS | Submit request | Resume | Bot check, when | Token field | Email code | Engine today |
|---|---|---|---|---|---|---|
| Greenhouse new | JS request from React state; the form is GET with no named fields (VERIFIED); endpoint ASSUMED | unnamed file input; transport ASSUMED | reCAPTCHA Ent. score-based, loads at page load (VERIFIED), executes at submit (ASSUMED) | `g-recaptcha-response` (VERIFIED) | after submit on some boards (REPORTED) | stops at bind, first observe (VERIFIED, measured) |
| Lever | native multipart POST to `/apply` (VERIFIED) | `resume` in the body (VERIFIED) plus a parse step that sets `resumeStorageId` (names VERIFIED) | hCaptcha invisible, run at the click (VERIFIED markup) | `h-captcha-response` (VERIFIED) | none seen | reaches dry-run review (VERIFIED, measured) |
| Ashby | GraphQL mutation, JSON (endpoint family VERIFIED, op ASSUMED) | unnamed input plus a separate upload (ASSUMED) and autofill (VERIFIED text) | reCAPTCHA Ent. score-based (VERIFIED) | inside the JSON (ASSUMED) | none seen | the page cannot load under the route; then stops at bind (VERIFIED) |
| Workday | JSON under `/wday/cxs` (ASSUMED) | own upload (ASSUMED) | tenant bot management (REPORTED) | n/a | at account creation (REPORTED) | host refused (VERIFIED) |
| SmartRecruiters | SPA API (ASSUMED) | ASSUMED | DataDome 403 at load (VERIFIED) | n/a | ASSUMED | wrong-reason stop (gap 12) |
| iCIMS | profile flow (REPORTED) | ASSUMED | reCAPTCHA at login (REPORTED) | n/a | profile creation (REPORTED) | host refused (VERIFIED) |

---

## 2. Ashby has no `<form>`: what an engine bound to a form action must change

**What happens today** (VERIFIED, code and fixtures):
1. **The page never builds.** Before approval the route aborts every non-GET request (`apply.ts` lines 385-386: `if (!["GET","HEAD"].includes(req.method())) { if (!allowSubmit || …) abort }`). Ashby's GraphQL *queries* that build the form are POSTs, so they are aborted at load. Our renderer needed exactly this exception (`render-form.cjs` `readOnly()`).
2. **Even rendered, binding stops.** The required resume input has no `name`. `bind()` line 122 throws `UNNAMED_REQUIRED_FIELD: Resume` (measured on the static copy, section 7).
3. **Even bound, the destination stops.** `formAction()` (lines 326-334) looks for `control.form || control.closest("form")`. Ashby has neither, so it returns `null` and line 556 throws `SUBMIT_DESTINATION_NOT_BOUND` (measured: `formAction: null`).
4. **Even with a destination, the body check stops.** Line 392 requires `multipart/form-data`. A GraphQL mutation is `application/json`, so the result would be `APPROVED_BODY_MISMATCH`.

**What it needs, in the engine's own terms:**
- **Before approval:** let through POSTs to `/api/non-user-graphql` whose operations are all queries. Reuse `readOnly()` from `render-form.cjs`; it is already tested. Never let a mutation through before approval.
- **Bind by `name || id`.** Ashby's text inputs have `name == id` (UUIDs and `_systemfield_*`). The file input has only an `id`.
- **Replace "the destination is the form's action"** with a per-ATS **submission descriptor**: origin, path, method, content type, and the operation name of the one mutation the person approved. The approval screen shows that descriptor instead of a URL alone.
- **Replace the multipart parser on the wire** with a per-ATS **body reader** that maps the request to `{field id → value, file → sha256}`. Compare it with `wire` exactly as today: same keys, same values, no extras, the token field allowed.
- **Treat the resume upload as part of the approved payload.** The upload request (the handle mutation and the storage PUT or POST) may run only at fill time, with a body whose bytes hash to the approved resume. It is recorded in evidence as a second, pre-approved mutation of kind `resume_upload`. Today's `mutations` counter conflates the two.

---

## 3. Greenhouse react-select comboboxes: how their values appear in the payload

- **What we see** (VERIFIED, fixtures):
  - Each combobox is `<input class="select__input" role="combobox" id="question_…">` with no `name`.
  - Its only sibling is a `<input required class="…-requiredInput" value="">` validation dummy, which the helper already skips (helper line 237).
  - No hidden input carries the chosen value. react-select renders one only when given a `name` prop, and none is given.
  - So the chosen option exists only in React state. Whatever is submitted is serialized by the page's code, not by the DOM.
- **What the value probably is.** Greenhouse's published question schema gives each select option as `{label, value: <integer id>}`, and multi-selects as arrays. The repo's own fixtures and `greenhouseQuestions()` in `career_apply.ts` lines 64-73 read that shape (REPORTED: internal test fixtures `tests/architect/wo-009-plan.test.ts` lines 21-22). The new UI most likely submits the option's id, not its label (ASSUMED).
- **Consequence for the engine** (VERIFIED, code):
  - `wire[f.name] = f.value` (lines 519-523) records the confirmed answer text ("Yes") for a react-select binding.
  - The readback (helper `fnWidgetValue`) compares the rendered label. That is correct for the screen.
  - On the wire the value will be an option id, or an object, so the body check fails.
- **The fix.** The Greenhouse body reader maps `option id → label` using `?questions=true` from boards-api, which the engine already fetches in planning. It compares labels on both sides, and refuses an id that is not in the question's published `values`.

---

## 4. Competitors: invisible checks, email codes, Workday accounts, failures

Nothing in this section could be re-checked this session (see section 0). Rows are REPORTED from our own internal docs, or ASSUMED. Do not build on an ASSUMED row; it says what to check.

| Product | Where it runs | Invisible reCAPTCHA / hCaptcha at submit | Email verification codes | Workday accounts | On failure |
|---|---|---|---|---|---|
| **Simplify** (Copilot) | browser extension in the person's own browser (REPORTED: spec 2, source S22 simplify.jobs/copilot) | the person's own browser runs the check; the person clicks submit (ASSUMED) | the person handles them in their own inbox (ASSUMED) | the person signs in or creates the account in their browser; Copilot fills (ASSUMED) | **"fails the application rather than guess"**, says it will ask mid-flow later (REPORTED: BUILD-STANDARD 3.3 and 3.6 cite Simplify's help pages as VERIFIED; I could not re-fetch them, proxy 403) |
| **Tsenta** (YC S26) | server-side agent plus extension, 19 named ATSes (REPORTED: BUILD-STANDARD 2.3) | not stated; its FAQ does not promise automation is undetectable (REPORTED, BUILD-STANDARD 2.8) | reads the connected inbox and enters codes mid-application (REPORTED: BUILD-STANDARD 2.4; D-013) | says it does account creation, email verification and one-time codes on 30+ systems (REPORTED, D-013) | failed applications are refunded to the cycle (REPORTED, BUILD-STANDARD 2.5) |
| **Jobright** | autofill extension plus an "agent" product (ASSUMED) | unknown | unknown | unknown | unknown |
| **LazyApply** | extension that auto-submits on job boards (REPORTED: spec 2, S22 terms page) | unknown | unknown | unknown | 2.1 Trustpilot stars (REPORTED: BUILD-STANDARD 6.3 marks it VERIFIED); terms put compliance on the user (REPORTED, spec 2) |
| **Massive** (usemassive.com) | applies on the person's behalf (ASSUMED) | unknown | unknown | unknown | unknown |
| **JobCopilot** | auto-apply on company career sites (ASSUMED) | unknown | unknown | unknown | unknown |

**The "fail rather than guess" posture.**
- Simplify is the only product our docs record with an explicit written posture (REPORTED).
- Trainee's engine already behaves that way:
  - unknown required field → `needs_answers`;
  - unconfirmed default → `UNCONFIRMED_DEFAULT`;
  - unexplained hidden field → `UNCONFIRMED_HIDDEN_FIELD`;
  - body differs from approval → `APPROVED_BODY_MISMATCH`.
- The standard asks for the next step: resolve instead of fail (3.6 hand-off). That is where the gaps in section 6 sit.

---

## 5. Receipts: what competitors show as proof, and what the ATSes send

**Competitors:**
- **Tsenta** claims a receipt per application with fields filled, answers written, documents sent and "the employer's confirmation" (REPORTED: BUILD-STANDARD 2.5, "VERIFIED as a claim; not verified in practice").
- **Simplify** tracks applications in its tracker when the person submits through Copilot (ASSUMED).
- **Others:** unknown.

**The ATSes:**
- The only primary-source receipt found is Lever's API answer `{ok:true, applicationId}` (VERIFIED, postings-api), which applies to the API path only.
- Hosted-form confirmations (thank-you page text, URL, email sender and subject) are ASSUMED for all six ATSes. They are employer-templated and must be read from the owner's own trials. WO-009b already requires the confirmation email as the evidence for the first 3 trials per ATS.

**What Trainee stores today** (VERIFIED, `apply.ts`):
- the payload with its hash, readback and page fields;
- `before-review.png` and `after-submit.png`;
- `post.status`, `url_after` and up to 4,000 characters of page text;
- `classifyOutcome` decides `confirmed` from page wording (career_apply.ts line 21).

**What is missing:** the POST's response body, an ATS-specific confirmation signature, and the confirmation email (gaps 9 and 13).

---

## 6. Ranked gap list, worst first

### 6.0 Already handled in the working copy (uncommitted; each needs a test before it counts)

**W1. Captcha-provider requests now pass.**
- `CAPTCHA_PROVIDER` (lines 41-42) and the pass-through at lines 370-374.
- At HEAD, `populated && !same` and the non-GET rule aborted reCAPTCHA's execute call and hCaptcha's API calls. Every Greenhouse, Lever and Ashby submit would have produced no token.
- **Test:** a local page whose submit handler awaits a stand-in `/captcha-provider/` POST and then posts the form. Assert exactly one POST arrives and the token is recorded only by length.

**W2. The token is allowed in the body and the hidden-field checks.**
- `CAPTCHA_TOKEN` (line 45, lines 309, 403-408, 480).
- **Test:** a hidden `h-captcha-response` filled at click time reaches the server, and no `UNCONFIRMED_HIDDEN_FIELD` is raised.

**W3. The detector no longer counts the badge or an empty container.**
- Helper `fnDetectChallenge`, rewritten.
- At HEAD it stopped 5 of 6 Lever forms at open (REPORTED: WO-009b-3 review).
- **Measured now:** the Lever copy got past open to the review (section 7).
- **Test:** all 6 Lever and 5 Greenhouse fixture copies pass open; a page with a visible `…/recaptcha/…/bframe` iframe stops.

**W4. Submit-time hand-off.**
- Lines 651-675: a challenge after the click waits for the person under `--handoff`, otherwise `CAPTCHA_AT_SUBMIT` and `not_sent`.
- **Residual issue:** after the person presses Enter, the POST is awaited for only 30 s (line 657). A slow resume upload overruns that, and the late POST is then aborted because `allowSubmit = false` (line 671). That is safe but loses the application.
- **Test:** a stand-in challenge whose completion triggers the POST after 35 s ends `not_sent`, not `unknown`. Raise the wait, or keep it open until the person says done.

### Gap 1. Greenhouse: the engine binds fields by `name`, and the new UI names nothing

- **Missing:** id-based binding. `bind()` lines 120-123:
  ```ts
  const name = f.name;
  if (!name) {
    if (f.required) throw fail("UNNAMED_REQUIRED_FIELD: " + f.label);
    continue;
  }
  ```
  The helper reports `name: el.getAttribute("name") || ""` (helper `fnDiscoverFields`).
- **Evidence:**
  - VERIFIED from the fixtures: 1-2 of 13-52 controls named on all 5 Greenhouse forms.
  - VERIFIED, measured: the dry run on the Prolific copy returned `{"state":"not_submitted","reason":"UNNAMED_REQUIRED_FIELD: First Name*"}`.
- **Failure:** every Greenhouse job-boards application stops at the first `observe()` (line 461), before one field is filled. That is 0 of 5 captured Greenhouse forms and, by the shared markup, every new-UI board.
- **Fix:** bind with `const name = f.name || f.id`. Greenhouse ids are the published question names (`first_name`, `email`, `resume`, `question_9668368101`), matching boards-api `?questions=true` (VERIFIED, manifest `questions_url`). Keep the `AMBIGUOUS_FIELD_NAME` guard. Use `[name]` only for native-form ATSes, through the per-ATS adapter in gap 2.
- **Test:** serve `greenhouse-prolificacademicltd-4979452101.html` stripped (the same harness as `tests/career-apply-script.test.cjs`) with synthetic answers for every required question.
  - Assert the dry run reaches `dry_run`.
  - Assert every required question appears in `evidence.fields` keyed by its id.
  - Assert `readback.resume.sha256` equals the approved sha.

### Gap 2. The submit destination is bound to a native `<form method=post>` and the body must be multipart; two of the three launch ATSes submit by script

- **Missing:** a per-ATS submission descriptor and body reader (section 2).
  - Today `formAction()` (lines 326-334) returns the enclosing form's `action` and `method`.
  - Lines 553-556 require `method === "post"`.
  - Line 392 requires `multipart/form-data`.
  - Lines 393-428 match multipart entry names against `wire`.
- **Evidence:**
  - VERIFIED, measured `formAction()` on the local copies: Greenhouse `{"url":".../prolificacademicltd/jobs/4979452101","method":"get"}`; Ashby `null`; Lever `{"method":"post"}`.
  - The JS request shape is ASSUMED for both Greenhouse and Ashby.
- **Failure:**
  - Even after gap 1, every Greenhouse run stops at line 556, `SUBMIT_DESTINATION_NOT_BOUND`, before the approval prompt, because the form is GET.
  - Every Ashby run stops there because there is no form.
  - If the destination were bound, the JS request (JSON, or multipart keyed by something other than DOM names) would fail the body check at line 392 or 417 as `APPROVED_BODY_MISMATCH` after the person said yes.
- **Fix:** an `ats` adapter chosen by `target` family, with three parts.
  - (a) `destination()`: Lever keeps the form action. Greenhouse and Ashby return a pattern (same origin and tenant, method POST, path or operation pinned from the owner's first headed trial and committed as data).
  - (b) `readBody(req)` returns `Map<fieldId, string | {filename, sha256}>`: multipart for Lever, JSON for Ashby and Greenhouse.
  - (c) the approval line prints the descriptor.
  - The rest of the route stays: one mutation, exact match, no extras, token by length.
  - Until (a) is pinned from a real trial, the run should stop at review with `SUBMIT_DESCRIPTOR_UNKNOWN` and the posting link, not guess.
- **Test:** a local page with no `<form>` whose button sends `fetch(POST, JSON {fields:{id:value}})`.
  - Assert the dry run prints the descriptor.
  - Assert `--submit yes` sends exactly one request the server receives with the approved values.
  - A variant whose handler alters one value must end `APPROVED_BODY_MISMATCH` with zero receipts.

### Gap 3. Ashby cannot even render under the engine's route

- **Missing:** a read-only GraphQL exception before approval.
- **Evidence:**
  - VERIFIED: `render-form.cjs` lines 68-77 had to allow GraphQL query POSTs for the CI capture to see any Ashby form, and the fixtures show 0/6 Ashby forms in raw HTML.
  - VERIFIED code: `apply.ts` lines 385-386 abort them.
- **Failure:**
  - On a live Ashby page, the form-building queries are refused, so the SPA has no fields.
  - With no fields, `planBatch` has nothing to answer and the review sees no submit control (`FINAL_REVIEW_NOT_OBSERVED`), or the SPA's error page is observed (ASSUMED exact symptom).
  - Behind that sit gap 1 (`UNNAMED_REQUIRED_FIELD: Resume`, measured) and gap 2.
- **Fix:** before `allowSubmit`, call `route.continue()` for a POST to `{origin}/api/non-user-graphql` exactly when `readOnly(req)` from `render-form.cjs` is true, and only from the main frame. Record each operation name in evidence.
- **Test:** a local SPA page that builds its inputs from a `POST /api/non-user-graphql` query.
  - Assert the dry run sees the inputs.
  - A page that issues a `mutation` before approval must have it aborted, with the run stopping `not_submitted`.

### Gap 4. The resume is assumed to travel inside the final body, so separate upload requests are silently dropped

- **Missing:** a resume-upload step in the transport model.
  - At fill time (`populated` is true from line 502), off-origin requests are aborted (line 381) and every non-GET is aborted (lines 385-386).
  - The readback then checks only the input element: helper `readbackBinding`, `const f = el.files && el.files[0]` (lines 521-522).
- **Evidence:**
  - VERIFIED: Lever's `parseResume.js` and `resumeStorageId`, and Ashby's "Parsing your resume. Autofilling key fields...".
  - ASSUMED: the Ashby and Greenhouse upload requests themselves.
- **Failure:**
  - On Ashby (and Greenhouse, if it uploads separately) the file never reaches the employer, yet `values.resume` reads back with the right sha. `RESUME_INPUT_NOT_OBSERVED` (line 551) passes.
  - The run then either fails the employer's own "resume required" check after the person approved, or, if the employer does not require it, submits an application **without the resume while the receipt says the resume was sent**.
  - That is a silent failure, which the standard (3.3) treats as launch-blocking.
- **Fix:**
  - A per-ATS `resumeUpload` rule allows exactly one upload request (or the handle request plus the storage PUT) at fill time, only for the resume binding, only when the uploaded bytes hash to `artifact.sha256`.
  - Record the returned handle or id, then require that id in the final body (`wire.resume = {handle}`).
  - Lever: keep the parse request blocked (privacy) and accept an empty `resumeStorageId`, because the file is in the body. That needs one live trial to confirm Lever accepts it (ASSUMED).
- **Test:** a local page that, on file `change`, POSTs the file to `/upload` and stores the returned id in a JS variable that its submit sends.
  - With today's code, assert the server receives a submit with no file or id. This is the silent failure, and the test must show it first.
  - After the fix, assert the upload body sha matches and the submit carries that id.

### Gap 5. An email verification code after submit strands the application

- **Missing:** a code hand-off inside the same session.
  - Before submit, the engine stops on a code label (line 485). After submit, a code prompt only sets `email_code_prompt` (lines 694-697).
  - `classifyOutcome` returns `needs_user / email_code` (career_apply.ts line 27); that state is `COUNTED` (line 44) and is written to the store (lines 699-705).
  - `finally` then closes the browser (line 726). A second POST (the code) would be refused anyway: `mutations` is non-zero (line 386) and `allowSubmit = false` (line 671).
  - A re-run cannot help: `existing.state !== "not_sent"` (line 198) sends it to `READBACK_REQUIRED`.
  - The text regex at line 694 also lacks "security code", which the field regex at line 696 has.
- **Evidence:**
  - VERIFIED: the code paths.
  - REPORTED: Greenhouse codes on some boards (the brief; the docs were unreachable).
  - REPORTED: Tsenta enters codes from the inbox.
- **Failure:** on a board that sends a code after the first POST, the application is half-made at the employer, Trainee records `needs_user`, the window that could take the code is closed, and Trainee will never finish or retry it. The person must start over by hand, and the posting stays counted against the 15 a day.
- **Fix:** on `email_code_prompt` with `mutations === 1`, keep the session open and print one line: "<Employer> sent a code to <email>. Type it into the browser window, then press Enter here."
  - Permit exactly one more POST to the same origin and tenant whose body reader yields only the code field, plus the token and page fields.
  - Never read, log or store the code: the person types it in the window, and the body check records it by length only, as the token is.
  - Then classify. Without `--headed`, record `needs_user / email_code` and keep it out of `COUNTED`, as a distinct `awaiting_code` that the person can finish by opening the posting.
- **Test:** a fixture server whose first POST answers with a page holding `<label>Security code</label><input name="security_code">`, and whose second POST with a correct code answers "Thank you for applying".
  - Simulate the person with a page script that fills the code 2 s after load.
  - Assert two POSTs, the second carrying only `security_code`, the outcome `confirmed`, and no code value in `evidence.json` or stdout.

### Gap 6. One failed subresource fetch crashes the run with no evidence

- **Missing:** error handling around `route.fetch`.
  - Line 437, `const response = await route.fetch({ maxRedirects: 0 });`, sits inside the `page.route` callback.
  - A rejection there is not inside `runApply`'s `try`, so Deno treats it as an uncaught promise rejection.
- **Evidence:** VERIFIED, measured. On the Greenhouse copy with its logo `<img>` left in, the run died with `error: Uncaught (in promise) Error: route.fetch: getaddrinfo ENOTFOUND s101-recruiting.cdn.greenhouse.io`, exit 1, and no `evidence.json` in the evidence directory.
- **Failure:**
  - Any transient DNS or network error on any image, font or tracker kills the run, with no reason recorded.
  - If it happens after the fence (line 645), for example on the thank-you page's assets, the store is left at `submitting` with no evidence. The next run reports `READBACK_REQUIRED` forever and the person is never told what happened.
- **Fix:**
  - Wrap the whole route body in `try/catch`.
  - A failed GET subresource gets `route.abort("failed")`.
  - A failed destination POST sets `evidence.transport_error`. Do not decrement `mutations`: the request may have reached the server.
  - Write evidence from a process-level `unhandledrejection` guard as a last resort.
- **Test:** serve a fixture copy containing `<img src="https://unresolvable.invalid/x.png">`.
  - Assert the dry run still reaches its normal result and writes `evidence.json`.
  - A variant where the image loads only on the thank-you page after a real local POST must end `confirmed` or `unknown_outcome` with evidence written.

### Gap 7. `--submit` runs headless by default, which is the posture invisible score checks are built to reject

- **Missing:** a rule that a page with a verification check is submitted only from the person's visible browser.
  - Helper line 61: `headless: process.env.UPMORE_BROWSER_HEADED !== "1"`.
  - `apply.ts` line 59: `--handoff` alone leaves the browser headless, yet `handOff()` (line 339) tells the person to "Complete it yourself in the browser window", a window that does not exist.
- **Evidence:**
  - VERIFIED: the code.
  - REPORTED: WO-009b's own gate ("A headless browser on a server is what those checks are built to catch").
  - VERIFIED, measured: the probe's user agent was `HeadlessChrome/141`.
- **Failure:**
  - On Greenhouse and Ashby, a headless `--submit` gets a low invisible score. That is either a silent spam-flag (the POST is accepted, the application is quietly discarded) or an error page. The engine would then classify `confirmed` from thank-you text, or `failed`, without knowing which.
  - `--handoff` without `--headed` hangs for three Enter presses on an invisible window.
- **Fix:**
  - Make `--handoff` imply `--headed`.
  - Refuse `--submit` without `--headed` when `evidence.payload.verification` (lines 565-567) is non-empty: `VERIFICATION_NEEDS_PERSONS_BROWSER`.
  - No stealth and no fingerprint changes: the honest fix is the person's visible browser, or the extension path (BUILD-STANDARD 6.2).
- **Test:** a local page with a stand-in `/captcha-provider/` script.
  - `--submit` without `--headed` must stop before the click with that reason and zero receipts.
  - `--handoff` alone must set `UPMORE_BROWSER_HEADED=1`. Assert it on the env or through a spy on `createSession`.

### Gap 8. After the first fill, every off-origin GET is aborted, including the ATS's own static CDN

- **Missing:** a per-ATS list of first-party static origins.
  - Line 381, `if (populated && !same) abort`, applies to every request except the captcha provider.
- **Evidence:**
  - VERIFIED: the Greenhouse page loads assets from `job-boards.cdn.greenhouse.io` and Ashby from `cdn.ashbyprd.com` (fixture `<link>`/`<script>` origins).
  - ASSUMED: lazy route chunks are fetched after the click.
- **Failure:** a chunk the SPA loads at submit or for the thank-you view (a dynamic `import()` of the confirmation route) is aborted. The page throws and shows no confirmation, so a real submission classifies as `submitted_unconfirmed` or `not_submitted: nothing changed`.
  - The record then reads not-submitted while the employer holds the application. That is a false negative a person may "fix" by applying again by hand.
- **Fix:** allow GET (never non-GET) to `job-boards.cdn.greenhouse.io`, `*.cdn.greenhouse.io` and `cdn.ashbyprd.com` after `populated`, from the adapter. Log every aborted off-origin GET into `evidence.blocked_requests`, so an outcome is never judged without knowing what was cut.
- **Test:** a local page that fills fine, then on submit does `await import("http://localhost:<port2>/confirm.js")` before rendering "Thank you for applying".
  - With `localhost:<port2>` listed as a first-party static origin in the test adapter, assert `confirmed`.
  - Unlisted, assert `evidence.blocked_requests` names it.

### Gap 9. "Acknowledged" means only the HTTP status, and the employer's response body is not kept

- **Missing:** a per-ATS reading of the submit response.
  - Line 35: `acknowledged = status >= 200 && status < 400`.
  - Line 677 uses only that. `route.fetch`'s response body is never stored.
- **Evidence:**
  - VERIFIED: the code.
  - ASSUMED: Ashby's GraphQL mutation returns HTTP 200 with an `errors` array on a rejected application, as GraphQL servers conventionally do.
  - VERIFIED: Lever's API returns `{ok:false, error}` with an error code.
- **Failure:** a rejected Ashby submission (a validation error, or "application limit reached") reads as acknowledged. The outcome then rests on page text alone, and the receipt has nothing from the employer to show.
- **Fix:**
  - Keep `await response.body()` for the destination request: the first 64 KB, hashed, in evidence.
  - Add `adapter.ack(status, body) → {accepted, applicationId?, errors[]}` and feed `errors` into `validation_errors`.
- **Test:** a local JSON endpoint that answers 200 `{"errors":[{"message":"Candidate already applied"}]}`. Assert the outcome is `failed` with that message, not `confirmed`, `submitted_unconfirmed` or `not_submitted: nothing changed`.

### Gap 10. Fields the page sets in response to a confirmed answer are treated as unconfirmed

- **Missing:** a rule for derived values.
  - `unconfirmed()` (lines 306-324) throws on any hidden or invisible field whose value is not the load-time `pageFields`.
  - Lines 300-305 throw `UNCONFIRMED_DEFAULT` on any visible field that holds a value nobody planned.
- **Evidence:**
  - VERIFIED: Lever's hidden `selectedLocation` next to an autocompleting `location` input (`retrieveLocations.js`), `resumeStorageId` next to `parseResume.js`, and Ashby's "Autofilling key fields..." on resume upload.
  - ASSUMED: the precise triggers.
- **Failure:**
  - If the person's confirmed facts include a location, a Lever fill that picks from the autocomplete sets `selectedLocation` and the run stops `UNCONFIRMED_HIDDEN_FIELD: selectedLocation`.
  - On Ashby, if parsing ever runs (after gap 4), the autofill writes into unplanned fields (`UNCONFIRMED_DEFAULT`) or over planned ones (`READBACK_MISMATCH`), depending on fill order.
- **Fix:**
  - Fill the resume first, then let the page settle, then fill and read back the confirmed facts, so the person's answers win.
  - Clear every unplanned field the autofill touched, and record what it tried to set.
  - Allow per-ATS derived hidden fields only when they are a pure function of a confirmed answer. For example, `selectedLocation` must be the JSON of the option whose label equals the confirmed location. Show them in the review under "Set by the employer's page from your answer".
- **Test:** a Lever-shaped local page whose location input, on `change`, sets `selectedLocation` to `{"name":<value>}`. Assert the dry run passes, the review prints it, and the body carries it.

### Gap 11. Published per-candidate application limits are not read

- **Missing:** limits per employer.
  - The engine admits 1 per company per 30 days and 15 a day (`career_apply.ts` lines 41 and 57-58).
  - Nothing reads the form's own limit notice, and nothing recognizes a "limit reached" answer.
- **Evidence:** VERIFIED, quoted in section 1.4: OpenAI allows 5 per 180 days, Harvey 4 per 30 days and reapplying to a role after 90 days, Lilt no reapplying to a role within 90 days.
- **Failure:**
  - Six OpenAI applications 30 days apart are all admitted. The sixth breaks the employer's stated rule, which can mark the person as a spam applicant at an employer they care about.
  - A reapplication to the same Lilt or Harvey role inside 90 days counts against the person.
- **Fix:**
  - Parse the "This job has application limits" block into `{count, days, sameRole}` during observe.
  - Store it per company. `admitApplication` takes `limits` from it and from the store.
  - Answer `employer_limit` with the quoted sentence.
- **Test:** the OpenAI fixture copy plus a store with five OpenAI entries in the last 180 days must stop `employer_limit` before review, quoting the employer's sentence.

### Gap 12. DataDome walls are not recognized, and SmartRecruiters application URLs do not parse

- **Missing:**
  - The helper's `fnDetectChallenge` knows hCaptcha, Google/recaptcha.net and Turnstile frames, not `captcha-delivery.com`.
  - `open` returns no HTTP status for the main document.
  - `posting()` (lines 64-83) takes `segments[1]` as the SmartRecruiters id, which on `/oneclick-ui/company/{X}/publication/{uuid}` is `"company"`. That gives `POSTING_ID_REQUIRED`.
- **Evidence:** VERIFIED, 6/6 fixtures at 403 with DataDome, plus the code.
- **Failure:** a SmartRecruiters posting either fails at argument parsing, or (on a `/{Company}/{id}-slug` URL) loads a 403 wall that the engine treats as a form page. It ends `needs_answers` with no fields or `FINAL_REVIEW_NOT_OBSERVED`, instead of handing the person the link.
- **Fix:**
  - Record the main-document status in the route.
  - A 403, or a `captcha-delivery.com` frame or script, returns `{state:"needs_user", reason:"bot_wall", link}` with the screenshot.
  - Parse `publication/{uuid}` as the id.
- **Test:** a local route answering 403 with `<iframe src="https://geo.captcha-delivery.com/captcha/…">` must end `needs_user / bot_wall` with zero fills.

### Gap 13. The receipt has no employer-side proof beyond page text

- **Missing:**
  - The confirmation email is not linked to the receipt (WO-009b requires it as the owner-gate evidence; BUILD-STANDARD 3.5 asks for a "confirmation email parsed and stored").
  - There are no per-ATS confirmation signatures (URL pattern, element), and no response body (gap 9).
  - Line 694's text regex misses "security code" and "check your email".
- **Evidence:** VERIFIED, the code and docs.
- **Failure:**
  - `confirmed` rests on the 4,000-character page text matching `SUCCESS`.
  - A thank-you page that says "Thanks!" only reads `submitted_unconfirmed`.
  - A page that says "application received" above a code prompt is caught only if the code field's label matches.
- **Fix:**
  - Add `adapter.confirmation(page)` (URL or element).
  - Add a `receipt.email` slot filled by the person's forwarding or the Gmail reader, matched by employer domain and time window; until it arrives the receipt says "employer email: not yet".
  - Widen the text regex.
- **Test:** a local thank-you page reading only "Thanks!" at `/{tenant}/{id}/thanks` must classify `confirmed` through the Lever adapter's URL signature, and `submitted_unconfirmed` without it.

### Gap 14. Workday and iCIMS are refused at the host gate

- **Missing:** any account-portal path. `ATS_HOSTS` (149 lines 62-67) and `NAV_SUFFIXES` (helper line 75) stop them with `DRIVER_HOST_REFUSED`.
- **Evidence:**
  - VERIFIED: the code.
  - REPORTED: Tsenta names both among its 19 ATSes.
- **Failure:** most large employers apply through these (REPORTED, D-013). Trainee can show the posting but cannot prepare anything.
- **Fix:** this is a policy decision (D-013 pending). Option (b): the person signs in themselves in a headed window, Trainee keeps only the encrypted session, and the code hand-off from gap 5 covers account verification. Until then, return a typed `account_portal` result with the link instead of `DRIVER_HOST_REFUSED`.
- **Test:** `--url https://acme.wd5.myworkdayjobs.com/...` returns `{state:"needs_user", reason:"account_portal"}` with zero browser launches.

### Gap 15. Planner details that stop or slow real forms

- **"Full name✱" is never mapped to `full_name`.** Measured on the Lever copy: `Required confirmed answer: "Full name✱"`.
  - Lever writes the star as `<span class="required">✱</span>` (VERIFIED, all 6 Lever fixtures).
  - The `KEYS` rule `^(full\s*)?name$` (career_apply.ts line 79) fails on the trailing U+2731.
  - So every Lever application asks for a name the person already confirmed.
  - **Fix:** strip `[*✱]` and trailing whitespace before classifying.
  - **Test:** `classifyField("Full name✱","text") === "full_name"`.
- **Any required non-resume file stops the run** (line 505, `UNSUPPORTED_FILE_ARTIFACT`).
  - Greenhouse EOS Fitness has 5 file inputs and Ashby Snowflake 3 (VERIFIED, manifest).
  - **Fix:** confirmed-artifact support for a cover letter.
  - **Test:** a local form with a required cover-letter file and a confirmed cover-letter artifact reaches review.

---

## 7. Measured runs (reproducible)

All runs were local, as the non-root user `pgtest`, in apply.ts's default dry run with no `--submit`. Synthetic facts (`user_id: TEST-PROBE`). Chromium 141 headless, sandbox on.

**The server.** A 12-line Node server (a session probe, not committed) served stripped copies of the fixtures at 127.0.0.1:47811. It removes `<script>` and `<link>` tags and external `src`/`srcset`, and answers GET only.

**The runner.** `deno run -A scripts/apply.ts --url http://127.0.0.1:47811<route>` with synthetic confirmed facts, `--state-dir` and `--evidence-dir` in a fresh private folder. These probes become a committed test: the engine work adds a dry run of every captured form (the regression floor in standard section 9).

| Route (fixture) | Result |
|---|---|
| `/gh` (greenhouse-prolificacademicltd-4979452101) with external images left in | `Uncaught (in promise) Error: route.fetch: getaddrinfo ENOTFOUND s101-recruiting.cdn.greenhouse.io`, exit 1, no evidence.json (gap 6) |
| `/gh`, images stripped | `{"state":"not_submitted","reason":"UNNAMED_REQUIRED_FIELD: First Name*"}` (gap 1) |
| `/ashby` (ashby-lilt-production-…) | `{"state":"not_submitted","reason":"UNNAMED_REQUIRED_FIELD: Resume"}` (gap 1 applied to Ashby; gap 3 not exercised because scripts were stripped) |
| `/lever` (lever-veeva-…), facts only | `needs_answers`: "Full name✱", 2 sponsorship / work-authorization cards, 1 acknowledgement (gap 15) |
| `/lever` with those 4 saved answers | `dry_run`. Review printed 6 fields with fact ids, 5 page fields (two `baseTemplate` JSONs, `accountId`, `timezone = UTC`, `consent[marketing] = 0`), "The page runs a verification check (hcaptcha)", destination `http://127.0.0.1:47811/lever` |

**`formAction()` logic** evaluated on the same pages (a Playwright probe, not committed):

| Page | Result |
|---|---|
| Greenhouse | `{"url":".../prolificacademicltd/jobs/4979452101","method":"get"}`, 1 named of 13 controls |
| Ashby | `null`, 11 named of 13 controls |
| Lever | `{"method":"post"}`, 30 of 30 named |

---

## 8. What remains unverified, and the exact check for each

1. **Greenhouse new-UI submit request** (endpoint, encoding, keys, select values, resume transport). Read it from the owner's first headed `--submit` trial. Add a `--record-request` that logs method, URL, content type and body keys (never values) of the one approved request into evidence. Then pin it in the adapter.
2. **Ashby submit mutation and upload flow.** Same method. Also record the GraphQL operation names seen at load.
3. **Greenhouse email verification.**
   - Fetch support.greenhouse.io for "application verification" / "security code" once the host resolves.
   - Record the exact prompt text into the code regex.
4. **Competitor rows marked unknown or ASSUMED.** Fetch, once the proxy allows:
   - simplify.jobs help pages for captcha, Workday and failure handling;
   - jobright.ai, lazyapply.com, usemassive.com and jobcopilot.com FAQs;
   - the Tsenta FAQ and receipt pages;
   - Trustpilot and Reddit user reports on failed or empty applications.
5. **Confirmation emails.** The sender and subject per ATS come from the owner's own trials (WO-009b `docs/architect/apply-trials.md`).

---

## Sources

**Fetched this session:**
- Lever Postings API README: https://github.com/lever/postings-api (VERIFIED: apply endpoint, multipart-only resume, 2 POST/s limit, `{ok, applicationId}`).
- Greenhouse Job Board API, applications: https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_applications.md (VERIFIED: Basic auth with API key, "must be proxied on your servers", resume fields, "built-in spam protection measures").
- hCaptcha React README: https://github.com/hCaptcha/react-hcaptcha (VERIFIED: invisible mode, `execute()`).

**Local evidence:**
- `eng/tests/fixtures/forms-ci/` (manifest and 17 HTML pages).
- `eng/scripts/apply.ts` (sha256 c9d17609…) and `eng/scripts/career/portal-browser-helper.cjs` (sha256 f0699a6f…).
- `eng/supabase/functions/_shared/career_apply.ts`.
- `eng/packages/domain/149-career-portal-apply.js` and `150-career-portal-browser.js`.
- `eng/scripts/career/render-form.cjs`.
- `comp/docs/architect/work-orders/WO-009b-apply-worker.md`.
- `comp/docs/architect/DECISIONS.md` (D-013).
- `comp/docs/career/board-automation-map.md`.
- `comp/docs/career/upmore-spec2-job-detection-alerts-fast-apply.txt`.
- `comp/docs/product/BUILD-STANDARD-TSENTA.md`.

**Unreachable this session:** proxy 403 for simplify.jobs, jobright.ai, usemassive.com and huntr.co. DNS failure for support.greenhouse.io, developers.greenhouse.io, developers.ashbyhq.com, docs.cloud.google.com and docs.hcaptcha.com. The web search budget was exhausted.
