# WO-045: mail that reads interviews, replies and employer names

Owner target: 95%+ of application status changes read from the person's own mail; precision 97%, recall 95% on the
status kinds. WO-043's classifier scored **94.9% / 93.3%** on the architect's blind160 (written by someone else). This
order fixes the weak spots that check named, without weakening a safety rule. Offline: no model, no network, no spend.

Labels: **VERIFIED** (measured here, command shown), **SYNTHETIC** (hand-written mail, not real), **NOT_RUN**,
**NOT KNOWN**.

## 1. Result in one paragraph

On the new sealed quarter written for this order (dev5check, 63 emails, 51 status, scored once after the classifier
commit) the classifier went from **87.8% / 84.3% to 92.0% / 90.2%** (VERIFIED, SYNTHETIC). **That is below the 97% / 95%
target.** On the splits read for misses it is at or above target: dev 100.0 / 99.2, dev4 99.5 / 97.0, dev5 99.3 / 98.7,
and blind160 **100.0% / 99.2%** (was 94.9 / 93.3). blind160 is now a tuned number, not a blind one (section 6). No
rejection was read as an interview on any split, before or after. **The target is not shown to be met on unseen wording:**
dev5check is the only unseen number and it misses; real inboxes are NOT_RUN.


## Architect's blind check: blind200 (review, 2026-10-20; VERIFIED, SYNTHETIC, scored once)

200 emails (160 status) written by a separate agent that never read the classifier, any labeled mail or any eval file.
27 are in Spanish, Portuguese, French or German. The set was sealed (sha256 0b5f8fed…) and scored once on 22d0ccf3. It is
now `evals/career/mail-blind200.json`, a floor that prints only when named (WO-045/E9).

| Status kinds | trunk 55e5a61f | this branch |
|---|---|---|
| All 200 | 98.4% (124/126) / 77.5% (124/160) | **99.2% (129/130) / 80.6% (129/160)** |
| English (173 emails, 135 status) | 98.4% / 89.6% | **100.0% / 91.9%** |
| The 27 others (25 status) | 100% / 12.0% | 83.3% / 20.0% |
| Rejection read as an interview | 0 | 0 |

This is the honest number on wording nobody tuned against. **It is far below the 97/95 target.**
- **The largest gap is language.** The classifier is English-only, and 20 of its 31 status misses are in other
  languages: "Ihre Bewerbung bei Siemens – Eingangsbestätigung", "Convite para entrevista", "Hemos recibido tu
  candidatura", and so on.
- **In English, the misses are:**
  - calendar invitations: "Invitation: Google Interview - Technical Phone Screen @ Tue…" and "Updated invitation: Interview:
    Final Round…". WO-040's rule says a calendar sender is never the employer;
  - forwarded mail ("Fwd: Interview Invitation - Cognizant");
  - a scheduling confirmation ("Confirmed: 30 Minute Recruiter Screen with …");
  - a few terse lines ("Interview call - Relationship Manager", "help desk role").
- **Real inboxes are NOT_RUN.**
- **Next (WO-046):** status phrases in Spanish, Portuguese, French and German; calendar invitations whose event names an
  interview and an employer, as evidence that never moves a stage alone; forwarded mail read on its forwarded part. A fresh
  set written by an independent agent will be scored once.

## 2. Why

