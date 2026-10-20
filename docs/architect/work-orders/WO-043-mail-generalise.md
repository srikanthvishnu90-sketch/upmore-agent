# WO-043: mail classification that generalises

Owner target: 95%+ of application status changes detected from the person's own mail; precision 97%, recall 95%.
WO-040 showed the phrase rules in `supabase/functions/_shared/career_mail.ts` at about 100% on the mail they were tuned on,
but 33-50% recall on wordings nobody tuned on (blind40, fresh20). This order makes the offline classifier generalise:
no model call, no network, no spend (the model second pass stays off and is out of scope).

Labels: **VERIFIED** (measured here, command shown), **SYNTHETIC** (the data is hand-written, not real mail),
**NOT_RUN**, **NOT KNOWN**.

## 1. Result in one paragraph

On a new set the rules were never tuned on, written and committed before any rule change, the classifier went from
**91.5% precision / 75.0% recall to 98.5% / 93.1%** on its sealed quarter (dev4check, 88 emails, 72 status, scored
once; VERIFIED, SYNTHETIC). Precision clears the 97% target there; **recall does not reach 95%**. No rejection was read as
an interview on any split, before or after. The older tuned splits did not regress past their target (dev 100.0% /
98.8%). **The target is not shown to be met on unseen wording**: dev4check comes from the same author and batch as the
data tuned on, so it is an optimistic check; an independently written set (fresh20, held outside the repo) and real
inboxes are NOT_RUN.

## 2. Why the rules did not generalise, and the approach

