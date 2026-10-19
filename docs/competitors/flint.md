# "Flint": the job tool that publishes failure-rate and empty-field claims about volume tools (NOT IDENTIFIED)

Template: `docs/product/BUILD-STANDARD-TSENTA.md`. Written 2026-10-19.

**Bottom line: this session could not identify which product "Flint" is.** No page about it was opened, and no search
reached it before the shared search budget ran out. Everything in the template that depends on knowing the product
(company, pricing, inventory, complaints) is therefore UNKNOWN, not guessed. What follows is (a) the only evidence we
hold, which is second-hand, (b) the plan to identify the product, and (c) what Trainee must build about the *claim*
anyway, because the claim stands whoever made it.

## 0. Labels and method

- **VERIFIED**: read on a live page or measured in our own runs. *None.*
- **VERIFIED-S**: a search extract of the company's own URL. *None for Flint.*
- **REPORTED**: a third party or an earlier internal document says it. The single Flint item below is REPORTED.
- **ASSUMED**: our inference.

Method (2026-10-19): WebFetch failed on every host from this environment (ENOTFOUND), and the proxy refused curl (403).
The session's WebSearch budget (200 calls, shared by every agent in the turn) was spent on Massive, Huntr and Careerflow
before any Flint search ran. The repository and scratchpad were searched for "Flint" (case-insensitive) in Markdown,
text and JSON files.

What the search of our own files found:
1. `docs/product/BUILD-STANDARD-TSENTA.md` section 3.3: "the competitor pattern is fail-or-guess (Simplify fails the
   application rather than guess - VERIFIED via their help pages; Flint REPORTS high failure and empty-field rates for
   volume tools)." This is the owner's text, relaying the owner's teardown. It names no URL, no product page, no number
   and no date. **REPORTED.**
2. `packages/career-data/board-directory.json` and `supabase/functions/career-ingest/boards.json` list an employer named
   "Flint" that hires on Ashby (board token `flint`, found through the summer-2026 internships list). That is a company
   with job openings. **Nothing connects it to a job-application tool.** It is a lead to check, not evidence; a common
   word like "Flint" names many companies.
3. Nothing else: no Flint URL, product name or quote anywhere in `docs/competitors/`, `audit/research-competitors.md`, the
   requirements, the cost model or the teardowns available in the scratchpad.

## 1. What the product is

UNKNOWN. Company, funding, team, users, ratings, surfaces and revenue model: not found.

## 2. Capability inventory

UNKNOWN, except the single REPORTED claim: Flint publishes (or states) that volume auto-apply tools have **high failure
rates** and **leave fields empty**. Not known: the numbers, the sample, which tools, the method, the date, and whether
Flint sells its own applying product (in which case the claim is marketing against rivals and should be weighed that way).

## 3. Acceptance targets for Trainee (on the claim, not the company)

Whoever published it, "failure rate" and "empty-field rate" are the two numbers a volume tool can hide and a careful one
can publish. Trainee's targets:

| Metric | Definition (ours) | PARITY | BETTER | COST NOTE |
|---|---|---|---|---|
| Submission failure rate | Applications that end FAILED or UNKNOWN / applications approved, per ATS, per week | Measured and stored for every run from the first real application (standard 3.3) | Silent failures = 0 (a FAILED or UNKNOWN always reaches the person with the reason); published internally weekly | Logging only; near zero |
| Empty-field rate | Required fields left empty or defaulted at submit / required fields, measured by readback before submit | 0 empty required fields at submit: the engine stops and asks instead (5e) | Optional fields filled only from confirmed facts; optional-field fill rate reported separately, never padded with guesses | Readback is already in the engine (7d); the cost is the extra question to the person |
| Wrong-field rate | Fields whose readback value differs from the approved value | 0 at submit (7d BUILT stops on mismatch) | Measured on the 17 captured forms in CI and on 20+ real applications per ATS | As above |

## 4. What Flint does not have

UNKNOWN.

## 5. Scoreboard

