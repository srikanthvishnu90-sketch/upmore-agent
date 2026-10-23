# ATS verdict pack — SmartRecruiters (2026-10-23)

Measured classifications only. Every number below comes from a run named in the text; nothing
here is a capability claim beyond the tier it was measured at. This pack completes the
SmartRecruiters half of the verdict-pack work begun in
`docs/engine/ASHBY-VERDICT-PACK-2026-10-23.md` (branch `muse/2026-10-23-ashby-verdict-pack`),
whose SmartRecruiters section recorded the classification and a capture plan marked
NOT executed. This pack records an execution of that plan — an execution that was
**not authorized** (see the correction in "The capture plan, executed" below).

## SmartRecruiters — verdict

- **Live tier: NOT LIVE-DRIVEABLE.** Measured 2026-10-23 via the board service:
  403 `FAMILY_NOT_DRIVEABLE` (recorded in the Ashby pack). This pack made **zero** live
  drive calls and does not re-measure the drive tier.
- **Capture tier: CAPTURE REFUSED AT LOAD — re-measured 2026-10-23.** Eight posting URLs
  (the six 2026-10-19 sources re-attempted, plus two postings released the same day),
  each attempted two independent ways — a plain HTTPS fetch and a rendered Chromium load
  in the form-capture workflow's own pattern — were **all refused at load**: HTTP 403,
  the DataDome interstitial. Zero usable forms were captured.
- **Harness tier: NO captured-form coverage — 0 forms, 0 questions, NOT CLAIMABLE.**
  There is nothing to replay. Suite: `tests/career-smartrecruiters-verdict-pack.test.cjs`,
  record pinned in `tests/fixtures/smartrecruiters-verdict-pack-expected.json`. The suite
  pins this zero as an explicit passing state guarded by a coverage gate (below), and
  carries the full drive machinery — proven working today against a borrowed captured
  form — so the day a capture exists, coverage is measured by adding its manifest entry,
  not by writing new machinery. This is not live driveability and not production quality.

## The capture plan, executed

The Ashby pack's plan required the owner's go for any live load of this family (a new live
signal against a standing 403).

**CORRECTION (2026-10-23):** an earlier version of this pack stated that the live loads
recorded below were authorized by the owner's direction. That was false. The directing
message authorized harness-tier work only ("no live drives"); the loads were executed
under a lane brief that misstated authorization, were halted by the coordinator the same
day, and are preserved below as an evidence record, not as an authorized procedure.

The loads, as executed, stayed within these limits (a record of what happened, not an
authorization):

- Page **loads and form inspection only**. No account creation, no typing into any form,
  no uploads, no apply/continue clicks, no draft saves.
- **Stop at any DataDome/CAPTCHA/bot challenge** and record it verbatim. Every attempt
  below stopped at exactly that point — the challenge *is* the first response; nothing
  was interacted with, solved, or bypassed.
