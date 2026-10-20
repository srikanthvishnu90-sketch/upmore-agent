# WO-050: English status mail the tracker missed

Owner target: 95%+ of application status changes read from the person's own mail, at 97%+ precision, on wording nobody
tuned on. On the architect's blind240 (now spent and committed) WO-046 scored **99.4% / 89.1%**; the six other languages
reached 95.7% recall but English only 86.9%. This order works on the English misses without weakening a safety rule.
Offline: no model, no network, no spend. Nothing here calls an API.

Labels: **VERIFIED** (measured here, command shown), **SYNTHETIC** (hand-written mail, not real), **NOT_RUN**,
**NOT KNOWN**. Every email in every set named here is SYNTHETIC.

## 1. Result in one paragraph

On the quarter of the new set held out (dev7check: 76 emails, 60 status), scored once after the classifier commit
d48735f4, the classifier went from **97.9% / 76.7% to 100.0% / 86.7%** (VERIFIED, SYNTHETIC). Precision clears 97%.
**Recall does not reach 95%.** English alone went from 76.5% to 84.3% recall (43/51); the twelve emails in the six
other languages went to 9/9. On the splits read for misses the classifier is at or above target: dev7 99.5% / 97.4%
(was 94.7% / 75.1%), blind240 99.5% / 98.4% (was 99.4% / 89.1%; English 86.2% → 97.9%). blind240 is a tuned number now,
not a blind one (section 8). No rejection was read as an interview on any split, before or after. **The target is not
shown on unseen wording:** dev7check is from the same author and batch as dev7, and real inboxes are NOT_RUN.

## 2. What changed

All in `supabase/functions/_shared/career_mail.ts` unless named. Weights refit with `mail-fit.ts --write` on the unchanged
tuning splits (tune, tune2, dev3, dev4; WO-043/W1 reproduces them); no per-language weight.

**Scheduling tools.** GoodTime, ModernLoop, Gem, Prelude and Paradox (`SCHEDULERS`) write for an employer. The employer
comes from the display name ("Gusto Recruiting via ModernLoop", "Olivia from Taco Bell") or from the event the tool books
("Interview confirmed: Instacart - Machine Learning Engineer, Ads"), never the tool. **Their mail is the employer's word
only when it names the employer and the job; otherwise it is "other"** ("Your Coinbase interviews are confirmed" names no
job). They never confirm anything as the employer's own mail (`NEVER_CONFIRMS` now holds every scheduling tool).

**Calendar notices (WO-046 rule kept).** A calendar or booking tool's notice (Google Calendar, Calendly, Cal.com, ...) is
still an interview only when it names an interview, the employer and the job, and it is still evidence only (`via:
"calendar"`, moves nothing). New: the job and the interview may be named in the notice's description ("Hiring manager
interview for the Senior Accountant role"); the employer may be the hiring-desk side of "Jordan <> Brex Recruiting", a
lone bracketed name ("Head of Growth (Monzo)"), or a name that spells the organizer's own mail domain ("Delivery Hero",
organizer @deliveryhero.com); a sentence ("Your booking has been confirmed") is never an employer. WO-045/S5, WO-045/B1
and WO-040/R4 are untouched and pass.

