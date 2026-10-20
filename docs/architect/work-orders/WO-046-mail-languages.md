# WO-046: mail in six more languages, calendar notices and forwards

Owner target: 95%+ of application status changes read from the person's own mail, at 97%+ precision, on wording nobody
tuned on. WO-045's classifier scored **99.2% / 80.6%** on the architect's blind200. English alone was 100% / 91.9%; the
emails in Spanish, Portuguese, French and German were 83.3% / 20.0%. This order adds those languages plus Italian and
Dutch, reads calendar invitations and forwarded mail, and keeps every safety rule. Offline: no model, no network, no
spend. Nothing here calls an API (OpenAI or Anthropic).

Labels: **VERIFIED** (measured here, command shown), **SYNTHETIC** (hand-written mail, not real), **NOT_RUN**,
**NOT KNOWN**.

## 1. Result in one paragraph

On the quarter of the new set that was held out (dev6check: 78 emails, 59 status), scored once after the classifier
commit, the classifier went from **88.9% / 40.7% to 100.0% / 91.5%** (VERIFIED, SYNTHETIC). Precision clears 97%.
**Recall does not reach 95%.** On that held-out quarter:
- the six languages are 100.0% / 96.8% (30/31);
- calendar notices and forwards are 100% / 100% (6/6);
- English is 100.0% / 83.3% (20/24). The four English misses are wording gaps, listed in section 6.

blind200 is now **100.0% / 99.4%**. That is a tuned number, not a blind one: this order read its misses (section 10).
No rejection was read as an interview on any split, before or after. **The target is not shown on unseen wording:**
dev6check is from the same author and batch as the mail tuned on, and real inboxes are NOT_RUN.

## 2. What changed

### 2.1 Six languages (`supabase/functions/_shared/career_mail_langs.ts`, new file, data only)

Each language (es, pt, fr, de, it, nl) is one block of word lists. The parts mirror the English reader:
- **marks**: words that pick the language;
- **rules**: strong phrases. Each sets `rule:<kind>`, as the English RULES do;
- **families**: each list sets the **same feature its English family sets** (`rc:got`, `rj:pass`, `iv:noun`, `as:deadline`,
  `of:extend`, `rr:status`, ...). The fitted weights therefore read a German receipt exactly as they read an English one,
  and nothing is fitted per language;
- **negators + progress**: a negator in front of a verb of progress in the same clause is `rj:negated`. Examples:
  "leider ... nicht berücksichtigen", "lamentablemente no podemos seguir", "malheureusement ... n'a pas été retenue",
  "infelizmente não seguirá", "purtroppo non possiamo procedere", "helaas niet verder";
- **noDecision**: a condition, an instruction or other people ("si no eres seleccionada, ...", "falls Sie nicht ...",
  "se non sarai selezionato").
- **past / maybe**: a step already done or one that may come ("gracias por la entrevista", "qualora il Suo profilo ...");
- **job, noise, notJob**: job words; alerts, newsletters, surveys and advice; a card, a loan or a flat;
- **recruiter**: "tu candidatura" or "Ihre Bewerbung" in a person's reply.

`langOf` reads a message in English always, and also in one of the six when that language's marks lead. It needs at least
three marks and more marks than English has. Two marks are enough when the text has no English marks at all. Checked:
- every older set (labels, dev4, dev5, blind160) reads as English only;
- blind200 reads exactly its 25 es/pt/fr/de emails as foreign;
- dev6 matches its labeled language except six very short messages, five of them "other".

Patterns use letter-aware word edges, because `\b` in JavaScript does not treat "é" as a letter.

In `career_mail.ts` the language reader runs alongside the English one in `readMail`. The two use the same text modes:
- forward families read the live text;
- rejection families read the deciding sentences;
- offer families read the text minus negated sentences, so "no podemos ofrecerte el puesto" is not offer talk.

Every code guard then applies unchanged:
- the decided-against veto;
- the offer-talk guard;
- the own-words rule;
- the call-needs-the-application rule (it now also accepts foreign job words);
- the person-only recruiter reply;
- the job-board, personal-address and cold-outreach guards.

Supporting changes:
- personal-mail domains of those countries (gmx.de, web.de, orange.fr, libero.it, uol.com.br, ...);
- `gupy.io`, `welcomekit.co` and `softgarden.io` added as ATSs;
- hiring desks' names in the six languages ("Selección Telefónica", "Santander Talento", "Erste Group Karriere");
- foreign no-reply locals ("naoresponda", "ne-pas-repondre");
- name particles ("Sanne de Boer", "Lisa de Vries");
- "Olivia from Chipotle" names Chipotle.