WO-043's blind160 misses (architect review) fell into four groups: interview invitations that do not look like the
phrase families (a reschedule, a vendor's scheduling link, a founder's "coffee?"); recruiter replies in other shapes
("AW:", "Quick update", "Re: checking in"); look-alikes read as a status (an adoption application, a card decline, a
candidate-experience survey, a practice site's weekly challenge, a sales "Re: quick question"); and employer names
("Recruitment Wipro", "TCS", "Sophie at Loom", lmco, bswhealth, none for "Application received: Linear"). Reading the
misses, most were not missing words: they were the sender read wrongly. "Palantir Interview Coordination" and "Linear
Hiring" read as people; "Sabine Müller" did not (ASCII only); "Nina Park <nina@rippling.com>" read as an ATS because
Rippling is one; "karat.io" read as a look-alike of karat.com; "Capital One <capitalone@...>" read as a person.

## 3. What changed (`supabase/functions/_shared/career_mail.ts`)

Senders and names:
- **Persons**: names in any alphabet; a first name and an initial ("Karri S"); a lone given name that is the address's
  own local part ("Ollie <ollie@pinecrest.dev>"); "Sophie at Loom". Never a hiring desk ("... Recruiting", "...
  Interview Coordination", "Karat Scheduling") and never a brand whose name spells the sender's own domain.
- **A person at a company that is itself an ATS** ("Nina Park <nina@rippling.com>") writes as that company, when the
  address spells the person's name; never on a tenant host (myworkday, taleo, successfactors, ...), so "Delta Air Lines
  <delta@myworkday.com>" stays Delta's tenant.
- **Employer names**: "X at Y" and a desk named first or last ("Recruitment Wipro", "Talent Acquisition | Deloitte",
  "Linear Hiring") name the company; a desk with no company left ("HR Department") names nobody and the domain does. Four
  aliases, matching data only: lmco (Lockheed Martin), bswhealth (Baylor Scott & White), tcs (Tata Consultancy
  Services), bah (Booz Allen Hamilton); a display name that is an alias is said in full ("TCS" -> Tata Consultancy
  Services). A domain that is the name plus "mail" is the same company. From the words: "Roblox has partnered with
  Karat", "Your Karat interview for Indeed", "Robinhood would like to invite you", "Application received: Linear".
- `karat.io` is Karat's (assessment vendors list).

Reading:
- **Reply prefixes** in the languages recruiters write in: Re, AW, SV, VS, Antw, R, RIF, RES, Odp, Ynt. A bare reply
  prefix from a sender known only by a given name is not a recruiter's reply (the WO-024 "Re: lunch" hole is not widened).
- **Interview words**: calendar-style subjects from the employer ("Invitation:", "Updated invitation:", "Rescheduled:",
  "Confirmed:"), "new time", a weekday, reschedules ("we've moved your interview to"), "shortlisted for the ...
  interview", "this confirms your interview", "the details for your interview", coffee, drop-ins, "any chance you're
  around", a founder or executive as the person you meet.
- **Recruiter-reply words**: "in consideration", "taking longer", "inform you of the outcome", "I'll ping you", "the HM
  is out", "radio silence", "apologies for the delay".
- **Assessment words**: a written or business case, a coding or aptitude round, a hall ticket, build / draft / work
  through, "valid until", "send it back by".
- **Decision**: (a) the share bar for an interview or a test counts the earlier steps' evidence (received, recruiter
  reply) with it, not against it: "thanks for applying, want to hop on a call?" is an invitation; (b) a person's own
  receipt (the received rule fired, no status-of-the-process words) is a receipt, not a recruiter reply.
- **An offer said not to be made** ("we won't be extending an offer") no longer reads as offer talk; only the rejection
  families read it, so it is a rejection instead of "other".
- **"The hiring team" is a group, not a hire**: a negation in front of it ("won't be shared with the hiring team")
  decides nothing.
- **Look-alikes**: adoption, foster and pet applications, an application for a card by any product name, survey
  subjects ("How was your interview experience", "Rate your ... experience", "candidate experience"), a practice site's
  games (streaks, leaderboards, weekly or daily challenges, arcade), a sales sequence ("are you the right person to talk
  to", "book 30% more meetings", "a 15-min demo"). A reply about interview feedback ("Re: Interview feedback?") is not a
  feedback form.

Unchanged: every WO-024/040/043 guard, `fromEmployer`, `planUpdates`, the second pass, the decided-against veto, the
offer-talk guard, the own-words rule, the call-needs-the-application rule. **A calendar tool's notice stays "other"**,
including blind160's S017 ("Google Calendar ... Duolingo Recruiting has invited you to Interview"): the calendar tool is
not the employer and anyone can title an event (WO-040 review B3). That is the one blind160 miss left, on purpose.

Weights: refit with `evals/career/mail-fit.ts --write` on the **same** tuning splits as WO-043 (tune, tune2, dev3, dev4;
WO-043/W1 pins them). dev5 and blind160 informed the rules and families only; no weight is fitted on them. One tuning
email (H49, a Duolingo streak promo) is now decided by a guard before the scorer, so the fit reads 493 emails (was 494).

## 4. dev5: the new set

- **253 SYNTHETIC emails** in `evals/career/mail-dev5.json`, written by the WO-045 builder: interview 59, recruiter reply
  40, received 30, rejection 35, assessment 24, offer 15, other 50. Committed alone in **e0a16969**, before the classifier
  commit **57ff0d24**.
- Split by a fixed seed: FNV-1a of `id + "wo-045-seed-20261020"` mod 4; remainder 0 is **dev5check** (63: 51 status),
  the rest **dev5** (190: 152 status). `mail-eval.ts` prints dev5check only when named.
- It was written after reading the blind160 misses in full (section 10), so it echoes their shapes and some items are
  near-copies (for example F102 of S117, F010 of S159, F007 of S160, F213 of S065). dev5check is therefore an optimistic,
  correlated check, not an independent one.

## 5. Numbers (all SYNTHETIC; VERIFIED)

Before is trunk `55e5a61f`; after is `57ff0d24` (classifier unchanged since). Status precision / recall over the six
status kinds.

| Split | Size (status) | Use | Before P / R | After P / R | Rejection read as interview | Status read as another status |
|---|---|---|---|---|---|---|
| dev (tune+tune2+dev3) | 332 (257) | weights fitted; read for misses | 100.0% (254/254) / 98.8% (254/257) | 100.0% (255/255) / 99.2% (255/257) | 0 -> 0 | 0 -> 0 |
| dev4 | 260 (199) | weights fitted; read for misses | 99.5% (192/193) / 96.5% (192/199) | 99.5% (193/194) / 97.0% (193/199) | 0 -> 0 | 0 -> 0 |
| dev5 | 190 (152) | read for misses (not fitted) | 93.1% (134/144) / 88.2% (134/152) | 99.3% (150/151) / 98.7% (150/152) | 0 -> 0 | 2 -> 0 |
| blind160 | 160 (120) | spent: rules written reading its misses (not fitted) | 94.9% (112/118) / 93.3% (112/120) | 100.0% (119/119) / 99.2% (119/120) | 0 -> 0 | 1 -> 0 |
| **dev5check** | **63 (51)** | **never read; scored once after 57ff0d24** | **87.8% (43/49) / 84.3% (43/51)** | **92.0% (46/50) / 90.2% (46/51)** | **0 -> 0** | **2 -> 3** |
| 4-fold CV (tune..dev4) | 456 status | weights from 3 folds score the 4th | WO-043: dev4 99.5 / 93.5 | all 99.5% (442/444) / 96.9% (442/456); dev4 99.0 / 95.5 | 0 | |
| devcheck, holdout, blind40, dev4check | | not printed or scored | NOT_RUN here | NOT_RUN here | | |

blind160 by kind, before -> after (precision / recall): interview 100/84 -> 100/96, recruiter reply 80/80 -> 100/100,
received 96/96 -> 100/100, rejection 97/100 -> 100/100, assessment 94/100 -> 100/100, offer 100/100 -> 100/100.
Employer named right: blind160 108/112 -> 119/119; dev4 184/192 -> 190/193; dev5 117/134 -> 147/150; dev5check 37/43
-> 43/46.

Recall on 51 dev5check status emails: 46/51 has a 95% interval of roughly 79-96%; it can neither show nor rule out 95%.

Commands:
- `deno run --allow-read evals/career/mail-eval.ts --only dev,dev4,dev5,blind160` (per kind, every miss)
- `deno run --allow-read evals/career/mail-eval.ts --only dev --check` (exit 0)
- `deno run --allow-read evals/career/mail-fit.ts --cv`; refit `deno run --allow-read --allow-write evals/career/mail-fit.ts --write`
- dev5check: the one-time before/after was a single run of a throwaway script importing trunk's `career_mail.ts` and this
  branch's (not committed). Later regression checks: test E4.

## 6. What is still missed

- **dev5check (read after the one-time score; NOT fixed):** F012 "re: your application" (a founder's call invite) and
  F052 "Re: DoorDash Strategy & Ops" (a case interview time agreed) read as recruiter replies; F122 "Re: Vet Tech
  position" (a person's receipt, a debatable label) read as a recruiter reply; F078 "Re: salary expectations" read as
  other; F179 an Infosys hall ticket read as other; F221 "Re: lunch" read as a recruiter reply (the WO-024 hole);
  employer names HCL (want HCLTech), BSW (want Baylor Scott & White), NHS (want the trust named in the text).
- **Same root in dev5:** a person's reply that schedules an interview competes with the recruiter-reply rule (F010
  "coffee next week?"); a founder's rejection under a "re:" subject ties with the reply rule and stays "other" (F143,
  safe). blind160's S159 ("coffee?") passes, narrowly.
- **dev4 (pre-existing):** V056/V078 offers from a person, V103 "profile registered", V181 a hiring-event invite, V196
  a person's video-call invite, V219 a thank-you for a candidacy, V259 "not able to invite you to the first round of interviews" (the interview words
  outweigh the rejection's, so the veto says "other": safe),
  V198 a scholarship rejection, Mercado Libre names.
- **Calendar notices** (blind160 S017) stay "other" by design (section 3).
- **Structural:** the fit cannot learn from dev5 or blind160 (WO-043/W1 pins the tuning splits). New words mostly ride
  on families the old splits already weigh. Letting dev5 into the fit would need the architect to change W1.

## 7. Known precision holes (pre-existing, unchanged)

A full-name colleague's "Re: lunch" at a company domain reads as a recruiter reply (WO-024 rule; requiring a job word
for a bare reply was tried and cost real replies whose subject is a role title: dev H43, dev4 V086/V307, dev5 F087;
reverted). A friend's "Congrats on your offer" from a company domain reads as an offer (the planner's `fromEmployer` limits
it). A scholarship rejection reads as a rejection (moves nothing without an application on file).