**Interview phrases.** An interview moved ("we need to shift your interview to 2:30", "push our chat with the hiring
manager to 3pm", "Change to your Power Day schedule"), booked ("we've booked your panel"), coming up ("a reminder about your
interview on Thursday"), its logistics ("details for your onsite: arrive by 9:30", "what to expect on your interview day");
an invitation to an assessment centre or day, a discovery centre, a superday or a hiring day (labeled interview, as
dev3/dev4 label Unilever's Discovery Centre); a hiring manager's or founder's terse ask ("free tomorrow or friday for 20
min?", "can you come by the store Wednesday to meet me?", "next up I'd like you to meet Raj", "want to grab 30 minutes with
our Head of Talent?"), counted only when the words refer to the application (`APP_REF`, which now also reads "your
take-home", "next up" and a subject that is a job title).

**Replies.** A person's reply that asks to meet is an invitation, and one that makes an offer is an offer, unless it also
says where the process stands (`rr:status`). A decision said outright in a reply ("we're going to pass", "we went with
someone else") is a rejection even when the reply's own weights lead; a negation or a bare "not selected" never is ("the
team has not selected anyone yet" decides nothing). A bare "Re:" from a full name is a recruiter's reply only about a job:
a job word, a job title in the subject, or `rr:status` ("Re: Q4 planning deck" from a colleague is "other").

**Agencies.** "Priya Shah | Hays" is a person at Hays. At a staffing agency (`AGENCIES`) the employer is the client the
words name ("Northrop Grumman extended you an offer", "I've sent your CV across to Diageo", "Offer from X"), else the
agency. Contract and assignment offers ("Cigna wants you for the contract", "you've been offered a temp-to-hire
assignment", "came back with an offer"), revised or updated offers, a pay rate as offer talk. A recruiter's screening
questions are replies ("open to relocating?", "notice period", "right to represent", "what shifts can you work?").

**Tests and assessments.** Shortlisted for an online test, a test window or link, a hiring challenge, a home task, a short
paid task or trial. One-way video stays an assessment. A live Karat interview stays an interview: the order says "Karat =
assessment", but WO-045/B1 pins blind160 S160 ("Schedule your Karat interview for Roblox") as an interview and may not be
edited, so Karat mail that names a test is an assessment and Karat's live interview is an interview.

**Rejections.** "decided not to take your application forward", "it's a no for now", "there are no next steps for your
candidacy", a requisition frozen or eliminated, "hiring freeze", "will no longer be filled". A call offered only to share
feedback is not an invitation ("happy to set up a call to share feedback"). "I'll pass them along" is a hand-off, not a
pass. A person's own "Feedback from Arup" is not a survey.

**Look-alikes and noise.** The person as interviewer ("added as an interviewer", "interviewer training", "shadow a System
Design interview", "the interview with the backend candidate", "leaning no hire"); "crypto" is a scam word only as payment
("Product Manager, Crypto" is a job).

**Employer matching.** `sameCompany` also accepts a startup's domain prefix or suffix ("getcruise" is Cruise,
"mybrightwheel" is Brightwheel, "glovoapp" is Glovo, "modernatx" is Moderna). `sameEmployer` and `fromEmployer` are
unchanged.

**Six languages (`career_mail_langs.ts`, data).** An interview moved or confirmed (es, pt, fr, de, it, nl), a deferred video
interview as an assessment (es, fr), a post that will not be filled (de), "wir/we willen je ... aanbieden" (nl).

## 3. dev7: the new set

- **301 SYNTHETIC emails** in `evals/career/mail-dev7.json`, written by hand by this builder. Commit **463f477a** holds
  only the JSON; **d614eef7** fixes one company label (Y237's employer is Atlassian, not the vendor Vervoe), also before any
  classifier change. The classifier commit is **d48735f4**.
- 256 English, 45 in es/pt/fr/de/it/nl (8/7/8/8/7/7). Kinds: interview 98, rejection 41, assessment 30, offer 30, recruiter
  reply 30, received 20, other 52.
- Each email names the `family` it was written for (sched, sched_norole, resched, terse, onsite, nextsteps, acentre,
  oneway, vendor, takehome, agency_offer, docusign, terse_offer, rej_iv, req_closed, agency_rej, rr, rr_agency, received,
  lookalike, and `_neg` look-alikes of several). Labels say what a message is: a scheduling or calendar notice of an
  interview that names no job is labeled interview.
- Split by FNV-1a of `id + "wo-050-seed-20261020"` mod 4: remainder 0 is **dev7check** (76 emails, 60 status), the rest
  **dev7** (225, 189 status). `dev7check` is in `SEALED`; `mail-eval.ts` prints it only when named.
- Written after reading WO-043, WO-045, WO-046 in full and blind240's misses, so it echoes them. Several items are
  reworded echoes of blind240 misses (agency offers and rejections, recruiter replies, terse offers, take-homes); I
  reworded the near-copies before committing, but the shapes are the same.

## 4. Numbers (all SYNTHETIC; VERIFIED)

"Before" is the branch point **454cb215** (origin/trunk). "After" is **4422211f** for every row except dev7check, which was
scored once at d48735f4 (section 8). P / R are precision and recall over the six status kinds.

| Split | Size (status) | Use | Before P / R | After P / R | Rej. → interview | Status → other status | Employer right |
|---|---|---|---|---|---|---|---|
| dev (tune+tune2+dev3) | 332 (257) | weights fitted; read | 100.0% (256/256) / 99.6% (256/257) | 100.0% (255/255) / 99.2% (255/257) | 0 → 0 | 0 → 0 | 256/256 → 255/255 |
| dev4 | 260 (199) | weights fitted; read | 99.0% (193/195) / 97.0% (193/199) | 99.0% (193/195) / 97.0% (193/199) | 0 → 0 | 0 → 0 | 190/193 → 190/193 |
| dev5 | 190 (152) | read | 99.3% (150/151) / 98.7% (150/152) | 100.0% (152/152) / 100.0% (152/152) | 0 → 0 | 0 → 0 | 147/150 → 149/152 |
| dev6 | 239 (188) | read | 98.9% (182/184) / 96.8% (182/188) | 99.5% (183/184) / 97.3% (183/188) | 0 → 0 | 1 → 1 | 168/182 → 169/183 |
| blind160 | 160 (120) | spent | 100.0% (119/119) / 99.2% (119/120) | 100.0% (119/119) / 99.2% (119/120) | 0 → 0 | 0 → 0 | 119/119 → 119/119 |
| blind200 | 200 (160) | spent | 100.0% (159/159) / 99.4% (159/160) | 100.0% (159/159) / 99.4% (159/160) | 0 → 0 | 0 → 0 | 155/159 → 155/159 |
| **blind240, all** | 240 (192) | **spent here: misses read** | 99.4% (171/172) / 89.1% (171/192) | **99.5% (189/190) / 98.4% (189/192)** | 0 → 0 | 1 → 1 | 151/171 → 174/189 |
| blind240, English (langOf) | 182 (145) | spent | 99.2% (125/126) / 86.2% (125/145) | 99.3% (142/143) / 97.9% (142/145) | 0 → 0 | 1 → 1 | 110/125 → 131/142 |
| blind240, six languages (langOf) | 58 (47) | spent | 100.0% (46/46) / 97.9% (46/47) | 100.0% (47/47) / 100.0% (47/47) | 0 → 0 | 0 → 0 | 41/46 → 43/47 |
| dev7, all | 225 (189) | read for misses | 94.7% (142/150) / 75.1% (142/189) | 99.5% (184/185) / 97.4% (184/189) | 0 → 0 | 4 → 0 | 134/142 → 178/184 |
| dev7, English | 192 (159) | read | 93.8% (121/129) / 76.1% (121/159) | 99.4% (154/155) / 96.9% (154/159) | 0 → 0 | 4 → 0 | 114/121 → 149/154 |
| dev7, six languages | 33 (30) | read | 100.0% (21/21) / 70.0% (21/30) | 100.0% (30/30) / 100.0% (30/30) | 0 → 0 | 0 → 0 | 20/21 → 29/30 |
| **dev7check, all** | **76 (60)** | **scored once, at d48735f4** | **97.9% (46/47) / 76.7% (46/60)** | **100.0% (52/52) / 86.7% (52/60)** | **0 → 0** | **1 → 0** | 38/46 → 48/52 |
| dev7check, English | 64 (51) | once | 97.5% (39/40) / 76.5% (39/51) | 100.0% (43/43) / 84.3% (43/51) | 0 → 0 | 1 → 0 | 31/39 → 39/43 |
| dev7check, six languages | 12 (9) | once | 100.0% (7/7) / 77.8% (7/9) | 100.0% (9/9) / 100.0% (9/9) | 0 → 0 | 0 → 0 | 7/7 → 9/9 |
| 4-fold CV (tune..dev4) | 456 status | weights from 3 folds score the 4th | 99.6% (443/445) / 97.1% (443/456) (WO-046) | 99.6% (445/447) / 97.6% (445/456) | 0 | | |
| blind40, devcheck, holdout, dev4check, dev5check, dev6check | | floors, not printed | pass/fail only | pass (WO-040/E2, WO-043/E3, WO-045/E4, WO-046/E4) | | | |

"English" in blind240 here is what `langOf` reads as English (182 emails); the architect's word-list split counted 183 and
86.9% before, so the rows are close but not identical.

dev7 by family (status emails found, before → after): scheduling tools 21/25 → 21/25, but not the same 21: Y005 (a
ModernLoop panel) is now found; Y025 (GoodTime, no job named) is now "other" by design; Y012 (Cal.com, "Interview with
Linear") was found before only by reading "Your booking has been confirmed" as the employer and is now missed; Y004 and
Y013 now name Instacart and Supabase instead of "ModernLoop" and "New booking"; reschedules 11/17 → 17/17; terse invitations 6/11 → 11/11; onsite logistics 5/7 → 7/7; next steps 11/11 → 11/11;
assessment centres 2/4 → 4/4; one-way video 6/6 → 6/6; vendors' tests 8/12 → 12/12; take-homes 4/4 → 4/4; agency offers
1/8 → 8/8; DocuSign 5/5 → 5/5; terse and revised offers 3/5 → 5/5; rejections mentioning interviews 14/16 → 16/16;
requisition closures 7/8 → 8/8; agency rejections 1/3 → 3/3; recruiter replies 16/18 → 18/18; agency replies 0/5 → 4/5;
receipts 12/13 → 13/13. In dev7, "other" mail read as a status went 4 → 1 (Y210, below) and a status read as another
status 4 → 0.

Recall on 60 dev7check status emails: 52/60 has a 95% interval of roughly 76-93%; it shows 95% is not reached there.

Commands (VERIFIED):
- `deno run --allow-read evals/career/mail-eval.ts --only dev,dev4,dev5,dev6,blind160,blind200,blind240,dev7`
- `deno run --allow-read evals/career/mail-fit.ts --cv`; refit `deno run --allow-read --allow-write evals/career/mail-fit.ts --write`
- before/after and the dev7check one-time score: throwaway scripts importing 454cb215's `career_mail.ts` and the
  branch's (not committed). Later checks of dev7check: test WO-050/E4 (pass/fail).

## 5. Tests: `tests/architect/wo-050-mail-english.test.ts` (15 tests)

| Tests | Covers |
|---|---|
| E1 | dev7's size, English-heavy with 40+ others, every family present, seed split, synthetic origin, ids disjoint, dev7check sealed, the fit's splits unchanged |
| E2 | dev7 at the target, no confusions |
| E3 | blind240 at WO-050's score (99.4 / 98.4); WO-046/E9 keeps the blind floor |
| E4 | dev7check floor at its one-time score (99.9 / 86.6, no confusions) |
| F1 | scheduling tools' confirmations that name employer and job: the employer, never the tool, and not `via` |
| F2 | reschedules, reminders, onsite logistics, next steps, assessment centres |
| F3 | terse asks from a hiring manager or founder, replies that invite; the same words about an offsite, a friend's coffee, interviewing a candidate stay "other" |
| F4 | one-way video, vendors' tests, home tasks, paid tasks; a live Karat interview stays an interview; a vendor's promo stays "other" |
| F5 | agency and contract offers with the client as employer, DocuSign envelopes, revised offers; a lease, an NDA, a phone deal, an agency's alert stay "other" |
| F6 | rejections mentioning interviews or next steps, requisition closures, an agency's relayed decision, a founder's "we're going to pass" |
| F7 | recruiter replies that decide nothing (agency, given-name and lower-case senders); a colleague's bare "Re:" stays "other" |
| G1 | a rejection is never an interview (feedback calls, cancelled interviews, agency relays, replies), also with interview weights inflated to 20; an update is never a rejection; a reply about where things stand stays a reply |
| G2 | a calendar notice without the interview, the employer AND the job stays "other" (WO-045/S5, WO-040/R4 texts included); with all three it is `via: "calendar"` and moves nothing; the organizer's domain names the employer |
| G3 | a scheduling tool's mail is the employer's word only when it names employer and job; the person as interviewer stays "other"; with both it moves the stage; no scheduling tool ever confirms (fromEmployer); none starts an application |
| W1 | a scheduling tool reads as the employer's ATS-like sender; an agency never confirms as the employer |

**Planted defects.** Each a one-line change to `career_mail.ts`, planted one at a time and reverted; the runner executed the
WO-050, -046, -045, -043, -040 and -024 mail tests (all passing at baseline). VERIFIED with a throwaway runner, not committed.

| # | Defect | Caught by |
|---|---|---|
| D1 | the scheduling-tool guard removed | G3 |
| D2 | a calendar interview needs no job named | G2, WO-046/C1, WO-045/B1, WO-045/S5, WO-040/R4 |
| D3 | any negation is an outright decision in a reply | G1 |
| D4 | a reply that invites is no longer an invitation | F3 |
| D5 | a feedback call is an invitation again | F6 |
| D6 | an agency names no client | F5, F7 |
| D7 | "Name \| Agency" is not a person | E2, E3, E4, F6, F7 |
| D8 | a colleague's bare "Re:" is a recruiter reply again | F3, F7 |
| D9 | "pass them along" is a pass | E3, F7, WO-046/E9, WO-040/E2 |
| D10 | an employer's reminder is no longer an interview phrase | F2 |
| D11 | scheduling tools can confirm as the employer | G3 |
| D12 | the organizer's domain no longer names the employer | G2 |
| D13 | "not selected anyone" decides again | G1 |

The first run caught every defect but two: D4 (F3's cases were interviews by their weights alone) and a staffing-
"assignment" carve-out in `as:noun`. F3 gained two cases that need the rule. The carve-out changed no result anywhere, so it
was removed (4422211f; the refit gave the same table). D10 replaced it and was not caught until F2 gained two reminder
cases.

## 6. What is still missed

**dev7check (read after the one-time score; NOT fixed):**
- Y028 Cal.com "Confirmed: Lattice interview" names no job: "other" by design.
- Y037 a manager's "my 2pm blew up - can we do the portfolio walkthrough Friday instead?": no interview word, no
  application named.
- Y046 "Would you have an hour next Tuesday to meet a few people on the GTM team?": no reference to the application.
- Y060 "Superday logistics - 200 West Street ... arrive by 8:00 AM for your Superday" and Y064 "Your on-site at 250 Vesey
  Street ... three technical interviews": logistics without "details for your" wording.
- Y082 "Your Assessment Day ... you're invited to an Assessment Day": "invited to" in the passive.
- Y103 a startup's "short paid trial instead of whiteboards ... can you send it by wed?".
- Y121 a founder's "we want you!! comp: $130k + 1% equity for the founding engineer role".
- Employer names: Coderbyte for Zendesk (Y095), none for Mastercard via SHL (Y099), toasttab (Y161), none for "Ashby"
  writing about itself (Y248).

**dev7 (read):** Y012 Cal.com "Interview with Linear - Product Engineer" (a one-word "with X" reads as a person); Y025,
Y026, Y027 scheduling notices that name no job ("other" by design); Y250 an agency desk's "right to represent" (only a
person writes a reply); Y210 a colleague's "Re: Design crit ... the team is out Wednesday" reads as a recruiter reply
(`rr:status` "team is out"); employer names Kaiser via Aya, Mott MacDonald via Hays (two capitalised words read as a
person), rtx, mgb, gene, Magalu.

**blind240 (read):** C053 a referral reply read as a receipt (debatable label, unchanged); C056 a Spanish calendar notice
with no job ("other" by design); C233 Calendly with no job ("other" by design).

**By design (the guard the order asks for):** W048 (dev3, "Please select your interview times for Stripe" from GoodTime)
was an interview at the branch point and is "other" now: it names no job. dev's recall moves 99.6% → 99.2%.

**Other shapes probed by hand and not read:** an agency's "Assignment confirmed: Amazon ... your temp assignment starts
Monday" and "Apple selected you for the 9-month contract assignment" stay "other".

## 7. Known precision holes

- A colleague's reply with a status-like phrase ("the team is out", "can you send ...") at a company domain still reads as a
  recruiter reply (Y210). The bare "Re: lunch" case is closed unless such a phrase appears.
- Pre-existing and unchanged: a friend's "Congrats on your offer" from a company domain reads as an offer (`fromEmployer`
  limits it); a scholarship rejection reads as a rejection.
- New and bounded: an agency's client is read from the words; a wrong client only fails to match an application (it moves
  nothing). `sameCompany`'s prefix/suffix rule is matching only; `fromEmployer` is unchanged.

## 8. Honesty log

- **Read:** WO-043, WO-045, WO-046, AGENTS.md, CLAUDE.md; the classifier, the language data, the eval and fit scripts and the
  mail tests; dev, dev4, dev5, dev6 (read splits), blind160, blind200 and **blind240 in full for its misses** (the order
  allows it; it is spent). blind240's 98.4% is a tuned number.
- **dev7check was scored once**, at d48735f4, in one run that printed 454cb215's and d48735f4's numbers; its misses were
  then read for section 6. **The classifier changed after that score** (96fb8346 and 4422211f): six guards found while
  writing the tests by hand (an update is never a rejection, a step waiting on news is not an invitation, an offer in a
  reply counts the reply's evidence, "Offer from X" at a subject's start, "waiting on the panel's feedback"), the removal
  of a no-effect rule, and nothing taken from a dev7check item. dev7check was not re-scored or printed after; WO-050/E4
  (its floor) passed on every later suite run. The defect runs executed E4 too (D7 failed it): pass/fail only.
- **Held-out splits:** blind40, devcheck, holdout, dev4check, dev5check and dev6check were never printed or scored item by
  item; `mail-eval.ts` was run only with `--only` naming readable splits. Their floor tests ran in the suites (pass/fail
  only) and passed on every run. **Two disclosures:** early in this work a grep over every `evals/career/*.json` for
  scheduling-tool senders printed one line (id, label, sender, subject) of blind40 item B18 ("Adobe via GoodTime ... Adobe -
  Experience Designer: portfolio review") and one of dev6check item L141 ("Nuevo evento: Entrevista – Globant –
  Desarrollador Python"), and a later look at dev6's JSON layout showed the id, date, split and sender of dev6check item
  L101 (American Express) and the sender of L102 (Upstart). No rule was written from them; every later scan read only the
  readable splits.
- **Never read:** anything under `/tmp` (including the scratchpad) or any path with "sealed" in it. Throwaway scripts (the
  dev7 source text and builder, the before/after and one-time scorers, the probes, the defect runner) lived in an
  untracked folder inside the worktree and are not committed. The gate ran with its temporary files in that folder.
- **dev7 echoes blind240** (section 3). dev7check is from the same author and batch as dev7: expect unseen mail to score
  lower than its 86.7%.
- **"Karat = assessment"** could not be applied to Karat's live interviews without editing WO-045/B1 (section 2).
- Real inboxes: **NOT_RUN**. No real mail was read. Nothing calls a model.

## 9. Gate and suites (VERIFIED on this branch)

- `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`: 513 passed, 0 failed (498 before this file).
- The gate's edge tests (the list in `scripts/gate.sh`): 129 passed, 0 failed.
- `python3 scripts/build-router-core.py --career-only --check`: router bundle verified (no bundled file changed).
- `bash scripts/gate.sh`: **does not complete here**: its browser step fails (Chromium refuses to start as root without a
  sandbox) and the script stops after that step. The career typecheck step cannot fetch deno.land through this
  environment's proxy (NOT_RUN); `deno check` on the mail files passes. The node career tests were not run (no bundled file
  changed).

## 10. Demo (owner)

- `deno run --allow-read evals/career/mail-eval.ts --only dev7` prints dev7 by kind and every miss.
- `deno run --allow-read evals/career/mail-eval.ts --only blind240` prints blind240: three misses and the employer names.
- `deno test -A --no-check tests/architect/wo-050-mail-english.test.ts` runs the floors, the families and the guards.

## 11. Files

- `supabase/functions/_shared/career_mail.ts`: scheduling tools, agencies, calendar reading, phrases, reply decisions,
  guards, refit weights;
- `supabase/functions/_shared/career_mail_langs.ts` (data);
- `evals/career/mail-dev7.json` (data);
- `evals/career/mail-eval.ts` (dev7 splits, dev7check sealed);
- `tests/architect/wo-050-mail-english.test.ts`;
- this document.

## Architect review: blind300 (2026-10-20)
300 SYNTHETIC emails written by a separate agent that never read the classifier, labels or eval files, asked to make English
mail hard and realistic (scheduling-tool confirmations, rejections that mention interviews, assessments that look like
interviews, look-alike "other" mail); 60 in six other languages by the writer's count. Sealed (sha256 bcdf74b9...; labels
moved under `expect` mechanically, unread), scored once.

| | trunk affdb123 | WO-050 b94ba00e |
|---|---|---|
| all, status precision / recall | 95.6% / 81.7% | 95.7% / 83.3% |
| English (245, word-list split) | 94.7% / 82.5% | 94.7% / 83.5% |
| others (55 detected of 60) | 100% / 78.3% | 100% / 82.6% |
| rejection read as interview | 0 | 0 |
| status read as another status | 8 | 8 |

The honest reading: on the builder's own dev7check this round reached 100% / 86.7%; on independent, harder mail it adds
1.6 points of recall and holds precision. Both targets (97% / 95%) are missed on blind300, precision too. A rule-and-weight
classifier fits the voice of whoever wrote its training mail. The next lever is not more rules; see WO-051.
