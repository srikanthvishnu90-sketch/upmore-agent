# Trainee assisted-apply extension — design

Spike for Feature Depth Program v2, build order #1 (APPLY ENGINE). The v2
bar this serves: **50+ reviewed applications per 30-minute user session**,
user reviews each form and taps Submit, extension fills in **under 10
seconds per application**, **90%+ field accuracy** on Greenhouse/Lever/
Ashby (70%+ Workday), **zero wrong-answer submissions**, and a
**per-application proof** (screenshot + captured answers + parsed employer
confirmation) for every application. User-facing apply failure **under 2%**
at steady state, with per-portal bot-check telemetry.

What the spike proves, and what it deliberately does not, is in README.md.
This document is the design the spike's shape commits to.

## 1. Posture — why an extension, and what it never does

The extension lives in the **user's own browser session**. That is the
whole architecture (v2: "extension-first"; server browsers would cost
~$37K/mo at 75K users, and a cloud browser's submit click is exactly what
portal bot checks exist to stop). It mirrors how Simplify operates openly:
autofill + human submit.

Hard rules, enforced as code shape, not copy:

- The extension **never clicks Submit**. There is no submit code path in
  the content script. The user reviews and clicks.
- The extension **never touches a captcha or human-verification gate** —
  no solver, no disguise, no interaction. A gate appearing is a telemetry
  event (§5), and the user handles it as themselves.
- The extension **never checks an attestation/certification box**. Module
  150's classifier names attestation fields; the extension's resolver
  returns `needs_user` for them unconditionally — signing a statement of
  truth is the user's legal act.
- The extension **never guesses**. A field resolves only from the user's
  derived answer bank (confirmed facts only, §2). Anything else is
  highlighted on the page and listed in the popup. This is the product's
  no-invention law carried client-side: one wrong-answer submission is
  worse than a hundred highlighted fields.
- The extension **verifies every fill by read-back** before reporting it
  (module 150's BUG-207 law). A fill the page will not hold is a recorded
  failure and the field joins the needs-user list — never a silent
  "filled".

## 2. Answer bank sync — how answers get from the product to the extension

The extension consumes the **derived answer map**, never raw facts. Module
149's `deriveAnswers(bank)` already produces exactly the contract:

```
{ profile: { name, email, phone, location, linkedin, github, website,
             current_company, preferred_name, country, state_of_residence,
             time_zone, date_of_birth,
             education: { school, degree, discipline, start_date, end_date,
                          gpa, graduation_year }, resume: {filename, sha256} },
  answers: { work_authorization: { value, confirmed: true, factId }, ... },
  traces:  { <key>: { factId, how } } }
```

Derivation happens **product-side**, because the rules are product law:
only `status:"confirmed"` facts feed the map; every entry carries the fact
ID it traces to; a fact kind with no derivation and no recorded exemption
fails the product's contract test (module 149's `answerMapCoverage`). The
extension re-deriving answers client-side would fork that law — it does
not. (The spike's fixture bank, `fixtures/answer-bank.alex-testcase.json`,
is a frozen example of this exact shape for the Alex Testcase TEST
persona.)

Sync contract (to build; not in the spike):

- **Authentication**: the user signs in to the extension with their Trainee
  account (the same identity as the product chat). The web app issues a
  short-lived extension token via an authenticated hand-off page
  (`chrome.identity.launchWebAuthFlow` against the product origin); the
  extension stores the refresh credential in `chrome.storage.local` and
  mints access tokens per sync. No password is ever typed into the
  extension.
- **Endpoint**: `GET /career/answer-bank` on the product backend,
  JWT-scoped to the user (RLS: a user can only ever receive their own
  map). Response = the derived map above + `bankVersion` + `derivedAt`.
- **Per-user isolation**: the bank is keyed by user id in storage; sign-out
  wipes it. Two users on one browser profile never see each other's map —
  the same per-user session law (§6.3) the portal driver enforces.