## 8. Tests: `tests/architect/wo-045-mail-interviews.test.ts` (15 tests)

| Tests | Covers |
|---|---|
| E1-E4 | dev5's size, seed split, synthetic origin, disjointness, sealing; dev, dev4, dev5 at target with no rejection read as an interview; blind160 at or above the WO-043 floor (94.9 / 93.3) and the WO-045 floor (99 / 99, employer 99%); dev5check floor at its one-time score (92.0 / 90.2) |
| B1-B4 | every blind160 miss fixed here, pinned: S148, S160, S159 interviews (and S017 stays other); S086, S110, S124 replies, S117 a receipt, the reply prefixes; S023, S106, S030, S045, S065 stay other; S006, S025, S048, S095, S096, S112, S127 employer names |
| S1-S7 | decided-against words never an interview in calendar subjects, reschedules, vendor mail and with weights inflated on purpose; an offer said not to be made is a rejection, offer talk never an interview; "the hiring team" in a negation decides nothing; a receipt never becomes an interview; look-alikes stay other; aliases are matching data and never loosen `fromEmployer` (tcs.xyz is not TCS); a calendar notice moves no application |

Planted defects (each a one-line change; the named tests fail; reverted; VERIFIED by a throwaway runner):

| # | Defect | Caught by |
|---|---|---|
| D1 | negated offers read as offer talk | S2 |
| D2 | earlier steps no longer count toward an interview's share | E3, B1 |
| D3 | a person's receipt rule removed | E3, B2 |
| D4 | adoption and foster applications are jobs | B3, S5 |
| D5 | "the hiring team" is a hire again | S3 |
| D6 | a brand's display name reads as a person | S5 |
| D7 | the lmco alias removed | B4 |
| D8 | ATS tenants read as staff | S6 |
| D9 | only "Re:" is a reply prefix | B2 |
| D10 | survey subjects are not noise | E4 |
| D11 | practice-site games are not noise | E4, B3 |
| D12 | "X at Y" display names keep the person | B4, S6 |

