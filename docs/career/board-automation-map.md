# Board Automation Map — CA-03 real-board apply seam

Product research for the career apply engine (modules 149 + 150), gathered
2026-10-13/14 by loading real application entry pages through the same
Playwright stack the driver uses. No personal data, no accounts created,
no applications submitted during this research. Facts are labeled
**[probed]** (observed live in this session) or **[vendor flow]**
(the board's documented/standard candidate flow, not driven here).

Driver posture key: module 150's host gate allows only Greenhouse, Lever,
Ashby, SmartRecruiters (+ localhost test pages). Everything else is
refused at the driver with DRIVER_HOST_REFUSED until its own seam lands.

## The four no-account hosted boards (submit-lane priority)

### Greenhouse — job-boards.greenhouse.io
- Account required to apply? **No.** [probed] The application form is
  embedded directly on the posting page (48 form fields observed on a
  live intern posting at Aquatic Capital Management).
- SSO options? None for candidates. [probed: no sign-in surface at all]
- Email verification to apply? None. [probed]
- Captcha? No captcha technology detected on the probed tenant's page.
  Some tenants enable invisible reCAPTCHA risk scoring; if a visible
  challenge ever appears, the driver stops (§6.3) — see "Captcha
  handoff" below.
- Driver posture: **allowed** — driven live against a real posting
  (Aquatic, 2026-10-14): 34 fields analyzed, 9 filled from confirmed
  facts including the resume upload; the run stopped at `awaiting_user`
  on this employer's 24 custom/education questions, each enumerated as
  an ask — nothing invented (evidence:
  docs/career/evidence/portal-doorstep/greenhouse/).

### Lever — jobs.lever.co
- Account required to apply? **No.** [probed] The /apply URL is the form
  itself (60 fields observed on Lever's own demo/training tenant,
  including a voluntary demographic survey section).
- SSO options? None on the probed tenant. Some tenants enable
  autofill-from-LinkedIn; Upmore never uses it (it would be the user's
  own data pasted by hand instead). [vendor flow]
- Email verification to apply? None. [probed]
- Captcha? **hCaptcha is loaded on the apply page** [probed: script +
  widget present]. It is risk-based — most sessions never see a
  challenge; if one renders visibly, the driver stops with
  CAPTCHA_HANDOFF + screenshot_ref.
- Driver posture: **allowed** — driven live (2026-10-14): the demo
  tenant presents a visible hCaptcha challenge at open, and the run
  stopped with CAPTCHA_HANDOFF and a real captured `screenshot_ref`
  (evidence: docs/career/evidence/portal-doorstep/lever/).

### Ashby — jobs.ashbyhq.com
- Account required to apply? **No.** [probed] The application lives at
  /<company>/<job-id>/application and renders client-side (React SPA —
  fields appear after hydration; the driver waits for them).
- SSO options? None for candidates. [probed]
- Email verification to apply? None. [probed]
- Captcha? No captcha technology observed on the probed tenant.
- Driver posture: **allowed** — doorstep-proven live (Docker posting,
  2026-10-14): `prepared` at the final review with the exact
  would-submit payload snapshot whose sha256 recomputes from the
  committed snapshot, zero fill failures, zero submits (evidence:
  docs/career/evidence/portal-doorstep/ashby/).

### SmartRecruiters — jobs.smartrecruiters.com
- Account required to apply? **No account at entry.** [probed] The
  posting page carries no sign-in, no create-account surface, and no
  password field; applying starts from the posting's "I'm interested"
  call-to-action. SmartRecruiters may offer the candidate an account
  *after* an application to track it — optional, never required to
  submit. [vendor flow]
- SSO options? None observed at entry. [probed]
- Email verification to apply? None observed at entry. [probed]
- Captcha? No captcha technology observed at entry. [probed]
- Driver posture: **allowed**. Note for the driver: this family's apply
  CTA is worded "I'm interested" — the helper's apply-control matcher
  covers it (including the curly-apostrophe rendering "I’m interested").

## Bespoke program-site fellowship forms (MI-104)

One family class — a fellowship program's own site form — with two
instances whose hosts and field sets genuinely differ, so each carries
its own family in the seam (`eightvc`, `kleinerperkins`). Both entries
are staged from the fellowship census 2026-10-15 (§8 / §7); neither
census published an exact field list, so fields are read at drive time
through module 150 and the sandbox boards stage the census summaries.

### 8VC Fellowship — 8vc.com (Webflow)
- What it is: the 8VC Fellowship application form on 8VC's own site
  (census 2026-10-15 §8). A 3-month summer internship placing
  undergraduate students (sophomore through graduating senior) as
  engineers at 8VC portfolio startups; one application covers dozens
  of companies; Engineering + Design pathways; fellows are paid by the
  host company, with a partial housing stipend.
- Deadline: rolling admission **until late January** — the official
  page publishes no exact day/time [census].
- Account required to apply? None observed in the census. Fields are
  read at drive time — the sandbox board's field set is staged from
  the census summary (identity/contact/education/resume = FACT;
  work-authorization/sponsorship screening; the Engineering/Design
  pathway is the applicant's own choice and stays an ask until
  confirmed; the project description and why-8VC fields are free-text
  owner asks that fill only from the owner's own confirmed draft —
  never invented).
- Driver posture: **allowed** (MI-104, branch work/mi104-bespoke-sites) —
  host gate in 149 + 150 + the helper's navigation gate, end-anchored
  so lookalikes (8vc.* on another registrable domain) stay refused;
  doorstep proven tier-2 over captured-form fixtures
  (tests/career-bespoke-sites-portal.test.cjs E-series +
  tests/career-bespoke-sites-browser.test.cjs B1). No live 8VC form
  has been driven and nothing has been submitted through this family.

### Kleiner Perkins Fellows — fellows.kleinerperkins.com
- What it is: the Kleiner Perkins Fellows application on KP's own
  fellows site (census 2026-10-15 §7) — summer engineering internships
  inside KP portfolio companies, SF Bay Area, in person. Top criterion:
  "experience launching a meaningful product/project from scratch"; the
  program also asks about positions of influence in campus
  organizations (the offices themselves are not in the fact bank).
- Deadline: **January 31, 2027, 11:59pm PST** [census — stated in KP's
  own program listing].
- Account required to apply? None observed in the census. Fields are
  read at drive time — the sandbox board's field set is staged from
  the census summary (identity/contact/education/resume = FACT,
  including the CS/engineering/math/physics degree in progress;
  work-authorization/sponsorship screening; the launched-project
  write-up and the campus-leadership write-up are free-text owner asks
  that fill only from the owner's own confirmed draft — never
  invented, because those write-ups are the substance of this
  application).
- Driver posture: **allowed** (MI-104, branch work/mi104-bespoke-sites) —
  host gate in 149 + 150 + the helper's navigation gate, end-anchored
  so lookalikes stay refused; doorstep proven tier-2 over captured-form
  fixtures (tests/career-bespoke-sites-portal.test.cjs K-series +
  tests/career-bespoke-sites-browser.test.cjs B2). No live Kleiner
  Perkins form has been driven and nothing has been submitted through
  this family.

## Account-walled boards (not drivable in this build)

### Workday — *.myworkdayjobs.com
- Account required to apply? **Yes.** [probed: the public posting page
  is an unauthenticated JavaScript shell; the application itself lives
  inside the tenant's candidate app] [vendor flow: candidates are
  prompted to sign in, create an account, or — on some tenants —
  proceed as guest; guest mode is tenant-configured and cannot be
  assumed.] Accounts are **per employer tenant** — one Workday account
  at Nasdaq does nothing at Motorola.
- SSO options? Candidate accounts are email + password per tenant;
  employee SSO is separate and irrelevant to external candidates.
  [vendor flow]
- Email verification? Account creation verifies the email address
  before the application can be submitted. [vendor flow]
- Captcha? Workday runs bot management on tenant shells; challenges
  appear at the provider's discretion. [vendor flow]
- Driver posture: **refused by the host gate** (myworkdayjobs is not in
  the module-150 allowlist). Unblocks with the signed-in session design
  below + the owner's own sessions (CA-03 exit criterion).

### iCIMS — careers-*.icims.com
- Account required to apply? **Yes, in the standard flow** — applying
  routes through a candidate profile (login / create profile) per
  employer portal. [vendor flow; live probe of an Applied Systems
  posting was inconclusive: the page did not finish loading through
  this sandbox's egress within the probe budget — recorded honestly,
  not worked around.]
- SSO options? Many tenants offer social sign-in (Google / LinkedIn)
  on the profile page; tenant-configured. [vendor flow]
- Email verification? Profile creation verifies email on most tenants.
  [vendor flow]
- Captcha? reCAPTCHA appears on iCIMS login/registration surfaces.
  [vendor flow]
- Driver posture: **refused by the host gate** — same unblock path as
  Workday.

### Taleo (Oracle) — *.taleo.net
- Account required to apply? **Yes.** Taleo career sections gate the
  application behind an applicant login; first-time applicants
  register an account per employer. [vendor flow — Taleo job *search*
  pages are public (probed via search index), the apply step was not
  driven: the one live probe was cut short when the probe browser was
  closed by a harness timeout, recorded honestly.]
- SSO options? Generally none for candidates (employer-side SSO only).
  [vendor flow]
- Email verification? Registration uses the email as the account ID;
  verification varies by tenant. [vendor flow]
- Captcha? Varies by tenant; Taleo's age means many tenants have none,
  some have reCAPTCHA on registration. [vendor flow]
- Driver posture: **refused by the host gate** — same unblock path.

## The least-user path for account-walled boards (design — not built)

Where an account is unavoidable, the user should do as close to
nothing as possible, lawfully:

1. **One account per employer tenant**, created at the moment of the
   first real application to that tenant — never pre-created in bulk,
   never shared across employers, never reused credentials.
2. **Created with the user's own confirmed details** (name + email from
   their fact bank). The password is generated inside the credential
   vault: never shown in chat, never written to the repo, a log, or a
   screenshot.
