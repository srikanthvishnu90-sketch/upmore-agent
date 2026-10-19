# Sonara: post-mortem (shut down around 2024-02) and what Trainee must never repeat

Template: `docs/product/BUILD-STANDARD-TSENTA.md`, shortened as asked, because Sonara is not a live competitor. Trainee
state: `docs/product/REQUIREMENTS.md` (audit 2026-10-19) and `docs/product/cost-model-applying.md`. Written 2026-10-19.

## 0. Labels and method

- **VERIFIED**: read on a live page or measured. *None.*
- **VERIFIED-S**: a search extract of Sonara's own URL. *None*: no Sonara page or shutdown notice was reached.
- **REPORTED**: a third party says it. Every Sonara fact below is REPORTED, and every source sells a competing
  auto-apply product (resumly.ai, applypass.com, scoutify.com), so each has a reason to dramatize a rival's failure.
- **ASSUMED**: our inference, including anything that comes from general knowledge of the category rather than a cited
  page.

Method (2026-10-19): no fresh research was possible. WebFetch failed on every host (ENOTFOUND), the proxy refused curl
(403), and the session's shared WebSearch budget ran out before a Sonara search ran. The facts come from the earlier
research notes in `audit/research-competitors.md` (accessed 2026-10-19 by that run, search extracts):
resumly.ai/answers/what-happened-to-sonara-ai, applypass.com/post/sonara-ai-alternative-is-sonara-shutting-down,
scoutify.com/blog/sonara-review/. Not checked: Sonara's own shutdown email or page, its funding history, its pricing,
its terms, what happened to user data, and BOLD's acquisition terms.

## 1. What the product was

| Item | Finding | Label | Source |
|---|---|---|---|
| Product | An AI job-search service that found jobs and applied for the person, sold by subscription (a volume product) | REPORTED (category description in the notes); ASSUMED (details) | audit/research-competitors.md |
| Shutdown | Around 2024-02-01 | REPORTED | resumly.ai; applypass.com |
| Cause | Reportedly could not secure funding | REPORTED | resumly.ai; applypass.com |
| What users lost | Their application queues and their history | REPORTED | resumly.ai; applypass.com |
| Afterwards | The brand was bought by BOLD about six months later | REPORTED | scoutify.com/blog/sonara-review/ |
| Company, team, funding, users, ratings, price | Not found in this session | UNKNOWN | n/a |

## 2. What failed (the inventory, as a post-mortem)

| Failure | What happened | Label |
|---|---|---|
| Funding dependence | The service stopped when money ran out. It was not paid for by its own revenue | REPORTED (cause); ASSUMED (that unit economics did not cover cost) |
| Queue held only by the vendor | Applications waiting to be sent existed only inside Sonara and vanished | REPORTED |
| History held only by the vendor | The record of what was sent where, and when, was lost | REPORTED |
| No exit path for users | No reports of an export or a wind-down window were found | ASSUMED from the reports of loss; absence not proven |
| Brand outlived the product | The name was sold on (BOLD). What happened to user data in that sale is unknown | REPORTED (sale); UNKNOWN (data) |

## 3. What users actually lost, and why it hurts (ASSUMED consequences of the REPORTED losses)

1. **No list of where they had applied.** They cannot follow up, cannot tell a recruiter's call from spam, and cannot
   answer "when did you apply?".
2. **Duplicate risk afterwards.** Re-applying with another tool to roles already applied to. Ashby lets an employer cap
   applications per candidate and block re-applying, and shows the employer a blocked list (VERIFIED-S,
   docs.ashbyhq.com/application-limits). A lost history turns into duplicates, and duplicates can turn into blocks.
3. **Employer accounts they never saw.** If the service created accounts on employer portals for them, those accounts and
   their passwords sit with a company that no longer exists (ASSUMED risk; not reported for Sonara specifically).
4. **Correspondence routed through the vendor.** If replies went to a vendor-controlled address (as reported for Massive,
   REPORTED in `massive.md`), the shutdown cut the person off from employers mid-process (ASSUMED risk; not reported for
   Sonara).
5. **Prepaid time.** Whether prepaid subscriptions were refunded is unknown (UNKNOWN).
6. **Their data went somewhere.** A brand sale raises the question of whether resumes and profiles were part of it
   (UNKNOWN).

## 4. Acceptance targets for Trainee (the never-again list as measurable bars)

| # | Never repeat | PARITY bar | BETTER bar (a number) | Trainee today (from REQUIREMENTS.md) | COST NOTE |
|---|---|---|---|---|---|
| S1 | History held only by us | Export of everything (profile, facts, every application with destination, answers, documents, timestamps, proof) | Export in one message, delivered in under 5 minutes as a file the person keeps; tested end to end every release | 1e PARTIAL: see via `profileExport`, delete via host erase, **no downloadable export** (VERIFIED, audit) | Storage already paid; export is a query and a file |
| S2 | Receipts only on our servers | The employer's confirmation goes to the person's own inbox, always | 100% of applications use the person's own email address (never one Trainee controls) | ASSUMED own address; 9b PARTIAL (documents stored only as sha256) (VERIFIED, audit) | Zero |
| S3 | Queue invisible and lost | The person can see every queued, waiting and blocked item and cancel any one | Per-item view and cancel from chat; on any shutdown or pause, queued items are cancelled and listed, never sent blind | 6d PARTIAL (only account-wide STOP); 6e PARTIAL (no awaiting-input count); **7g: over-cap items never resume while the summary says they will** (VERIFIED, audit) | Zero |
| S4 | Funding dependence | Cost per submitted application measured and covered by price (standard 6.3, gate 9) | Gross margin positive per tier at 100, 1,000 and 10,000 users, measured over 30 days, before any "free applications" promise | Cost model written, totals ASSUMED (Stage 8 gate 4 partial) (VERIFIED, audit) | The cost model is the work |
| S5 | No wind-down plan | A written wind-down runbook: notice, export, cancel the queue, stop billing, refund prepaid time, delete data | Runbook exercised once (like the kill-switch gate) | Kill switch and rollback runbook NOT_RUN (Stage 8 gate 5) (VERIFIED, audit) | A day of work |
| S6 | Credentials orphaned | Prefer the person's own sessions over stored passwords (standard 8.2) | 0 stored employer-portal passwords at launch | Login portals pending D-013 (VERIFIED, audit); none stored (ASSUMED) | Zero |
| S7 | Data in a sale | The privacy policy says what happens to data on shutdown or sale | Deletion offered to every user before any transfer, written in the policy | Privacy policy / AI disclosure required before beta (standard 8.4); status not in the audit (ASSUMED not done) | Legal review |