## 9. Gate and suites (VERIFIED on this branch)

- `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`: 434 passed, 0 failed (419 before the new
  file).
- The gate's edge tests (the list in `scripts/gate.sh`): 129 passed, 0 failed.
- `python3 scripts/build-router-core.py --career-only --check`: Router bundle verified.

## 10. Honesty log

- **blind160 was read in full for its misses** (the 20 WO-043 misses, sender, subject, snippet and label) before dev5 was
  written and before any rule changed, as the order allowed. It is spent as a blind check: its after score is a tuned
  number. No weight is fitted on it (WO-043/E4 still holds).
- **dev5 echoes blind160** (section 4); it was written by the same builder who changed the rules. dev5check is the only
  number on mail not read while changing rules, and it is from that same author and batch.
- **dev5check was scored once**, after `57ff0d24`, in one run that printed trunk's and this branch's numbers; its misses
  were then read for section 6 and nothing in the classifier changed after.
- **Held-out splits:** devcheck, holdout, blind40 and dev4check were never printed or scored item by item; `mail-eval.ts`
  was run only with `--only` naming dev, dev4, dev5, blind160. The required suites run WO-040/E2 (devcheck, holdout,
  blind40 floors) and WO-043/E3 (dev4check floor): pass/fail signals about held-out splits. They passed on every run;
  none failed during this work.
- **Never read:** anything under `/tmp` or any path containing "sealed". Throwaway scripts (debug prints, the one-time
  score, the planted-defect runner) lived in an untracked folder inside the worktree and are not committed.
- **Tried and reverted:** taking "your application" out of the recruiter-reply rule (blind160 and dev lost replies);
  requiring a job word for a bare reply (section 7).
- **Labels I would now question in dev5:** F116 (labeled RTX, the sender says Raytheon), F122 (a person's "I've got your
  resume" under "Re:", labeled received), F047 (labeled with the trust's full name). Left as committed.
- Real inboxes: **NOT_RUN**. No real mail was read. OpenAI-only rule: nothing here calls a model.

## 11. Demo (owner)

- `deno run --allow-read evals/career/mail-eval.ts --only blind160` prints per-kind numbers and the one miss (S017).
- `deno run --allow-read evals/career/mail-eval.ts --only dev5` prints dev5 and its misses.
- `deno test -A --no-check tests/architect/wo-045-mail-interviews.test.ts` runs the floors, pinned cases and guards.

## 12. Files

`supabase/functions/_shared/career_mail.ts` (senders, names, families, decision, weights), `evals/career/mail-dev5.json`
(data), `evals/career/mail-eval.ts` (dev5 splits, dev5check sealed), `tests/architect/wo-045-mail-interviews.test.ts`,
this document.