Each WO-024/040 rule is a fixed phrase ("decided not to move forward"). A new phrasing of the same decision ("we won't be
taking yours further", "you have not been progressed") matches none of them. The fix is to read intent, not phrases:

- **Intent families, one feature each**, read on normalised text (lower case, straight quotes, contractions spelled out,
  the subject's end a sentence end):
  - rejection: a negator in front of any verb of progress in the same clause (`rj:negated`: not / no longer / unable to /
    cannot ... move forward, proceed, progress, advance, continue, take further, pursue, consider, select, shortlist,
    invite, offer you, extend, schedule, hire, match, fit); someone else chosen (`rj:other_candidate`); the role closed,
    filled, cancelled or on hold (`rj:closed`); pass / declined / no longer considered / another direction (`rj:pass`);
    soft cues (regret, closers, "keep your resume on file", "difficult decision");
  - interview: an interview noun, talk nouns, invitation verbs, scheduling verbs, a time, who you meet;
  - assessment: a test noun, a doing verb, a deadline, a recorded format, a vendor's name;
  - offer: offer nouns, extending an offer, joy words, signing and pay words;
  - received: "we have your application" in any order, thanks for applying, "under review";
  - recruiter reply: status-of-the-process words ("no update yet", "still in the running", "running behind").
- **Scope.** A negation decides nothing inside a condition ("if you are not selected, ..."), an instruction ("please do
  not reply") or a sentence about other people ("candidates who are not selected will be notified"). A step already done
  ("thank you for interviewing") or a maybe-step ("if you are (not) selected for an interview") is removed before the
  forward families read the text, as in WO-040.
- **Priors.** The WO-024/040 rule hits are features too (`rule:<kind>`), as are the sender's kind: ATS, assessment vendor,
  job board, personal address, a person at a company, a "Re:" subject.
- **A small transparent scorer.** A kind's score is its bias plus the weight of each feature present (`MAIL_WEIGHTS`, 42
  features x 7 kinds, printed in the file). The weights are fitted by `evals/career/mail-fit.ts`: multinomial logistic
  regression, full batch, 4000 steps, rate 0.5, L2 0.004, zero start; deterministic; it reads only the tuning splits
  (tune, tune2, dev3, dev4). L2 and the share bar were chosen by 4-fold cross-validation inside those splits.
- **A decision that prefers "other".** A kind is said only when its softmax share is at least 0.5 **and** one of its own
  families (or its rule) fired. Otherwise the message is "other", with WO-040's `ambiguous` flag unchanged.
- **Safety in code, whatever the weights say:**
  - words that decide against the person (`rule:rejection`, `rj:negated`, `rj:other_candidate`, `rj:closed`, `rj:pass`)
    make the message a rejection when rejection leads every forward kind, otherwise "other"; never an interview,
    assessment, offer or recruiter reply. This is the guard on the worst error;
  - an offer talked about (`rule:offer`, `of:extend`, `of:noun`) is never an interview, an assessment, a receipt or a
    recruiter reply ("a call to go through your offer");
  - a call or chat is an interview only when the words refer to the application (WO-040 rule kept for the scorer);
  - a recruiter reply only from a person at a company, and, without the WO-024 reply rule, only with a job word;
  - every WO-024/040 guard still runs first (scams, look-alikes, calendars, noise, non-job applications, alert senders),
    and the post-phrase guards (job board, personal address, cold outreach, no job word) still run after the scorer;
  - `fromEmployer`, `planUpdates`, the second pass and every planner guard are unchanged.
- **New guards** (generic, not phrase lists): freelance marketplaces (Upwork, Fiverr, Freelancer) are job boards; a
  volunteer application, a trusted-traveler or visa interview, a degree programme and an admissions office are not jobs;
  press and podcast interviews and a test vendor's practice promos are noise.

## 3. dev4: the new set

- **348 SYNTHETIC emails** in `evals/career/mail-dev4.json`, written by hand for this order: ATS templates (Greenhouse,
  Lever, Ashby, Workday, iCIMS, SmartRecruiters, Taleo, SuccessFactors, Jobvite, BambooHR, Rippling), assessment vendors
  (HireVue, Codility, HackerRank, CodeSignal, Karat, Pymetrics, SHL, Criteria, TestGorilla, Vervoe, Modern Hire), human
  recruiters and founders; terse and long, casual and corporate, non-native English, misleading subjects ("Update on your
  application" rejections, "Next steps" assessments), soft rejections, and 77 hard "other" look-alikes (card, loan,
  rental, admissions, insurance, account and volunteer applications, scams, promos, job-alert digests, calendar notices,
  surveys, newsletters, practice sites, onboarding and background-check mail, a journalist's interview request).
- Kinds: received 51, rejection 65, interview 55, assessment 40, offer 30, recruiter_reply 30, other 77.
- **Labeled and committed before any classifier change**: commit `96805ab4` holds only the JSON; the classifier change is
  the next commit, `ffe134ea`.
- **Split by a fixed seed**: FNV-1a of `id + "wo-043-seed-20261020"`, mod 4; remainder 0 is **dev4check** (88: 72
  status, 16 other), the rest **dev4** (260: 199 status, 61 other). `mail-eval.ts` prints dev4check only when named, like
  blind40.

## 4. Numbers

All SYNTHETIC. "Before" is trunk `288a25de`; "after" is `ffe134ea` (classifier unchanged since). Status precision /
recall over the six status kinds, as in WO-024.

| Split | Size (status) | Use | Before P / R | After P / R | Rejection read as interview, before → after |
|---|---|---|---|---|---|
| dev (tune + tune2 + dev3) | 332 (257) | tuned on (WO-024/040, and now the weights) | 100.0% (255/255) / 99.2% (255/257) | 100.0% (254/254) / 98.8% (254/257) | 0 → 0 |
| dev4 | 260 (199) | tuned on: families written while reading its misses; weights fitted on it | 89.9% (143/159) / 71.9% (143/199) | 99.5% (192/193) / 96.5% (192/199) | 3 → 0 |
| dev4, 4-fold CV | 260 (199) | weights fitted on three folds score the fourth | n/a | 99.5% (186/187) / 93.5% (186/199) | 0 |
| **dev4check** | **88 (72)** | **never tuned on; scored once, after the classifier commit** | **91.5% (54/59) / 75.0% (54/72)** | **98.5% (67/68) / 93.1% (67/72)** | **0 → 0** |
| devcheck, holdout, blind40 | | not printed or scored in this order | NOT_RUN here | NOT_RUN here | |

A status read as a different status (the second-worst error): dev4 10 → 0; dev4check 4 → 0; dev 0 → 0.

Per kind on dev4 after (training numbers): received 100.0 / 94.4, rejection 97.9 / 97.9, interview 100.0 / 95.5,
assessment 100.0 / 100.0, offer 100.0 / 90.5, recruiter_reply 100.0 / 100.0. Employer named right on dev4: 182/192.

Second pass (off): the rules now decide most of what they used to leave ambiguous; on dev4, 8 emails would go to the model
(was 44).

Commands (VERIFIED):

- dev and dev4, with every dev4 miss: `deno run --allow-read evals/career/mail-eval.ts --only dev,dev4`
- the regression guard (dev and dev4 at the target): `deno run --allow-read evals/career/mail-eval.ts --only dev --check`
- cross-validation: `deno run --allow-read evals/career/mail-fit.ts --cv` (add `--misses` for the out-of-fold misses)
- refit (reproduces `MAIL_WEIGHTS` exactly; test W1): `deno run --allow-read --allow-write evals/career/mail-fit.ts --write`
- dev4check: the one-time score (before and after) was taken in a single run of a throwaway script that imported trunk's
  `career_mail.ts` and this branch's (not committed). Later regression checks: test E3, or
  `deno run --allow-read evals/career/mail-eval.ts --only dev4check` (not run in this order).

Recall on 72 dev4check status emails: the 95% Wilson interval for 67/72 is about 85-97% (arithmetic), so dev4check can
neither show nor rule out 95%.

## 5. dev4check misses (read after the one-time score; NOT fixed)

| Id | Want | Got | Cause |
|---|---|---|---|
| V021 | other | recruiter_reply | a card issuer's "Update on your application"; the display name "Capital One" (two capitalised words) reads as a person, and "your application" is a WO-024 reply phrase. Same root as WO-040's "Delta Air Lines" |
| V065 | assessment | other | "You are shortlisted for the online test ... credentials will be shared": a test with no deadline or doing verb |
| V133 | assessment | other | an "admit card" for a test from a vendor domain not in the list (tcsion.com) |
| V094 | interview | other | "Your HR discussion is scheduled": "discussion" is a weak talk word |
| V076 | offer | other | "your contract is attached for signature" without the word offer |
| V274 | offer | other | an offer from a founder's personal Gmail: the personal-address guard (only a rejection is read from one) |

Fixing these would be tuning on dev4check; they are recorded, not fixed.

## 6. What is not known

- **Real inboxes: NOT_RUN.** No real mail was read or labeled.
- **An independent writer: NOT KNOWN.** dev4, dev4check and the families share one author and one batch. dev4check
  measures new items from the same distribution; WO-040's devcheck (same situation) scored 100% while blind40 scored
  33%. Expect unseen real wording to score lower than 93.1%.
- **blind40 is no longer blind to this classifier.** This order began by reading WO-040 in full, as instructed; its
  section 3.2 names blind40's missed phrasings ("has landed with", "submitting your candidacy", "pass on your
  application", "pair programming session", "job simulation", "come by ... to meet"). dev4 was written after reading it
  and some dev4 items and families echo those words (for example `rc:got` includes "landed"; dev4 has "submitting your
  candidacy", "pass on your application", "pair programming session", "Work Simulation", "come by the store"). A blind40
  score of this classifier would be contaminated. It was not run here.
- **fresh20** (held outside the repo) is the cleanest unseen check left; it was not run (sealed). The architect or the
  owner can run it with WO-040's harness.
- **The model second pass**: off and out of scope.

## 7. Known precision holes, left as they were (all pre-existing in WO-040)

- A person at a company domain replying "Re: lunch ... I'll keep you posted" reads as a recruiter reply (the WO-024 reply
  rule; tightening it broke real replies whose subject is just a role title).
- A friend at a company domain writing "Congrats on your offer from Stripe!" reads as an offer. The planner's
  `fromEmployer` rule (an offer moves a stage only from the employer's own authenticated mail) limits the damage.
- Two-capitalised-word brand names read as a person (V021 above).
- A scholarship programme's rejection ("Fulbright ... not selected to advance") reads as a rejection (dev4, V198); it
  moves nothing unless it matches an application on file.

## 8. Tests: `tests/architect/wo-043-mail-generalise.test.ts` (13 tests)

| Tests | Covers |
|---|---|
| E1-E3 | dev4's size, seed split, synthetic origin and disjointness; dev and dev4 at the target with no rejection read as an interview; dev4check floor at its one-time score |
| W1-W2 | the weights are exactly what `mail-fit.ts` fits from the tuning splits only; the classifier is pure (no network, model, env, clock) |
| G1-G2 | rejections and the other kinds in wordings no rule lists |
| S1-S6 | the worst error (decided-against words never an interview, including a rejection that offers a feedback call); conditions and other people's outcomes are not decisions; offer talk is never an interview; a call is an interview only about the application; a kind needs its own words; look-alikes stay "other"; and the guards hold with weights inflated on purpose |

Planted defects (each a one-line change; the named tests fail; reverted):

| # | Defect | Failing test |
|---|---|---|
| D1 | decided-against words no longer veto a forward step | S1 |
| D2 | the offer-talk guard removed | S3, S6 |
| D3 | the own-words check removed | S6 |
| D4 | a call is an interview without the application named | WO-040/R4, S3 |
| D5 | "if you are not selected" is no longer a condition | S2 |
| D6 | the rejection rule reads conditions | S2 |
| D7 | one weight hand-edited | W1 |
| D8 | freelance marketplaces not boards | S5, W1 |
| D9 | the share bar lowered to 0.2 | WO-040/E2, WO-040/M6 |

## 9. Gate and suites (VERIFIED on this branch)

- Architect tests: `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`: 418 passed, 0 failed.
- The gate's edge tests (the list in `scripts/gate.sh`): 129 passed, 0 failed.
- Router bundle: `python3 scripts/build-router-core.py --career-only --check` and `--check`: verified (no bundled file
  changed).
- `node --test tests/career-*.test.cjs`: 1719 pass, 112 fail, identical on trunk `288a25de` (pre-existing, environmental;
  no such test imports a file this order changed). There is no `tests/*mail*` file.

## 10. Honesty log

- Held-out data read: none. devcheck, the holdout, blind40 and anything under `/tmp/claude-0/` were never opened, printed
  or scored item by item. `mail-eval.ts` was only ever run with `--only` naming dev, dev4 or (once) dev4check.
- Signals from held-out splits: the existing test WO-040/E2 asserts floors on devcheck, the holdout and blind40 and was
  run as part of the required suites. It failed twice during this work (after a change that required a job word in every
  recruiter reply). Its message was not read for which split failed; the cause was found on dev (three real recruiter
  replies lost) and the change was narrowed. The planted-defect runs also execute E2 (D9 fails it). That is pass/fail
  information about held-out splits, disclosed here.
- dev4check: scored once, after commit `ffe134ea`; its misses were read for section 5 and nothing changed after.

## 11. Demo (owner)

- `deno run --allow-read evals/career/mail-eval.ts --only dev4` prints the per-kind numbers and every dev4 miss.
- `deno run --allow-read evals/career/mail-fit.ts --cv` prints the cross-validated numbers.
- `deno test -A --no-check tests/architect/wo-043-mail-generalise.test.ts` runs the guards.

## 12. Files

`supabase/functions/_shared/career_mail.ts` (scorer, guards), `evals/career/mail-dev4.json` (data),
`evals/career/mail-eval.ts` (splits, confusions, `--check`), `evals/career/mail-fit.ts` (fit, CV),
`tests/architect/wo-043-mail-generalise.test.ts`, this document.