### 2.2 Calendar invitations (decided after reading `planUpdates`, `fromEmployer` and the stage rules)

A calendar or scheduling tool's notice can now be an interview, but only as evidence. Tools: Google Calendar, Outlook,
Calendly, Zoom, Teams, Doodle, and an employer's own `calendar@` address. Three conditions:
1. the event names an interview, an employer and the job;
2. nothing in the notice decides against the person;
3. it is not practice, prep, a debrief, a social event or a cancellation.

When all three hold, the classification carries **`via: "calendar"`**. Otherwise the notice is "other", as before.
Examples:
- "Google Interview - Technical Phone Screen (Software Engineer III)" reads as an interview with Google;
- "Recruiter Screen with Jessica Lin (Ramp, Software Engineer - Growth)" reads as Ramp, never the person you meet.

WO-040's rule holds in the sense the order states. `planUpdates` puts a calendar-only signal in `plan.evidence`, linked
to the application it names. It never:
- moves a stage;
- writes an event or a text;
- starts an application.

`fromEmployer` is false for any `via`, even from the employer's own authenticated domain (test C2).

**Why the job must be named.** Three existing tests assert that a calendar tool's notice without a job stays "other":
WO-045/S5 ("Interview - Stripe"), WO-045/B1 (blind160 S017, "... / Duolingo – Hiring Manager") and WO-040/R4 ("Asana <>
Sam - Recruiter Screen"). Requiring the job is a real principle: evidence has to say which application it is about. It
also keeps those three tests passing. Without that requirement they would flip to interview. That would be harmless,
because the notice is evidence only, but it would mean editing three existing tests. **The architect decides:** drop
`CAL_ROLE` in `calendarNotice` and edit those three assertions, or keep it. Cost of keeping it: three dev6 calendar
notices labeled interview stay "other" (section 6). Planted defect D4 shows the three tests are the ones that move.

An employer's own calendar-style subject ("Updated invitation: Interview: Final Round - Capital One @ ..." from
recruiting@capitalone.com) is not a tool's notice. It is now an interview phrase (`rule:interview`), as WO-045 intended.

Replies to an invitation the person sent ("Accepted:", "Declined:", "Tentatively accepted:", "Aceptado:", "Abgelehnt:",
...) are "other" from any sender.

### 2.3 Forwarded mail

A subject prefix in any of the clients' languages marks a forward: Fwd, FW, WG, TR, RV, ENC, I, Doorst. The forwarded
part is parsed from the snippet:
- the marker in seven languages ("Forwarded message", "Weitergeleitete Nachricht", "Mensaje reenviado", ...);
- the From/Date/Subject/To fields in those languages.

That part is read as the original message, with the original sender when it shows an address. When it shows only a name
("From: Cognizant Talent Acquisition"), the sender is that name. The forwarder (the person) is never the sender or the
employer. Every result carries **`via: "forward"`**, and `forwarded_from` only when the original address is shown.

In `planUpdates`:
- **a forward without the original sender is evidence only**, like a calendar notice;
- a forward that shows the employer's sender moves stages as that mail would. The order allows this;
- a forward **never starts an application**, because someone else's receipt can be forwarded;
- a forwarded offer is never confirmed, because `fromEmployer` is false for any `via` (test F2).

A forward is decided outside the scorer, so the weights never learn from it. It is never marked `ambiguous`, so it never
goes to the model's second pass.

### 2.4 English gaps fixed (read from blind200 and dev6 misses)

- a registration interview (the "registration" noise word no longer eats it);
- an "interview call" and face-to-face or walk-in interviews;
- "invite for your interview" in a recruiter's reply;
- "Another candidate has been selected";
- an online case;
- "offering the ... contract" and "sign by";
- "thanks for applying" now counts as referring to the application;
- the "profile" noise word no longer eats "profile has been registered";
- a campus desk is a job sender;
- `assessor` no longer eats "Assessor de Investimentos".

New noise: scorecards, a slot or debrief "for the candidate" (the person interviewing someone else), interview-prep
classes, and new-hire onboarding (I-9, direct deposit). Aliases (matching data only): pg, fmr, chop, ssa, dhs.

### 2.5 Weights