## 5. Scoreboard

The table in section 4 is the scoreboard. Summary: of the seven never-again bars, **none is met today**. S1, S2, S3 and
S6 are partly in place (VERIFIED, audit); S4, S5 and S7 are not started or not measured.

## 6. Pricing and unit economics (the lesson)

Sonara's numbers are unknown (UNKNOWN). The lesson is structural (ASSUMED): a product that sells volume and runs the
applications in its own cloud pays for every application, and a funding gap stops all of them at once, taking the
queue and the history with it. Trainee's cost model plans free applications up to the 15-a-day cap
(`cost-model-applying.md`, "Price the outcome"). That is only safe if three things hold:
1. The in-browser path really costs about $0.004 per application. Today that is ASSUMED arithmetic, not a measurement.
2. Fixed per-user costs scale as modelled: the iMessage line is $59.99-99.99 a month per sender (VERIFIED-S indexed in
   the cost model).
3. Vendors hold still: the cost model notes a snippet showing the planned models as "Deprecated" (UNVERIFIED there).
   That is a model-change risk.

If any of the three fails, "free applications" becomes the Sonara pattern: a cost that grows with use and is funded by
someone else's money. Gate 9 (pricing only after 30 days of measured cost) is the guard. Do not promise free
applications in any copy before it.

## 7. Failure modes and complaints

Only what the earlier notes carry: shutdown around 2024-02-01, funding, lost queues and history, the brand sold to BOLD
(all REPORTED by competitors). No user quotes were collected in this session (search budget exhausted). Collecting
them is step 2 of the plan below.

## 8. Ground-truth plan (research only; Sonara no longer runs)

1. Find Sonara's own shutdown notice (email text posted by users, a status page, or an archived homepage) and record
   the date, the stated cause, and what it offered users (export? refund? notice period?). Label VERIFIED if read.
2. Collect 10 first-hand user accounts of the shutdown (forums, reviews) with dates: what they lost, whether they were
   refunded, whether applications kept going out after the announcement.
3. Find the funding history (rounds, amounts, dates) and the BOLD acquisition terms, specifically whether user data
   transferred.
4. Check what the Sonara brand is today under BOLD, and whether any user history came back.
5. Record everything here with labels, and update `tsenta.md`'s Sonara line if the facts change.

## 9. What Trainee must add or change because of Sonara

Ranked by launch risk. Each line carries its evidence label. *Submission engine* items are marked.

**Kills launch**
1. **The queue must tell the truth.** *Submission engine:* over-cap items get `resumeOn` but nothing reads it, so they
   never resume, while `speakSummary` tells the person they will (7g, VERIFIED audit). That is a silent queue loss
   today, Sonara's failure in miniature, inside Trainee. Fix the resume or fix the sentence before any user.
2. **One apply stack.** *Submission engine:* two stacks with different caps (15 vs 25) and different queues (D-014
   NOT_RUN, VERIFIED audit) mean the person's queue lives in two places. One stack, one queue, one history.
3. **Receipts the person keeps.** The person's own email address on every application, so the employer's confirmation
   is in their inbox whatever happens to Trainee (S2). *Submission engine:* receipts store documents only as sha256
   (9b PARTIAL), and confirmation-email proof is NOT_RUN (Stage 8 gate 3) (VERIFIED, audit).

**Embarrasses at 100 users**
4. **Export in one message** (S1; 1e PARTIAL, VERIFIED audit).
5. **Per-item queue view and cancel** (S3; 6d, 6e PARTIAL, VERIFIED audit), including items blocked on a handoff
   (captcha, verification code, login) so nothing waits unseen. *Submission engine:* handoff sessions expire after 10
   minutes idle (8a), and a handoff ticket exists but no drive resumes from the saved point (8b) (VERIFIED, audit).
   Expired handoffs must surface as "waiting for you", never disappear.
6. **Duplicate prevention that survives history loss.** Before any submit, check the person's own history (and, once
   wired, their confirmation emails) for the same employer and role (7f BUILT for the same posting; cross-source dedupe
   2c PARTIAL, VERIFIED audit).

**Matters at 10,000 users**
7. **Wind-down runbook and reserve** (S5): notice, export, cancel the queue, stop billing, refund prepaid time, delete
   data. Exercise it once, like the kill switch (Stage 8 gate 5 NOT_RUN).
8. **Measured unit economics before free applications** (S4; gate 9).
9. **Privacy policy on shutdown and sale** (S7).
