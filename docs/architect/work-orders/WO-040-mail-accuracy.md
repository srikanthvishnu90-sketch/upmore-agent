# WO-040: mail accuracy (status changes from the person's own mail)

Owner target (FEATURE DEPTH TARGETS v2): 95%+ of application status changes detected from the person's own mail within
1 hour. WO-024 (PR #46) measured the classifier at **88.6% precision, 75.6% recall** on its 50-email holdout (target 97 / 95).
This order makes the rules generalise, adds guards so a wrong status text never reaches the person, and adds an optional
model second pass that is off by default.

Labels: **VERIFIED** (measured here, command shown), **ASSUMED**, **NOT_RUN**.

## 1. The starting numbers (VERIFIED)

`deno run --allow-read evals/career/mail-eval.ts` on `origin/trunk` @ 9370b2c5: holdout precision **88.6% (31/35)**,
recall **75.6% (31/41)**; tune 100 / 100; tune2 100 / 97.7. WO-024's numbers reproduce exactly.

## 2. Guarding against over-fitting: the splits

The set already had a split (`tune`, `tune2`, `holdout`), so no new split of the old data was made. Added:

- **131 new synthetic emails** (`W001`-`W131`, `origin` says so), written from common ATS templates (Greenhouse, Lever,
  Ashby, Workday, iCIMS, SmartRecruiters, Taleo, Jobvite, SuccessFactors, assessment vendors) and from the non-job mail
  that uses the same words: card, loan, rental and visa applications, health assessments, promos, mock interviews, cold
  recruiters, scams. They were committed (1f560603) **before any rule changed**.
- They go to **dev only**, split by a fixed seed: FNV-1a of `id + "wo-040-seed-20261020"`, mod 4. Remainder 0 goes to
  `devcheck` (33, never tuned on, scored once); the rest go to `dev3` (98, tuned on). **None is in the holdout**: it is
  still WO-024's 50 (`G01`-`G50`). Test E1 checks all of this.
- The rules were tuned only on **dev = tune + tune2 + dev3** (`mail-eval.ts --only dev`). `devcheck` and `holdout` were
  scored once, after the rules were final.
- **Caveat:** step 2 of the order asked for error analysis of the holdout misses, so the cause families below came from the
  holdout. The fixes are written as phrase families, and the dev3 examples use other wordings than the holdout, but the
  post-fix holdout number is **optimistic, not blind**. `devcheck` is the cleaner check. It was written by the same hand
  in the same sitting, though, so it is not independent either.

## 3. Error analysis: every holdout miss before WO-040

| Id | Want | Got | Cause | Fix (a phrase family, tuned on dev) | After |
|---|---|---|---|---|---|
| G09 | rejection | other | rejection phrasing: "move in a different direction" | "... in a different direction" | fixed |
| G11 | rejection | other | rejection phrasing: "close out your application" | "close/closing (out) your application", "application is closed" | fixed |
| G14 | rejection | recruiter_reply (wrong) | rejection phrasing "decided to hire another candidate"; fell to the "Re:" recruiter fallback | "decided to hire/select ... candidate", "selected another applicant", "offer to another candidate" | fixed |
| G18 | interview | other | interview phrasing "set up time to speak with our recruiter", "grab a slot" | none added; it is flagged ambiguous, so the second pass can reach it | **open** |
| G22 | interview | recruiter_reply (wrong) | interview vs recruiter: "would like to talk with you"; "hiring manager" sent it to the recruiter fallback | "would like/love to talk/speak/chat/meet/connect with you" | fixed |
| G26 | interview | other | same family: "would like to meet you" | same | fixed |
| G29 | assessment | other | a step named by its skill: "SQL exercise" | skill + exercise/test/challenge/task/assignment, "work sample" | fixed |
| G30 | assessment | interview (wrong) | interview vs assessment: a one-way HireVue video | "record your answers", one-way/on-demand/recorded video | fixed |
| G33 | offer | other | offer phrasing "would like to offer you the ... position" | "would like to offer you", "offer you the X position/role/place", contingent/tentative offer | fixed |
| G41 | recruiter_reply | other | recruiter phrasing "still interviewing other candidates", "expect to hear from me" | recruiter status phrases ("you should hear from me", "hiring decisions", "salary expectations") | fixed |
| G46 | other | offer (wrong) | scam not recognised: pay "via Zelle", "send us your full name and address"; a staffing look-alike domain | payment apps, ID copies, personal-data asks; look-alike words widened (talent, staffing, onboarding, offers...) | fixed |

No holdout miss came from an unrecognised ATS sender or a wrong employer (employer named right 31/31 before). Dev3 found
both:

- `hackerrankforwork.com` and one-way video vendors were missing; they were added.
- "Gap Inc. has invited you" lost the employer because the period of "Inc." ended the sentence; fixed.

Dev3 also found precision holes the holdout did not have, now fixed:

- "We received your application" for a credit card, loan, lease or visa;
- "complete your health assessment", "take your English test";
- "if you are selected for an interview" read as an invite;
- a cold recruiter's "set up a call";
- a mock interview at a career center.

## 4. What was built

| Piece | Where |
|---|---|
| Rules: the phrase families above. Guards: not-a-job applications, maybe-steps, cold outreach for every kind, a job word for automated non-ATS mail, wider scam and look-alike checks. An `ambiguous` flag | `supabase/functions/_shared/career_mail.ts` |
| Planner guards, for rules and model alike. (1) An **offer** moves an application only from that employer's own mail: its ATS or vendor naming it, or its own domain (`fromEmployer`, stricter than `sameCompany`, so `oktajobs.co` and `asana-portal.co` are not Okta or Asana). (2) Anything the **model** decided must match an existing application, from that employer's own mail. (3) The model never starts a hand application | `career_mail.ts` `planUpdates`, `fromEmployer` |
| Second pass: only `ambiguous` mail; only From, Subject and snippet; answer `{kind, confidence}` read strictly (a kind in the list, a number in [0,1], at least 0.85, else none); at most 20 calls per person per run; the employer is read by code; the text the person reads is code's | `supabase/functions/_shared/career_mail_model.ts` |
| Wiring: `CAREER_MAIL_MODEL=on` (off by default), OpenAI forced whatever `MODEL_PROVIDER` says, `CAREER_MODEL` (default gpt-5-mini). No key: `NOT_WIRED` plus a one-line ask in the run's answer. One `agent_turn_costs` row per person per run (thread null) | `career_proactive_run.ts` `runMail`, `career-proactive/handler.ts`, `index.ts` |
| Eval: splits dev / devcheck / holdout, `--only`, second-pass reach | `evals/career/mail-eval.ts` |

No migration: `agent_turn_costs.thread_id` is already nullable and the event kinds are unchanged.

## 5. Measured (VERIFIED, synthetic)

Command: `deno run --allow-read evals/career/mail-eval.ts --only dev,devcheck,holdout`

| Split | Status emails | Before (P / R) | After (P / R) |
|---|---|---|---|
| dev (tune + tune2 + dev3) | 257 | 94.5% / 87.2% (dev3 alone 78.3% / 59.5%) | **100.0% (256/256) / 99.6% (256/257)** |
| devcheck (blind, scored once) | 27 | not scored before | **100.0% (27/27) / 100.0% (27/27)** |
| **holdout** (WO-024's 50) | 41 | 88.6% (31/35) / 75.6% (31/41) | **100.0% (40/40) / 97.6% (40/41)** |

- Employer named right: 40/40 on the holdout, 323/323 across all splits.
- On 41 status emails the 95% Wilson lower bounds are about **91% precision and 87% recall** (arithmetic). The point estimate
  meets the target; the sample cannot show that it does with confidence.
- Real inboxes: **NOT_RUN**. Every number above is on synthetic mail.
- Second pass: **NOT_RUN live** (no key here); tested only with stubs through the real gateway and a fake OpenAI. On the
  synthetic set it would see 3 of 415 emails. Of the 2 status emails the rules still miss, 1 (G18) is among them. The other
  (H26, a calendar notice) is not, by design.
- Cost per call: ASSUMED about $0.0001-0.0003. That is about 330 input and 60 output tokens at the gateway's gpt-5-mini
  price, plus minimal reasoning, and the price is a third-party figure. The cap is 20 calls per person per run.
- **Within 1 hour:** unchanged from WO-024 (5-minute schedule). Nothing here claims more.

## 6. Safety invariants (tests)

- A scam or look-alike "offer" is never texted. This covers look-alike domains, payment-app scams, and a real employer's
  display name on a domain that is not theirs (S1, M3).
- A hand application starts only on the employer's own "received" mail; another kind, or the model, never starts one (S2).
- Read-only: every Gmail request is a GET of metadata; no send, no body, no attachment (W3).
- No body reaches the model, nor the date or the hash (M1).

## 7. Tests: `tests/architect/wo-040-mail-accuracy.test.ts` (16 tests)

E1-E2 (splits, numbers), R1-R3 (generalised families, fresh wordings), S1-S2 (invariants), M1-M5 (second pass:
payload, guardrails, over-confident wrong answers, model words dropped, OpenAI-only and off by default), W1-W4 (the run:
cost row, NOT_WIRED, read-only, garbage or failing model).

## 8. Planted defects (each a one-line change; the test fails; reverted)

| # | Defect | Failing test |
|---|---|---|
| D1 | low confidence accepted (`< min` changed to `< 0`) | WO-040/M2 |
| D2 | any kind the model names is accepted | WO-040/M2 |
| D3 | the model's "received" opens a hand application | WO-040/S2 |
| D4 | an offer from a stranger's domain moves the application | WO-040/S1 |
| D5 | the date and hash go to the model | WO-040/M1 |
| D6 | the second pass is on unless turned off (`!== "off"`) | WO-040/M5 |
| D7 | `MODEL_PROVIDER=anthropic` is followed | WO-040/M5 |
| D8 | the second pass's cost is not recorded | WO-040/W1, W4 |
| D9 | "if you are selected for an interview" reads as an invite | WO-040/E2, R2 |
| D10 | a card or loan application reads as a job application | WO-040/R3 |

## 9. Demo (owner)

`deno run --allow-read evals/career/mail-eval.ts --only devcheck,holdout` prints the numbers and every miss.
`deno test -A --no-check tests/architect/wo-040-mail-accuracy.test.ts` runs the guards.

## 10. Not built

- **A real-mail number.** It needs consented, labeled mail from real inboxes. NOT_RUN.
- **The second pass live.** It needs `OPENAI_API_KEY` on career-proactive and the owner's `CAREER_MAIL_MODEL=on`; until
  then its accuracy and cost are NOT_RUN.
- **G18's wording** ("set up time to speak with our recruiter") was left to the second pass. No dev example used it,
  and adding it from the holdout alone would be fitting the holdout.
- **Calendar notices** (H26) are not read as interviews. A calendar entry is not the employer's words.
- **Offers from an employer's careers-branded domain** (for example `<name>careers.com`) are refused, not texted:
  precision first. A real one is missed, never misreported.