Refit with `evals/career/mail-fit.ts --write` on the **unchanged** tuning splits (tune, tune2, dev3, dev4; WO-043/W1
untouched). The fit now reads 494 emails (was 493). V103 is no longer eaten by the "profile" noise rule, so it enters the
fit, and V261 (onboarding) leaves it.

**Why dev6 is not in the fit:** the foreign families set the English features, so the existing weights already apply to
them. Fitting on dev6 would make dev6 a training number and buy little. It stays a read-for-misses split, like dev5.

## 3. dev6: the new set

- **317 SYNTHETIC emails** in `evals/career/mail-dev6.json`, written by hand by this builder. Commit **8255b48e** holds only
  the JSON and comes before the classifier commit **c96da00d**.
- **152 in the six languages**: es 27, pt 25, fr 25, de 27, it 24, nl 24. They cover received, rejection (polite negations
  included), interview, assessment, offer and recruiter reply, plus look-alikes (alerts, a card, a flat, a survey, a
  friend).
- **40 calendar notices and forwards**: 24 calendar, 16 forward. Of the calendar notices, 14 are interviews (three of them
  name no job) and 10 are other (social events, mock interviews, Accepted/Declined/Tentative, a debrief).
- **125 other English emails**, in new wordings.
- Kinds: received 45, rejection 60, interview 66, assessment 26, offer 25, recruiter reply 25, other 70.
- Fields: `lang` and `shape` (calendar or forward) as well as the usual ones.
- Labels say what a message is, not what a rule allows. A calendar interview notice is labeled interview even when it names
  no job.
- Split by FNV-1a of `id + "wo-046-seed-20261020"` mod 4. Remainder 0 is **dev6check** (78 emails, 59 status); the rest is
  **dev6** (239 emails, 188 status). `mail-eval.ts` prints dev6check only when named.
- Written after reading WO-043, WO-045 and blind200's misses in full, so it echoes those shapes.

## 4. Numbers (all SYNTHETIC; VERIFIED)

"Before" is the branch base **9c78ee15** (WO-045 as reviewed). "After" is **c96da00d**; the classifier is unchanged since.
P and R are precision and recall over the six status kinds.

| Split | Size (status) | Use | Before P / R | After P / R | Rej. → interview | Status → other status |
|---|---|---|---|---|---|---|
| dev (tune+tune2+dev3) | 332 (257) | weights fitted; read | 100.0% (255/255) / 99.2% (255/257) | 100.0% (256/256) / 99.6% (256/257) | 0 → 0 | 0 → 0 |
| dev4 | 260 (199) | weights fitted; read | 99.5% (193/194) / 97.0% (193/199) | 99.0% (193/195) / 97.0% (193/199) | 0 → 0 | 0 → 0 |
| dev5 | 190 (152) | read (not fitted) | 99.3% (150/151) / 98.7% (150/152) | 99.3% (150/151) / 98.7% (150/152) | 0 → 0 | 0 → 0 |
| blind160 | 160 (120) | spent (WO-045) | 100.0% (119/119) / 99.2% (119/120) | 100.0% (119/119) / 99.2% (119/120) | 0 → 0 | 0 → 0 |
| **blind200, all** | 200 (160) | **spent here: misses read** | 99.2% (129/130) / 80.6% (129/160) | **100.0% (159/159) / 99.4% (159/160)** | 0 → 0 | 1 → 0 |
| blind200, English | 175 (137) | spent | 100.0% (125/125) / 91.2% (125/137) | 100.0% (136/136) / 99.3% (136/137) | 0 → 0 | 0 → 0 |
| blind200, es/pt/fr/de | 25 (23) | spent | 80.0% (4/5) / 17.4% (4/23) | 100.0% (23/23) / 100.0% (23/23) | 0 → 0 | 1 → 0 |
| dev6, all | 239 (188) | read for misses | 90.9% (80/88) / 42.6% (80/188) | 98.9% (182/184) / 96.8% (182/188) | 0 → 0 | 5 → 1 |
| dev6, English (not cal/fwd) | 98 (75) | read | 94.3% (66/70) / 88.0% (66/75) | 97.3% (72/74) / 96.0% (72/75) | 0 → 0 | 2 → 1 |
| dev6, six languages | 114 (95) | read | 76.9% (10/13) / 10.5% (10/95) | 100.0% (95/95) / 100.0% (95/95) | 0 → 0 | 3 → 0 |
| dev6, calendar + forward | 30 (21) | read | 80.0% (4/5) / 19.0% (4/21) | 100.0% (18/18) / 85.7% (18/21) | 0 → 0 | 0 → 0 |
| **dev6check, all** | **78 (59)** | **scored once, after c96da00d** | **88.9% (24/27) / 40.7% (24/59)** | **100.0% (54/54) / 91.5% (54/59)** | **0 → 0** | **3 → 0** |
| dev6check, English (not cal/fwd) | 32 (24) | once | 100.0% (20/20) / 83.3% (20/24) | 100.0% (20/20) / 83.3% (20/24) | 0 → 0 | 0 → 0 |
| dev6check, six languages | 38 (31) | once | 57.1% (4/7) / 12.9% (4/31) | 100.0% (30/30) / 96.8% (30/31) | 0 → 0 | 3 → 0 |
| dev6check, calendar + forward | 10 (6) | once | n/a (0/0) / 0.0% (0/6) | 100.0% (6/6) / 100.0% (6/6) | 0 → 0 | 0 → 0 |
| 4-fold CV (tune..dev4) | 456 status | weights from 3 folds score the 4th | 99.5% (442/444) / 96.9% (442/456) | 99.6% (443/445) / 97.1% (443/456) | 0 | |
| devcheck, holdout, blind40, dev4check, dev5check | | not printed or scored | NOT_RUN here | NOT_RUN here | | |