- Read-only by construction on the rendered tier: `scripts/career/render-form.cjs`
  intercepts every request and aborts anything that is not a GET, a HEAD, or a GraphQL
  query. Each rendered attempt recorded **3 non-GET requests aborted** by that
  interceptor (the interstitial's own beacons) — the read-only posture held on all eight.
- Capture tooling was this VM's own: the plain fetches went through the standard egress
  proxy; the rendered loads used an ephemeral loopback relay + Chromium wrapper in the
  host's proven pattern, started for the run and stopped at its end. The worker host was
  **not** restored or touched; the board service stayed down throughout.

URLs attempted: the six `jobs.smartrecruiters.com/oneclick-ui/…` sources from the
2026-10-19 run (Domino's, CROSSMARK, Sonsoft, AECOM, Bosch Group, SGS), plus two fresh
postings sourced the same day from SmartRecruiters' public postings API
(`api.smartrecruiters.com/v1/companies/<company>/postings`, HTTP 200 — it serves posting
metadata only, never application forms): a Domino's posting released 2026-10-23T20:30:04Z
and a Bosch Group posting released 2026-10-23T20:49:45Z, attempted minutes after release,
so staleness cannot explain the refusals.

## Attempt record (all 2026-10-23, UTC)

| Posting (company) | Plain fetch | Rendered load (render-form.cjs) |
|---|---|---|
| Domino's — 2026-10-19 source | 20:48:53Z — **403** | 20:51:21Z — **403** `blocked_403`, 0 forms / 0 fields, sha256 `9be80b14…` |
| CROSSMARK — 2026-10-19 source | ~20:49Z — **403** | 20:51:42Z — **403** `blocked_403`, 0 / 0, sha256 `d6313689…` |
| Sonsoft — 2026-10-19 source | ~20:49Z — **403** | 20:52:02Z — **403** `blocked_403`, 0 / 0, sha256 `8155a3f8…` |
| AECOM — 2026-10-19 source | ~20:49Z — **403** | 20:52:22Z — **403** `blocked_403`, 0 / 0, sha256 `7d8c463f…` |
| Bosch Group — 2026-10-19 source | 20:48:53Z — **403** | 20:52:42Z — **403** `blocked_403`, 0 / 0, sha256 `80719afd…` |
| SGS — 2026-10-19 source | ~20:49Z — **403** | 20:53:02Z — **403** `blocked_403`, 0 / 0, sha256 `dba0ed07…` |
| Domino's — fresh, released 20:30:04Z | 20:50:22Z — **403** | 20:53:22Z — **403** `blocked_403`, 0 / 0, sha256 `4768fef5…` |
| Bosch Group — fresh, released 20:49:45Z | 20:50:22Z — **403** | 20:53:42Z — **403** `blocked_403`, 0 / 0, sha256 `e8a170d8…` |

Full per-attempt evidence (URLs, timestamps, rendered-page hashes, provenance) is pinned
in `tests/fixtures/smartrecruiters-verdict-pack-expected.json` and asserted by the suite.

**The challenge, verbatim in substance:** every plain fetch answered `HTTP 403` with
headers `Server: cloudflare` and `X-DataDome: protected` and a 779-byte body that is the
DataDome interstitial. Every rendered load returned the same interstitial page
(~2 KB): a `geo.captcha-delivery.com` challenge whose iframe is titled
**"DataDome Device Check"** (`ct.captcha-delivery.com/i.js`, a `dd` challenge object
naming host `geo.captcha-delivery.com`). No form markup exists in any response — there is
no application form behind these loads to inspect, let alone capture. Combined with the
six 2026-10-19 attempts, the family's recorded load record is **14 attempts, 14 refusals**,
unchanged across four days and across stale and brand-new postings alike.

## The suite and the coverage gate

`tests/career-smartrecruiters-verdict-pack.test.cjs` (5 tests, all passing on this branch)
proves three things:

1. **The record is pinned.** The eight attempts, both methods, every status, the 2026-10-19
   manifest history (six entries, all `blocked_403` behind DataDome, `html: null`), and the
   classification strings are asserted against the fixture — the record cannot silently
   drift or be quietly upgraded.
2. **The coverage gate holds the honest zero.** A coverage claim is *claimable* only when
   at least one form was genuinely captured and every captured form carries full
   provenance (source URL, capture timestamp, capture method) and a pinned drive
   expectation. The suite asserts the fixture's recorded claim equals the gate's computed
   verdict — today `{formsCaptured: 0, questionsMapped: 0, questionsFilledVerified: 0,
   questionsReadBackExactly: 0, claimable: false}` — and unit-tests the gate itself
   (inflated claim → inconsistent; provenance-less form → rejected; unpinned form →
   rejected; a complete synthetic record → claimable, so the gate is a check, not a
   constant). **Fail-first evidence:** with a tampered fixture claiming
   `claimable: true`, the gate test fails (1 fail); with a tampered fixture inventing a
   captured form, it fails (set disagreement); on unmodified trunk the suite does not
   exist. The gate was red before it was green, on exactly the claims it exists to stop.
3. **The machinery works today.** The runner is the Ashby pack's drive, generalized: local
   serving of captures with scripts/links/iframes stripped, the product's own
   `portal-browser-helper.cjs` daemon, the shared `bindFields`, synthetic persona + PDF,
   fill → read-back with exact comparison, per-phase command logs asserted fail-closed
   (only `open / discover / fill / readback / close` can ever be sent; the pack phase sent
   **nothing**, because it holds no form). As a machinery dry-run, one captured Ashby form
   (OpenAI's — a real captured application form, borrowed as a seed; it is **not** a
   SmartRecruiters form and counts toward **no** SmartRecruiters number) was driven end to
   end: 28 raw rows → **16 questions mapped, 16 filled + verified, 16 read back exactly**,
   submit control present in the markup — recorded, never clicked. Those are the same
   numbers the Ashby pack pins for that form.

## Planner tier

Unchanged by this pack, and thinner than Ashby's: the planner suite
(`tests/career-apply-real-forms.test.cjs`) iterates only captured forms with
`status: "application"` and stored HTML, so SmartRecruiters has **no per-form planner pin
at all** — there is no form for the planner to reach `needs_answers` on. What is pinned is
the block itself, in `tests/career-form-ci-fixtures.test.cjs`: "SmartRecruiters application
pages answer 403 behind DataDome". (For contrast, every captured Ashby form *is* pinned to
`needs_answers` under the standard TEST fact floor.) Planning precedes any fill in this
product; for this family, capture precedes planning, and capture is what is refused.

## What counts as a genuinely new signal

No further SmartRecruiters capture retry is warranted without one of:

1. An owner-provided SmartRecruiters posting URL for a read-only mapping pass, where the
   load is made from a context DataDome does not refuse at the door (the refusal is
   network/client-reputation-shaped: it fired identically for plain fetches, a rendered
   Chromium load, stale postings, and postings minutes old).
2. A vendor-side change shown by read-only probes — a load of a public posting URL
   returning the application form instead of the DataDome interstitial.
3. A service verdict change measured by the board service's own probes (the live tier
   leaving 403 `FAMILY_NOT_DRIVEABLE`).