| Capability | Flint (labeled) | Trainee target (measurable) | Trainee today (from REQUIREMENTS.md) |
|---|---|---|---|
| Publishes failure / empty-field rates | Claimed about others (REPORTED, owner text) | Our own rates published internally weekly, from stored runs | No runs: 0 applications submitted (VERIFIED, audit); 15d metrics PARTIAL, `evals/career/results` empty (VERIFIED, audit) |
| Empty required fields at submit | Unknown | 0 | 5e PARTIAL: unknown fields become questions on replica forms only; real forms need the worker, NOT_WIRED in the edge function (VERIFIED, audit) |
| Readback before submit | Unknown | 100% of fields | 7d BUILT; post-fill resume check only on a branch (VERIFIED, audit) |
| Failure reported to the person | Unknown | Every FAILED/UNKNOWN with a reason | 8c PARTIAL (safe stops, no recovery); 8d no caller for unknown-outcome resolution (VERIFIED, audit) |

## 6. Pricing and unit economics

UNKNOWN. No architecture inference is possible without knowing the product.

## 7. Failure modes and complaints

UNKNOWN for Flint itself. The claim it reportedly makes about volume tools agrees with independent reports in the other
files: Massive users report "couldn't apply, apply manually" and failures on 9 of 19 sites (REPORTED, `massive.md`);
Careerflow's Workday autofill measured 60% in one small test (REPORTED, `careerflow.md`); Huntr's Workday fill is
"hit-or-miss" (REPORTED, `huntr.md`).

## 8. Identification plan (then the ground-truth plan)

Do these in order, in a session with search budget and a working fetch. Do not sign up or submit anything.
1. **Ask the owner** for the source of the Flint line in the build standard (the teardown he wrote it from, or the URL
   he read). This is the fastest and most reliable step.
2. **Search** for the claim's own words: "Flint" with "auto apply" / "auto-apply", "failure rate", "empty fields",
   "LazyApply", "volume", "job application"; and "Flint" with "Chrome extension", "job search", "career", "AI agent".
3. **Rule out name collisions** before writing anything: the employer named Flint on Ashby in our harvest
   (`board-directory.json`, token `flint`), and any unrelated product of the same name. A match needs a page that is
   about job applications *and* states the failure or empty-field claim.
4. **Once identified**, open the page with the claim and record the numbers, the sample, which tools were measured,
   the method and the date. Label as VERIFIED (page read) or VERIFIED-S (extract only). If Flint sells an applying
   product, mark the claim as a competitor's marketing.
5. **Then** fill sections 1-7 of this file from the template and write the ground-truth test plan the way the other
   files do (a normal user, terms read first, no submissions by this research).

## 9. What Trainee must add or change because of this claim

Ranked by launch risk. These hold whoever "Flint" turns out to be.

**Kills launch**
1. **No empty required field ever reaches submit.** *Submission engine:* 5e is PARTIAL. Unknown fields become questions
   only on replica forms, and on real forms the worker is NOT_WIRED in the edge function (VERIFIED, audit). The
   standard's ask-instead-of-guess rule (3.6) is the parity bar: stop, ask once, remember.
2. **No silent failure.** Every approved application ends SUBMITTED (employer proof), UNKNOWN or FAILED, with the reason
   told to the person. *Submission engine:* 8c (no recovery), 8d (no caller), and the over-cap summary that claims a
   resume never happens (7g) are all open (VERIFIED, audit).

**Embarrasses at 100 users**
3. **Our own failure and empty-field numbers, measured from the first run.** If a third party can publish a failure rate
   for "volume tools", it can publish one for Trainee. Measure ours first (15d PARTIAL, VERIFIED audit). The captcha
   detector that stopped 5 of 6 saved Lever applications at open (build standard 3.3, REPORTED in the standard; the fix
   is on Codex's branch, not merged per REQUIREMENTS Stage 8 gate 2) would by itself have been an 83% failure rate on those
   saved Lever applications (5 of 6; ASSUMED arithmetic on a tiny sample).

**Matters at 10,000 users**
4. **Publish the rates externally** only once they come from stored proof at volume (standard section 5: never a
   success rate not computed from proof). If they are good, they are the answer to every "auto-apply fails" article.

Open item: identify Flint (section 8, step 1 first).