The dev6 rows overlap: the six-language rows include three foreign calendar notices and forwards.

dev6 per language, after (before in brackets). Every language is 100% / 100%:
- es 16/16 (1/1 / 1/16);
- pt 16/16 (1/1 / 1/16);
- fr 17/17 (2/3 / 2/17);
- de 15/15 (1/2 / 1/15);
- it 16/16 (2/3 / 2/16);
- nl 15/15 (3/3 / 3/15).

Employer named right, before → after:
- blind200 119/129 → 155/159;
- dev6 73/80 → 168/182;
- dev6check 24/24 → 54/54.

**Defining "English" in blind200.** The architect's review split blind200 into 173 English and 27 other. `langOf` finds
exactly 25 emails in Spanish, Portuguese, French or German. The other two counted there are probably the Hinglish
messages, B037 and B081 or B146; NOT KNOWN. The table uses the 25 for both "before" and "after", so before reads 91.2% on
English, not 91.9%.

**Recall on dev6check.** Recall on 59 status emails is 54/59. Its 95% interval is roughly 82-96%, so the set can neither
show nor rule out 95%.

dev4's precision drops 99.5 → 99.0 because of V299, a Google Calendar "Interview - Datadog Solutions Engineer" that dev4
labeled "other" under the old WO-040 rule. It now reads as an interview with `via: "calendar"`, which is evidence only. The
label was left as committed.

Commands (VERIFIED):
- `deno run --allow-read evals/career/mail-eval.ts --only dev,dev4,dev5,blind160,blind200,dev6` prints each split by kind,
  with every miss;
- `deno run --allow-read evals/career/mail-eval.ts --only dev --check` (exit 0);
- `deno run --allow-read evals/career/mail-fit.ts --cv`;
- refit: `deno run --allow-read --allow-write evals/career/mail-fit.ts --write` (WO-043/W1 checks it reproduces);
- dev6check: the one-time before/after was one run of a throwaway script that imported 9c78ee15's `career_mail.ts` and
  c96da00d's (not committed). Later checks: test WO-046/E4.

## 5. Tests: `tests/architect/wo-046-mail-languages.test.ts` (14 tests)