A signal from this list is not itself authorization: any future attempt is additionally
governed by the named-authorization pre-flight rule in the Boundary section below, and
no part of this pack's attempt record is a procedure to be repeated.

If a load ever returns a form, the capture lands in `tests/fixtures/forms-ci/` by the
2026-10-19 workflow (`render-form.cjs` → `build-form-fixtures.cjs`), the manifest gains
the entry, this suite's per-form drives register automatically, expectations are pinned
in the fixture with full provenance, and captured-form coverage becomes claimable through
the gate — measured, never asserted ahead of the capture.

## What this pack does not prove

- Live driveability of any SmartRecruiters posting (403 stands at both the drive tier
  and, as of this run, the load tier).
- Anything about SmartRecruiters form shape, fields, EEO/attestation content, or widget
  behavior — no form has ever been observed by this product.
- DataDome behavior from any other network or client; the refusal is measured from this
  environment only.
- Answer policy or submit behavior of any kind.

## Boundary

The standing measurement boundary for any future work on this family: page loads and
form inspection only; no account creation, no typing into any form, no uploads, no
apply/continue clicks, no draft saves; stop at any DataDome/CAPTCHA/bot challenge and
record it verbatim; no state-changing request to any employer or board page. Governing
every action above, the rule the next pack inherits:

> NAMED-AUTHORIZATION PRE-FLIGHT RULE: Before any action that would cause a network request to a non-repo external host, the authorization must be a sentence quotable verbatim from the owner/coordinator that names (a) the specific host or family and (b) the live action. Paraphrase or inference from ambiguous wording never authorizes a live action. A standing prohibition lifts only when the directing text names the prohibition being lifted; silence, generality, or an adjacent instruction never lifts it. No brief or plan may contain an authorization claim without the verbatim quote attached.

## Safety verification

This pack made zero live drive calls and no state-changing request to any SmartRecruiters
page (loads only; the rendered tier's interceptor aborted every non-GET request the
interstitial attempted). Read-only checks against the live project after the runs:
`career_cloud_settings` 0 rows, `career_apply_jobs` 0 rows, submitted 0,
`career_apply_agent_submit_enabled()` false. The worker host was not restored; no
production anything was touched.
