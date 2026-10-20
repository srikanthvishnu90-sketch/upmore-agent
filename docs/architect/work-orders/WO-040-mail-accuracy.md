# WO-040: mail accuracy (status changes from the person's own mail)

Owner target (FEATURE DEPTH TARGETS v2): 95%+ of application status changes detected from the person's own mail within
1 hour. WO-024 (PR #46) measured the classifier at **88.6% precision, 75.6% recall** on its 50-email holdout (target 97 / 95).
This order makes the rules generalise where it can, adds guards so a wrong status text never reaches the person, and adds an
optional model second pass that is off by default. It was revised after the architect's review of c22cfdd2 (section 6).

Labels: **VERIFIED** (measured here, command shown), **ASSUMED**, **NOT_RUN**.

## 1. Result in one paragraph

On WO-024's holdout the rules now score 100.0% / 97.6%. That number is optimistic: its misses were read for their causes.
On mail in wordings nobody tuned on, the rules score:

- **blind40** (30 status emails written for this review before any further rule change, scored once): precision 83.3%
  (10/12), recall **33.3% (10/30)**;
- **fresh20** (the reviewer's 20, scored once): precision 83.3% (10/12), recall **50.0% (10/20)**.

So the phrase rules fit the wordings they were shown and miss most new ones. **The 95% recall target is not met** on mail
the rules were not tuned on (VERIFIED, synthetic). Real inboxes are **NOT_RUN**.

What closes the gap, if anything does, is the model second pass. The rules mark 11 of blind40's 18 misses as ambiguous,
which puts them within reach of the model. The pass is built and guarded but NOT_RUN live.

The guards hold on every adversarial case the reviewer sent (section 6).

## 2. Splits, and what each number is worth

| Split | Size (status) | Origin | Use | Status P / R at ea28d4e0 (VERIFIED) |
|---|---|---|---|---|
| dev = tune + tune2 + dev3 | 332 (257) | WO-024 tune/tune2, WO-040 dev3 | tuned on | 100.0% (255/255) / 99.2% (255/257) |
| devcheck | 33 (27) | WO-040 synthetic, fixed-seed split of the same batch as dev3 | never tuned on, scored once | 100.0% (27/27) / 100.0% (27/27) |
| holdout | 50 (41) | WO-024 | never tuned on; misses read for causes (step 2), so **optimistic** | 100.0% (40/40) / 97.6% (40/41) |
| **blind40** | 30 (30) | written for the review, committed (bfe0170b) before any further rule change | never tuned on, scored once | **83.3% (10/12) / 33.3% (10/30)** |
| **fresh20** | 20 (20) | the reviewer's, held outside the repo | never read or tuned on, scored once | **83.3% (10/12) / 50.0% (10/20)** |

How the splits were made:

- **dev3 and devcheck.** The 131 W-items were committed (1f560603) before the first rule change. A fixed seed splits them:
  FNV-1a of `id + "wo-040-seed-20261020"`, mod 4. Remainder 0 goes to devcheck; the rest go to dev3.
- **blind40.** It lives in `evals/career/mail-blind.json`, so WO-024's tuned-split check never counts it. The eval prints
  it only when named.

Disclosure on blind40: before the blind items moved to their own file, WO-024/M4 printed an aggregate over all non-holdout
splits. It implied about 10 of 30 blind emails were read right. No item-level result was seen before the scoring above, and
no rule was changed after it.

Commands:

- `deno run --allow-read evals/career/mail-eval.ts --only dev,devcheck,holdout,blind40`
- fresh20: `deno run --allow-read <scratchpad>/fresh40.ts <worktree>` (the reviewer's harness).

Holdout recall on 41 emails: the 95% Wilson lower bound is about 87% (arithmetic).

**Before WO-040** (trunk 9370b2c5, same command; it reproduced WO-024 exactly): holdout 88.6% (31/35) / 75.6% (31/41).
Dev3 before any change: 78.3% / 59.5%.

## 3. Error analysis

### 3.1 The holdout before WO-040 (all 11 misses)

| Id | Want | Got | Cause | Fixed by |
|---|---|---|---|---|
| G09 | rejection | other | rejection phrasing "move in a different direction" | "... in a different direction" |
| G11 | rejection | other | rejection phrasing "close out your application" | "close/closing (out) your application" |
| G14 | rejection | recruiter_reply | "decided to hire another candidate"; fell to the "Re:" fallback | "decided to hire/select ... candidate" |
| G18 | interview | other | "set up time to speak with our recruiter", "grab a slot" | **open**; it would go to the second pass |
| G22 | interview | recruiter_reply | "would like to talk with you"; "hiring manager" sent it to the recruiter fallback | talk/chat family (now requires the application named) |
| G26 | interview | other | "would like to meet you" | same |
| G29 | assessment | other | a skill-named step, "SQL exercise" | skill + exercise/test/challenge/task |
| G30 | assessment | interview | one-way HireVue video read as an interview | one-way/recorded video, "record your answers" |
| G33 | offer | other | "would like to offer you the ... position" | "offer you the X position/role" |
| G41 | recruiter_reply | other | "still interviewing other candidates", "expect to hear from me" | recruiter status phrases |
| G46 | other | offer | Zelle pay, personal-data ask, staffing look-alike | payment apps, personal-data asks, wider look-alike words |

### 3.2 blind40 and fresh20 after WO-040 (analysed, NOT fixed)

These were not fixed: fixing them would be tuning on the held-out sets.

| Cause | blind40 ids |
|---|---|
| received phrasing not covered ("confirms your submission", "has landed with", "submitting your candidacy", "successfully received your application", "throwing your hat in the ring") | B01-B05 (5/5 missed) |
| rejection phrasing ("won't be taking your application further", "other candidates are a closer fit", "pass on your application", "not been chosen to continue") | B06, B07, B08, B10 |
| **rejection read as another kind** (precision): "went with a candidate" fell to the "Re:" fallback (recruiter_reply); "will not be proceeding to the next step" under "Thank you for applying" read as received | B09, B12 |
| interview phrasing ("would welcome a virtual meeting", "pair programming session", "come by ... to meet the store leader") | B14, B15, B16 |
| assessment phrasing ("job simulation", "timed task", "lab-skills evaluation", "video questions") | B20, B22, B23, B24 |
| offer phrasing ("share the offer for", "bring you onto the team") | B25, B26 |
| **wrong employer**: "Delta Air Lines" (three capitalised words) reads as a person's name, so no employer is named | B19, B28 |

fresh20's misses have the same shape (the harness's own output):

- 3 rejections: 2 missed, 1 read as received;
- 2 receipts missed;
- 2 interviews: 1 missed, 1 read as recruiter_reply;
- 2 assessments missed;
- 1 offer missed;
- 1 employer not named.

The rules mark 5 of fresh20's 11 misses ambiguous.

Conclusion: phrase rules plateau around a third to a half recall on unseen wording. The second pass, if the owner turns it on
and it is measured live, is the lever. A rules-only round 3 would fit these 50 emails the way rounds 1-2 fitted the last ones.

## 4. What was built

| Piece | Where |
|---|---|
| Rules (WO-040 phrase families) and guards, described below | `supabase/functions/_shared/career_mail.ts` |
| Planner guards, described below | `career_mail.ts` `planUpdates`, `candidates` |
| Second pass, described below | `supabase/functions/_shared/career_mail_model.ts` |
| Wiring: `CAREER_MAIL_MODEL=on` (off by default); OpenAI forced whatever `MODEL_PROVIDER` says; `CAREER_MODEL` (default gpt-5-mini). No key: `NOT_WIRED` plus a one-line ask in the run's answer. One `agent_turn_costs` row per person per run (thread null) | `career_proactive_run.ts` `runMail`, `career-proactive/handler.ts`, `index.ts` |
| `store: false` passed through to OpenAI's request | `model_gateway.ts` `toOpenAI` |
| Eval: dev / devcheck / holdout / blind40, `--only`, second-pass reach | `evals/career/mail-eval.ts`, `evals/career/mail-blind.json` |

**Rules guards.** A message is "other" when it is any of these:

- a card, loan or lease application;
- a "maybe-step" ("if you are selected for an interview");
- cold outreach;
- an automated non-ATS sender with no job word (rejections too);
- a calendar or meeting notice;
- an auto-reply or a clinic visit;
- from an ATS brand on any other domain;
- a scam or look-alike.

The talk/chat family counts as an interview only when the words refer to the application.

**Planner guards.**

- An **offer**, or anything the model decided, moves a stage only from the employer's own authenticated mail. This is
  WO-032's `fromEmployer`: Gmail's DMARC/DKIM pass, the registrable domain, corporate TLDs, and slug or tenant only.
- An offer via DocuSign or a self-serve ATS (Breezy, Recruitee, JazzHR, Workable, BambooHR, Pinpoint, Teamtailor) is said
  with "check it is real" and moves no stage.
- A rejection names the same job, or it moves nothing.
- The model never starts a hand application.

**Second pass.** It sends only mail that passes every one of these:

- it is ambiguous;
- it names an application ("your application", "the X role", an interview);
- it is not from a marketing sender;
- it matches an application on file;
- it is newer than the last read;
- it carries no injected instruction.

Caps and outcomes:

- At most 20 calls per person and 300 per run (safe across parallel people).
- A strict verdict (kind in the list, confidence at least 0.85) or nothing.
- Interview, assessment and recruiter_reply can move a stage.
- An offer or rejection read by the model is only said ("may be an offer ... tell me if it changed"); "received" is dropped.

No migration: `agent_turn_costs.thread_id` is already nullable.

## 5. What goes to OpenAI (S7), and the owner's to-do

**Sent, per eligible message:**

- the From line (sender name and address);
- the Subject;
- Gmail's snippet (about 200 characters).

In the subject and snippet, every run of six or more digits becomes `[number]` and every email address becomes `[email]`.

**Never sent:** the body, attachments, the date, the message id or its hash, the person's name or profile, or any other
message.

**Retention:**

- The request sets `store: false`, so OpenAI does not keep the completion in its stored-completions log.
- Under OpenAI's published API data policy, API inputs are not used for training, and abuse-monitoring logs are kept up to
  30 days unless the account has zero data retention (ASSUMED; not checked against the owner's OpenAI account).
- Locally, nothing from the call is stored except the cost row (tokens and dollars) and, when the verdict is used, the event's
  evidence line ("model interview 0.94", the subject and the sender domain).

**Owner, before `CAREER_MAIL_MODEL=on`:** Google's API Services User Data Policy (Limited Use) applies to Gmail data.
Sending it to a third-party AI model needs:

- a line in the privacy policy;
- an in-product disclosure and consent that names OpenAI;
- for restricted scopes, Google's verification and security assessment if not already done.

ASSUMED reading of the policy; counsel and the owner decide. Until then the switch stays off.

**Cost:** about $0.0001-0.0003 per call (ASSUMED: ~330 input and ~60 output tokens at the gateway's third-party gpt-5-mini
price), at most 300 calls per run.

## 6. Architect review of c22cfdd2: what changed

| Item | Fix | Test |
|---|---|---|
| Base | merged trunk and `wo/032-apply-ops`; WO-032's `fromEmployer` kept, `ownDomain` deleted; `planUpdates` passes `m.from`, `m.auth` | all suites |
| B1 false offer from promos | bare "would/want to offer you" removed | R4 |
| B2 look-alike senders | `fromEmployer` (authenticated, strict); ATS brand on another TLD is a look-alike | S1 (stripe.work-style, .careers, gs.work, goldman.xyz, greenhouse.xyz, ashbyhq.net, myworkdayjobs.net, lever.xyz, unsigned mail) |
| B3 calendars, sales reps, auto-replies, clinic visits | calendar/meeting senders and auto-reply/clinic words are noise; talk/chat needs the application | R4 |
| B4 personal mail to OpenAI | ambiguous needs an ATS/vendor or a job word; sent only with an application reference, a matching application, no marketing sender | M6 |
| S1 shop "regrets" as rejections | rejections pass the job-word gate | R4 |
| S2 model offers and injections | the model moves only interview/assessment/reply; its offer or rejection is only said; injected instructions are never sent | M3, M6 |
| S3 overlap re-sends | only mail newer than the last read is sent | M6, W5 |
| S4 DocuSign / self-serve ATS offers | said with "check it is real", no stage move, not in history | S3 |
| S5 a different job's rejection | a rejection must name the same job (neither role has words the other lacks) | S5 |
| S6 over-fitting | blind40 written and committed first; fresh20 held out; both scored once (section 2) | E1, E2 |
| S7 data handling | `[number]`/`[email]` masking, `store: false`, section 5 | M1, W1 |
| Nits | rules run once per message per run; a 300-call run cap; plants for the ATS-name branch, SCAM and the 20-call cap | M7, W6, S2 |

WO-024/M6's offer fixture now carries Gmail's Authentication-Results. An offer moves a stage only from authenticated employer
mail, so the test's own contract changed with it. Disclosed rather than hidden.

## 7. Tests: `tests/architect/wo-040-mail-accuracy.test.ts` (24 tests)

| Tests | Covers |
|---|---|
| E1-E2 | splits and floors |
| R1-R4 | rule families and review regressions |
| S1-S5 | look-alikes, the ATS name, self-serve offers, hand applications, a different job's rejection |
| M1-M7 | what is sent, guardrails, what the model may do, model words dropped, OpenAI-only, what is never sent, the cap |
| W1-W6 | the run: cost row, NOT_WIRED, read-only, garbage model, the overlap, the run cap |

## 8. Planted defects (each a one-line change; the named test fails; reverted)

| # | Defect | Failing test |
|---|---|---|
| D1 | low confidence accepted | M2 |
| D2 | any kind the model names accepted | M2 |
| D3 | the model's "received" opens a hand application | S4 |
| D4 | an offer from a stranger's authenticated domain moves the application | S1 |
| D5 | the date and hash go to the model | M1 |
| D6 | the second pass is on unless turned off | M5 |
| D7 | `MODEL_PROVIDER=anthropic` followed | M5 |
| D8 | the second pass's cost not recorded | W1, W4 |
| D9 | "if you are selected for an interview" read as an invite | R2 |
| D10 | a card or loan application read as a job application | R3 |
| D11 | the ATS branch of `fromEmployer` accepts any display name | S2 |
| D12 | the SCAM check removed | S1 |
| D13 | the per-person cap of 20 removed | M7 |
| D14 | the run-wide cap removed | W6 |
| D15 | bare "we'd like to offer you" restored | R4 |
| D16 | an ATS brand on another TLD not a look-alike | S1 |
| D17 | talk/chat without the application | R4 |
| D18 | calendar senders read as mail | R4 |
| D19 | auto-replies not noise | R4 |
| D20 | mail about no application sent to the model | M6 |
| D21 | a person's mail with a step word is ambiguous | M6 |
| D22 | rejections skip the job-word gate | R4 |
| D23 | the model's offer moves the stage | M3 |
| D24 | injected instructions reach the model | M6 |
| D25 | mail already read is sent again | M6, W5 |
| D26 | an offer via DocuSign or a self-serve ATS moves the stage | S3 |
| D27 | a different job's rejection marks the tracked one | S5 |
| D28 | numbers and addresses not masked | M1 |
| D29 | `store: false` does not reach OpenAI | M1, W1 |

## 9. Demo (owner)

- `deno run --allow-read evals/career/mail-eval.ts --only holdout,blind40` prints the numbers and every miss.
- `deno test -A --no-check tests/architect/wo-040-mail-accuracy.test.ts` runs the guards.

## 10. Not built, and why

- **The target on unseen wording.** blind40 and fresh20 show the rules at 33-50% recall. Another rules round would be tuning
  on those sets. The next real step is the second pass, measured live with consent, or a fresh, independently written labeled
  set.
- **The second pass live.** It needs `OPENAI_API_KEY`, the owner's `CAREER_MAIL_MODEL=on`, and the Limited Use disclosure and
  consent in section 5. Until then its accuracy and cost are NOT_RUN.
- **A real-mail number.** It needs consented, labeled mail from real inboxes. NOT_RUN.
- **Known precision holes, from the held-out sets, left unfixed on purpose:**
  - a rejection under "Thank you for applying" read as received (B12);
  - a "Re:" rejection read as a recruiter reply (B09);
  - "Delta Air Lines" read as a person's name.
- **Persisting which messages were sent to the model** (no migration). The cursor rule means a message Gmail indexes late,
  after the next read, is never sent to the model.
- **Within 1 hour:** unchanged from WO-024 (the 5-minute schedule); nothing more is claimed.
- **DB suite:** NOT_RUN in this worktree. Its isolation guard refuses `su` and `runuser`, and `initdb` refuses root. No SQL
  changed.