3. **One approval covers it**: the batch approval card names the tenant
   and lists "create your <Employer> candidate account" as part of
   that application, so the user approves once and the account +
   application happen in one session.
4. **Email verification is retrieved, not forwarded**: the verification
   link or code is read from the user's own Gmail (the standing OTP
   pattern) and completed by the driver in the same session. The user
   never copy-pastes a code for a job board again.
5. **Sessions persist per tenant**: the isolated per-user browser
   profile for that tenant is kept (vaulted storage state), so the
   next application to the same employer starts already signed in.
   Revocable per tenant from the connections screen.
6. **Walls stay walls**: if account creation hits a captcha or a
   verification step the driver may not complete, the run stops with
   the handoff link + screenshot_ref and the user does exactly that
   one step — everything before and after stays automated.
7. **The user owns the account**: they can pull the credential from
   the vault at any time and delete the account on the tenant's own
   pages; Upmore's registry keeps only the tenant host + account email.

This design is documentation only. No account was created during the
CA-03 seam work, and building it needs the owner's signed-in session
work (CA-03 exit criterion) plus the vault flow.

## Captcha handoff — where screenshot_ref is produced (captcha-pack M4)

Module 120's handoff ticket cannot mint without a screenshot of the
stopped page. The reference is produced by the driver/host layer:

- Helper (`scripts/career/portal-browser-helper.cjs`): `fnDetectChallenge`
  reports the challenge; the helper never interacts with it.
- Driver (`packages/domain/150-career-portal-browser.js`):
  `captureStopScreenshot(at)` — called by `board.open()` and
  `board.atReview()` the moment a challenge is detected; writes
  `captcha-<boardId>-<at>.png` into the board's evidenceDir and returns
  its path as `screenshotRef` on the open/atReview result (null only if
  the capture itself failed — never fabricated).
- Pipeline (`packages/domain/149-career-portal-apply.js`): both
  CAPTCHA_HANDOFF branches of `runApply` surface it verbatim as the
  result field **`screenshot_ref`**, alongside `handoffUrl`.
- Proven by tests/career-portal-browser.test.cjs (captcha at open +
  captcha at review assert screenshot_ref points at a real PNG of the
  stopped page) and exercised in live runs whenever a board challenges.
- The submit leg follows the same rule: the helper's
  `submit_and_capture` refuses to click through a challenge
  (clicked: false), so a captcha at submit becomes an unknown outcome
  with the handoff, never a forced submission.

## Confirmation capture (armed submit lane)

`board.submit()` in module 150 fires only on a board created with
`submitArmed: true` (the owner-approved submit lane's switch, under
149's approval gate) and clicks exactly once. Immediately after the
click the driver captures the employer's answer — landing-page text,
any confirmation/application ID (read only when the page labels it as
one), and a full-page screenshot (`submit-confirmation-<boardId>.png`).
149 speaks "submitted" **only** when that capture carries an ID or
unambiguous success wording; anything else is `unknown_outcome`, and
`reconcile()` keeps an unverifiable board in unknown_outcome with the
reconcile lock on — an ambiguous landing can never be laundered into a
success or cleared for a blind retry.
