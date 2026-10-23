# ATS verdict pack — Ashby + SmartRecruiters (2026-10-23)

Measured classifications only. Every number below comes from a run named in the text; nothing
here is a capability claim beyond the tier it was measured at.

## Ashby — verdict

- **Harness tier: PROVEN against captured forms.** The product's own browser executor maps,
  fills, and reads back every mapped question on all six captured Ashby application forms
  (87/87 questions filled and verified, 87/87 read back exactly). Suite:
  `tests/career-ashby-verdict-pack.test.cjs`, expectations pinned in
  `tests/fixtures/ashby-verdict-pack-expected.json`.
- **Live tier: NOT LIVE-DRIVEABLE.** Measured 2026-10-23 via the board service:
  403 `FAMILY_NOT_DRIVEABLE`. This pack made **zero** live Ashby calls. No live retry is
  warranted without a genuinely new signal (defined at the bottom of this doc).

## Method (harness tier)

The six captures in `tests/fixtures/forms-ci/` (form-capture run, 2026-10-19; source URLs are
`jobs.ashbyhq.com/<tenant>/<posting>/application`) were served locally with scripts, link tags,
iframes, and external references stripped — the same serving the captures were first exercised
with — and driven through:

- `scripts/career/portal-browser-helper.cjs` in daemon mode: the same executor process, in the
  same mode, that the production board service spawns. Commands used: `open`, `discover`,
  `fill`, `readback`, `close`. The runner has no code path that sends `review` or
  `submit_and_capture`, and the suite asserts the command log proves none was sent, and that
  the local server only ever received GETs.
- `bindFields` from `extension/lib/trainee-core.js` — the shared binder `scripts/apply.ts`
  binds with — turned each form's discovered rows into questions.
- One fixed synthetic persona and one synthetic PDF (`%PDF-1.4 SYNTHETIC TEST RESUME`).
  Fill values are mechanical driver probes (identity keys, first option, fixed synthetic
  text), **not** answer policy: what the product may *answer* is the planner tier's question
  (see "Where the flow stops").

Posture on this host: helper `ready.json` recorded `chromiumSandbox: false` (the host's
recorded opt-out; this VM cannot launch sandboxed Chromium — see "Environment"). The gate's
CI runs the same suite sandboxed.

## Inventory — the six captured forms

Field counts from three lenses: the capture manifest (2026-10-19), the executor's `discover`
on the same bytes today, and the binder's question count. Every form's accounting closes:
raw rows = 1 unnamed row skipped + group rows merged + questions. The skipped row on each
form is a duplicate decorative file input with no name/id/field-path (non-required, so the
binder skips it by design); merged rows are the individual options of radio/checkbox groups,
which the binder correctly reads as one question each.

| Captured form (tenant) | Manifest fields | Raw rows | Questions mapped | Required | Filled + verified | Read back |
|---|---|---|---|---|---|---|
| OpenAI | 29 | 28 | 16 | 11 | 16/16 | 16/16 |
| Airwallex | 17 | 16 | 15 | 11 | 15/15 | 15/15 |
| Lilt | 13 | 12 | 11 | 9 | 11/11 | 11/11 |
| Snowflake | 21 | 20 | 16 | 14 | 16/16 | 16/16 |
| Crusoe | 28 | 27 | 14 | 6 | 14/14 | 14/14 |
| Harvey | 21 | 20 | 15 | 12 | 15/15 | 15/15 |
| **Total** | | | **87** | | **87/87** | **87/87** |

Question types across the pack: text, email, tel, textarea, checkboxes, radio groups,
and file inputs. Every form requires a
resume upload (Snowflake requires two files: resume + cover letter); every resume attach
read back the synthetic PDF's exact sha256. Every form renders a live "Submit Application"
submit control in the captured markup — recorded, never clicked.

Feature presence in the captured markup:

- **Captcha:** all six live captures carried **reCAPTCHA Enterprise** (capture manifest
  `bot_check`). The replay observed no challenge — the replay serves the capture with
  scripts stripped, so reCAPTCHA cannot load. The replay therefore proves nothing about
  the live challenge; the live tier is 403 regardless.
- **EEO questions:** OpenAI and Crusoe carry Gender / Race / Veteran Status radio groups
  (all optional); Harvey carries an optional free-text Pronouns question. Airwallex, Lilt,
  and Snowflake carry none.