- **Freshness**: sync on browser start, on popup open, and when
  `bankVersion` changes; TTL 24h. A stale bank still fills (facts change
  slowly) but the popup names its age.
- **What never syncs**: unconfirmed facts, other users' data, raw
  documents. The resume travels as `{filename, sha256}` metadata only in
  v1 — the file itself is attached by the user (a content script cannot
  set a file input); a later version can hand the user the exact synced
  file to attach, hash-checked the way module 150 checks it.
- **The ask-once loop** (v2: every unknown question asked exactly once,
  then never again): when the user completes a highlighted field, the
  extension records **the field's label and its bank key only** (never
  the value typed — values are the user's business until they choose to
  bank them) and reports "unbanked field seen: <label>" with the proof
  report (§4). The product asks the user about it once, over iMessage, in
  context ("you filled 'Are you willing to relocate?' by hand — bank
  'Yes' for next time?"). A confirmed yes becomes a fact → next
  `deriveAnswers` → next sync covers the field forever. This is how
  coverage grows 58% → 85% without the extension ever learning behind
  the user's back.

## 3. Porting plan — Lever, Ashby, Workday (reusing 149/150 knowledge)

The fill engine's classifier is **label-first and family-agnostic** —
module 150's `classifyKind` was built against real boards of all four
families, so the classification port carries over unchanged. What differs
per family is the DOM adapter: discovery quirks and widget driving.

- **Lever** (jobs.lever.co): application is a single form; custom
  questions arrive as **cards whose heading is the question** (module
  150's D9 defect: when the direct label is empty, the group/card heading
  IS the label). Adapter work: card-heading label resolution (the
  engine's `groupLabel` path already exists for fieldset legends; Lever
  needs the card-heading variant) + Lever's field naming. Expected effort:
  small — the classifier already speaks Lever's label dialect.
- **Ashby** (jobs.ashbyhq.com): React application forms with custom
  dropdown widgets. Adapter work: widget driving — the engine's
  option-matching already targets rendered option labels; Ashby needs
  the open-then-pick interaction for its non-`<select>` dropdowns
  (module 150's helper drives these as widgets; the same lesson —
  BUG-207's select__input rule — is already in the classifier: widget
  fields labeled "Degree" take the derived level). The fill must use
  native setters + input/change events (already the engine's mechanism)
  so React state accepts the value; read-back verification catches the
  rest.
- **Workday** (account-walled, per-employer accounts): the extension is
  actually the *right* vehicle — it operates inside the user's own
  logged-in session, so the least-user account design (module 150's
  header: per-employer account, user-owned details) needs no credential
  handling at all: the user logs in as themselves, the extension fills
  the steps it recognizes. Multi-page wizard flows mean discovery+fill
  runs per step; the coverage popup counts the current step. The v2 bar
  is lower here (70%+) precisely because Workday forms vary per tenant;
  per-tenant selector packs accumulate from telemetry (§5) the way the
  board directory grew.
- **Each family ships with**: a fixture form in `fixtures/` (same method
  as `demo-form.html`), its own run of the accuracy check (100% of
  banked fills on the fixture before the family is called supported),
  and its entry in the engine's family table. No family is "supported"
  on the strength of the classifier alone — the fixture check is the
  proof, per family.

## 4. Proof capture and the report back

On the post-submit confirmation page, the engine parses the employer's
own confirmation with module 150's `extractConfirmation` rules (ported
verbatim): a confirmation ID counts only in a labeled context with a
digit-bearing token; unambiguous employer success wording counts; **a
still-open application form vetoes the whole page** (BUG-208 — posting
prose must never mint a "submitted"). The proof record:

```
{ employer, role, answersSubmitted: {label: value},
  confirmationId, confirmationText, timestamp, url, screenshot }
```

The background worker screenshots the confirmation tab and files the
record; the popup shows "Application proof saved". The report back to
the product (authenticated, same token as bank sync) is
`POST /career/application-proofs` — in the spike this call is a named
stub (`traineeProofOutbox`, status `queued_local_only`, endpoint
NOT_WIRED): the spike sends nothing anywhere, and says so in the record.

This proof is what feeds the product's tracker and its caps ledger — an
assisted submission is a real submission, counted like any other (module
149's caps read the same submissions ledger).

## 5. The <10s fill budget

Budget decomposition for a ~30-field form on a real Greenhouse page:

| Stage | Budget | Spike measurement |
|---|---|---|
| Discovery (DOM walk + label resolution) | < 500ms | included below |
| Classification + plan (pure logic) | < 100ms | included below |
| Fill writes (native setter + events) | < 1s | — |
| Read-back verification | < 500ms | — |
| **Total engine time** | **< 2s** | **22–33ms** (two runs; 26 logical fields / 28 controls, jsdom) |

The spike's ~30ms is a jsdom number — indicative, not a browser
measurement; jsdom has no layout, no React reconciliation, no network.
The honest claim is narrower: the engine's own logic is two orders of
magnitude under budget, so the real-page risk sits where module 150
already found it — **widget settle time** (typeaheads and react-selects
that clear unpicked text, BUG-207). The engine's defenses are the ones
the driver proved: drive the widget (pick from suggestions) rather than
only setting text, and verify by read-back. The remaining ~8s of the
v2 budget is the user's review time is NOT counted — the 10s is
fill-to-ready, and the user's own completion of highlighted fields is
their pace, by design. Before any "under 10s" claim ships in product
copy, it gets measured in a real Chromium against the fixture form and
three recorded real forms (the marketing rule: no claim the harness
cannot reproduce).

## 6. Failure and bot-check telemetry (the <2% target's instrument)

Events carry **field keys and outcome codes only — never values, never
page text** (the same discipline as module 149's step log):

Per-field event:
```
{ family, fieldKey: profile_key|question_key|'unknown', kind,
  outcome: 'filled_verified' | 'needs_user' | 'fill_failed' | 'no_matching_option',
  reasonCode }
```
Per-application event:
```
{ family, fieldsTotal, answerable, filledOk, fillFailed,
  userCompletedFields, submitSeen, proofCaptured,
  confirmationParsed: bool, botCheckSeen: bool, engineMs }
```

Failure taxonomy (aligned to modules 149/150 stop vocabulary):
`FILL_FAILED`, `WIDGET_REFUSED`, `NO_MATCHING_OPTION`, `UNRECOGNIZED_FIELD`,
`BANK_MISSING`, `CONFIRMATION_UNPARSED`, `BOT_CHECK_AT_SUBMIT`,
`PAGE_SHAPE_CHANGED` (discovery finds no form / field count collapses vs
the family's fixture shape — the drift signal).

Definitions that keep the <2% honest:

- **User-facing failure** = an application attempt where an extension
  error (fill_failed, widget_refused, page_shape_changed,
  confirmation_unparsed after a real submit) prevented completion or
  lost the proof. Needs-user fields, user abandons, and bot gates are
  **not** extension failures — they are the designed human-in-loop —
  but they are counted and published alongside, never hidden inside the
  2%.
- **Bot-check rate per family** = botCheckSeen / submitSeen, tracked as
  its own series. v2's auto-throttle reads this: if a family's gate rate
  or failure rate crosses threshold, assisted apply for that family
  slows and says why, before failures burn the user's name with that
  employer.
- Rollups are per family per week; the 2% target is evaluated on
  Greenhouse+Lever+Ashby combined at steady state, with Workday reported
  separately (its bar is the 70% accuracy tier).

## 7. What stays product-side

Tailoring (which resume, which cover note), discovery (which postings),
the batch approval card, caps, and the tracker all stay in the product.
The extension is deliberately thin: bank in, form filled, proof out. The
50-in-30 session is a product flow — Trainee queues the postings, the
user walks the tabs, the extension fills each, the user submits each,
proofs flow back — not an extension feature.