| Tests | Covers |
|---|---|
| E1 | dev6's size (300+), 120+ in the six languages (20+ each), 30+ calendar/forward, seed split, synthetic origin, ids disjoint from every older set, dev6check sealed, the fit's splits unchanged |
| E2 | dev and dev6 at the target with no rejection read as an interview; dev6's six languages at the target |
| E3 | blind200 at or above the WO-045 floor (99.2 / 80.6) and the WO-046 floor (99 / 99), English and es/pt/fr/de each at 99 / 99, and `langOf` reads exactly the 25 foreign emails |
| E4 | dev6check floor at its one-time score (100.0 / 91.5, no confusions) |
| L1 | a rejection in each language: polite negations, someone else chosen, the role filled (including across a German relative clause) |
| L2 | an interview invitation in each language |
| L3 | the worst errors: a refused interview or offer in each language is never an interview or an offer; a condition in a receipt decides nothing (es, de, it); the same with interview and offer weights inflated to 20 on purpose |
| L4 | receipts, tests, offers and recruiter replies (including "AW:", "Re:", "Antw:" and "Sanne de Boer") |
| L5 | look-alikes in the six languages stay "other": an alert, a card, two flats (one "chose another candidate"), a survey, a grandmother |
| C1 | calendar notices: interview with `via: "calendar"` only with an interview, an employer (never the person met) and the job; no job, practice, social, cancelled, decided-against, Accepted/Declined/Aceptado all stay "other" |
| C2 | a calendar-only signal never moves a stage (from Submitted, Recruiter screen or OA), adds no event or text, starts no application, is recorded as evidence against the right application, and is never `fromEmployer` (even from the employer's own authenticated domain); the employer's own invitation still moves the stage |
| F1 | forwards: read on the forwarded part; employer and `forwarded_from` from that part only; none when the sender is hidden; never ambiguous; es/fr forwards; a dinner plan, an alert and a scam stay "other" |
| F2 | a forward with the original sender moves a stage; without it, evidence only; a forwarded receipt never starts an application; a forwarded offer is never `fromEmployer` and is refused |
| W1 | the language data is pure (no network, model, env, clock); calendar notices and forwards never reach the fit |

**Planted defects.** Each is a one-line change, planted one at a time and reverted. The runner executed the WO-046, -045,
-043, -040 and -024 mail tests (84 tests, all passing at baseline). VERIFIED with a throwaway runner, not committed.

| # | Defect | Caught by |
|---|---|---|
| D1 | the evidence-only branch for calendar/forward removed | C2, F2 |
| D2 | `fromEmployer` counts calendar notices and forwards | C2 |
| D3 | a forward may start an application | F2 |
| D4 | a calendar interview needs no job named | C1, WO-045/S5, WO-045/B1, WO-040/R4 |
| D5 | Accepted/Declined replies are read | C1 |
| D6 | German "nicht" is not a negator | L3 |
| D7 | a calendar interview is not marked `via: "calendar"` | C1, C2 |
| D8 | the forwarded part is read under the forwarder's own address | E2, E3, E4, F1, F2 |
| D9 | no language is ever detected | E2, E3, E4, F1, L1-L4 |
| D10 | a Spanish condition ("si no eres seleccionada") decides | L3 |
| D11 | a forward without the original sender moves stages | F2 |
| D12 | the language negation (`rj:negated` per language) is skipped | L3, E4 |

The first versions of D5 and D8 were not caught. D5 was masked by other rules in the test cases, so C1 gained two
calendar-tool "Accepted:"/"Aceptado:" notices that name a job. D8 was a no-op change and was replaced with a real defect.

## 6. What is still missed (read after the scores; nothing in the classifier changed after dev6check was scored)

**dev6check (5 misses, all to "other", none a wrong status):**
- L022 "we're going to pass" after a take-home and a panel. The interview and test words outweigh the rejection, so the
  veto says "other" (safe).
- L031 Monzo "won't be offering you the role ... happy to set up a 15-minute call". Same veto; safe.
- L044 KPMG "Assessment Centre ... partner interview".
- L084 a staffing agency's contract offer from a person.
- L228 Desjardins "le poste ... pour lequel vous avez postulé a été pourvu". The post's name and the relative clause are
  longer than the 60-character window.

**dev6 (read):**
- L010 a founder's "got your application" reads as a recruiter reply (debatable label);
- L018 an Indeed Apply receipt: a board sender, with "Coffee" in the employer's name read as a call;
- L046 a founder's "grab a coffee" reads as "other". It ties with the reply rule; same as WO-045's F010;
- L129 "Re: lunch Thursday?" from a full-name colleague at a company domain reads as a recruiter reply (the known WO-024
  hole);
- three calendar interview notices that name no job (L135, L136, L143) stay "other" by design (section 2.2).

**blind200:** B148, a recruiter writing from a personal Gmail address. Only a rejection is read from one, on purpose.

**Pre-existing, unchanged:**
- dev4: V078, V103 (now reaches the scorer but stays "other"), V181, V196, V198, V219, V259;
- dev5: F010, F143, F242;
- blind160: S017 (no job in the event).

**Structural:**
- the language marks are distinctive common words. Very short messages (four or five words) are read in English only;
  six such dev6 messages, five of them "other";
- Hinglish (blind200 B037/B081/B146) is not a language here. B037 now reads through "interview call" and "face to face
  interview";
- names, roles and dates in the six languages are not parsed (`roleOf` is English).

## 7. Known precision holes (pre-existing, unchanged)

- A full-name colleague's "Re: lunch" at a company domain reads as a recruiter reply.
- A friend's "Congrats on your offer" from a company domain reads as an offer. `fromEmployer` limits the damage.
- A scholarship rejection reads as a rejection. It moves nothing unless it matches an application.

New in this order: the employer named from a calendar event's title is a heuristic. It is used only as evidence and never
moves anything.

## 8. Gate and suites (VERIFIED on this branch)

- `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`: 449 passed, 0 failed. That is 435 before
  this file, plus 13 at the classifier commit, plus E4.
- The gate's edge tests (the list in `scripts/gate.sh`): 129 passed, 0 failed.
- `python3 scripts/build-router-core.py --career-only --check`: router bundle verified (no bundled file changed).

## 9. Demo (owner)

- `deno run --allow-read evals/career/mail-eval.ts --only dev6` prints dev6 by kind and every miss.
- `deno run --allow-read evals/career/mail-eval.ts --only blind200` prints blind200: one miss (B148) and four employer-name
  misses.
- `deno test -A --no-check tests/architect/wo-046-mail-languages.test.ts` runs the floors, the languages, and the calendar
  and forward guards.

## 10. Honesty log

- **blind200 and blind160 were read in full and tuned on.** The order allowed this; both are spent. blind200's misses
  shaped:
  - the language lists;
  - the calendar and forward readers;
  - the English fixes in 2.4;
  - five aliases (pg, fmr, chop, ssa, dhs).

  blind200's after score (100.0 / 99.4) is a tuned number. No weight is fitted on either set.
- **dev6 echoes blind200.** It was written after reading blind200's misses, by the builder who then changed the rules.
  dev6check is the only number on mail not read while changing rules, and it is from the same author and batch. Expect
  unseen real mail to score lower.
- **dev6check was scored once.** That was after commit c96da00d, in one run that printed both 9c78ee15's and c96da00d's
  numbers. Its misses were then read for section 6, and nothing in the classifier changed after. The planted-defect runs
  executed WO-046/E4 (the dev6check floor). D8, D9 and D12 failed it. That is pass/fail information about dev6check after
  its score, used for nothing else.
- **Held-out splits.** devcheck, holdout, blind40, dev4check and dev5check were never printed or scored item by item.
  `mail-eval.ts` was run only with `--only` naming dev, dev4, dev5, blind160, blind200 and dev6. The required suites run
  WO-040/E2 (floors on devcheck, holdout and blind40), WO-043/E3 (dev4check) and WO-045/E4 (dev5check). They passed on
  every suite run. During the planted-defect runs, some of those tests may have failed alongside the named ones. Their
  messages were not read for which split failed.
- **Never read:** anything under `/tmp` or any path containing "sealed". Throwaway scripts lived in an untracked folder
  inside the worktree and are not committed: the debug printers, the before/after table, the dev6check one-time score and
  the defect runner. The dev6 rows were hand-written in a delimited text file and converted to JSON by a script (ids,
  dates and the seed split). Neither is committed.
- **The calendar job requirement keeps three existing tests passing** (section 2.2). I chose it knowing that. It is a
  principle (evidence must name the application), but the architect may prefer to drop it and edit WO-045/S5, WO-045/B1
  and WO-040/R4.
- **Labels I would now question in dev6:**
  - L010 (a founder's "got your application ... I'll go through it", labeled received);
  - L044 (an assessment centre, labeled interview);
  - L153 (a colleague's Teams "Interview panel debrief", labeled other: the person is the interviewer).

  All left as committed. dev4's V299 label follows the old calendar rule; left as committed.
- **Tried and kept narrow:** a bare "debrief" as noise broke a real recruiter reply (dev4 V163), so it was narrowed to "...
  for the candidate/hire". New onboarding noise was added after a refit made dev4 V261 (onboarding tasks) read as a test.
- Real inboxes: **NOT_RUN**. No real mail was read. Nothing calls a model.

## 11. Files

- `supabase/functions/_shared/career_mail_langs.ts` (new: the six languages as data);
- `supabase/functions/_shared/career_mail.ts`, which now contains:
  - the language reader's wiring;
  - the calendar and forward readers;
  - `Classified.via` and `forwarded_from`;
  - `plan.evidence`;
  - the `fromEmployer` guard;
  - the English fixes;
  - the refit weights;
- `evals/career/mail-dev6.json` (data);
- `evals/career/mail-eval.ts` (dev6 splits, dev6check sealed);
- `tests/architect/wo-046-mail-languages.test.ts`;
- this document.