- **Attestation / agreement checkboxes (required):** OpenAI — an Arbitration Agreement
  acknowledgment plus "I confirm I have read the above."; Snowflake — a Candidate Privacy
  Notice agreement. These are precisely the class the parked attestation carrier governs
  for real drives: the harness checks them mechanically as driver probes only. No real
  drive may check one without the carrier and the owner flag.
- **Work-authorization screening:** OpenAI carries required authorized-to-work and
  sponsorship checkboxes. Answer-policy questions, not driver questions (see below).

## Where the flow stops, and why

1. **This replay stops after read-back, by construction** — no review or submit command
   exists in the runner.
2. **The planner tier stops earlier.** In `tests/career-apply-real-forms.test.cjs`, the
   full `scripts/apply.ts` dry run against these same captures, with the standard TEST
   fact floor (name/email/phone confirmed only), is pinned to `needs_answers` for every
   Ashby form: planning precedes any fill, so screening, essay, EEO, and attestation
   questions are asked about, never silently filled. The harness fills above are driver
   probes under synthetic values and do not change that.
3. **A real drive stops before either:** the family is 403 at the live tier, the host
   board config's `familyVerdicts` omits Ashby (fail-closed), and the submit flag is OFF
   (verified below).

## Environment note (measured 2026-10-23, this VM, captured Lilt form)

The full `apply.ts` pipeline cannot execute on this host in either posture, for host
reasons, not driver reasons:

- `UPMORE_CHROMIUM_SANDBOX=off` → `RESULT {"state":"not_submitted","reason":"BROWSER_SANDBOX_REQUIRED"}`
  — the trusted seam refuses unsandboxed sessions by design (`createSession`).
- Default posture → `RESULT {"state":"not_submitted","reason":"DRIVER_ERROR"}`, zero fields
  observed — sandboxed Chromium cannot launch here (`kernel.apparmor_restrict_unprivileged_userns=1`,
  PID 1 `NoNewPrivs=1`, uid 0; the standing host wall). That is why the pack drives the
  helper's daemon mode — the production board service's own mode — instead.

## What this pack does not prove

- Live driveability of any Ashby posting (403 stands).
- reCAPTCHA Enterprise behavior on a live page.
- Live widget behavior that the stripped capture renders differently — e.g. OpenAI's
  "When can you start a new role?" is a date picker live; in the capture it is a plain
  input and filled as text.
- Answer policy for screening / EEO / attestation questions (planner tier + parked
  attestation carrier), or submit behavior of any kind.

## Live tier — what counts as a new signal

No Ashby live retry without one of: (a) an owner-provided Ashby-hosted posting URL on an
allowlisted host, for a read-only mapping pass; (b) a vendor-side change, shown by the
kit's read-only probes, in which Ashby serves the board service's requests without 403;
(c) a service verdict change measured by the board service's own probes.

## Safety verification

This pack never touched the live board service (local helper + local server only). Read-only
checks against the live project before and after the runs: `career_cloud_settings` 0 rows,
`career_apply_jobs` 0 rows, submitted 0, `career_apply_agent_submit_enabled()` false.

---

## SmartRecruiters — classification

**NOT LIVE-DRIVEABLE (403 measured 2026-10-23 via the board service). NO harness proof —
zero captured forms exist.**

Evidence: the 2026-10-19 form-capture run recorded six SmartRecruiters entries — Domino's,
CROSSMARK, Sonsoft, AECOM, Bosch Group, SGS (`jobs.smartrecruiters.com/oneclick-ui/…`) —
**all `blocked_403` behind DataDome, `html: null`**. Even the read-only capture load was
refused, which is a weaker position than Ashby's (Ashby's captures succeeded on 2026-10-19;
its 403 arrived at drive time). The fixture suite pins this state
(`tests/career-form-ci-fixtures.test.cjs`).

### Capture plan — NOT executed

Capturing one SmartRecruiters form would require, under the read-only boundary:

1. One public SmartRecruiters posting URL (owner-provided, or from the board directory).
2. One read-only page load in the form-capture workflow's pattern, saving the rendered
   structure (HTML with script/style bodies removed + field summary) into
   `tests/fixtures/forms-ci/` with a manifest entry. No account, no typing, no apply
   click — a load and a save, nothing else.
3. **Whose go: the owner's.** Any live load of this family is a new live signal against a
   standing 403 classification, and the 2026-10-19 attempts show the load itself is
   challenged by DataDome. If the load is refused again, the recorded outcome is
   "capture refused at load" — the classification does not change.

What the pack would then prove: exactly the Ashby pack's harness tier against that one
captured form — mapping, fill, read-back. Live driveability would remain unproven and
unclaimed.
