# Tonight's live test plan (2026-10-20)

This plan tests every target in the owner's "Feature depth targets v2" that can be tested live tonight. Each test gives:
- the exact text to send;
- what must come back;
- what to record;
- the pass bar.

Nothing in it is a pass until it is run on the live project and recorded.

| Label | Meaning |
|---|---|
| VERIFIED | Seen live tonight, with a transcript or screenshot. |
| NOT_RUN | Not tried. |
| BLOCKED | Tried, but a precondition was missing; that is not a fail. |
| FAIL | Tried, and the result was wrong. |

**Who does what**
- **Owner (Vishnu):** deploys, sets secrets and approves real submissions. No agent does any of these.
- **Muse:** texts, observes and records.
- **The architect:** turns every FAIL into a test and a fix.

## 0. Before anything (owner, on your own machine)

**Sign-ups (D-018, up to $300/month):**
- Apollo: lists, exported as CSV.
- Hunter: email verification, `HUNTER_API_KEY`.
- People Data Labs Pro: hired-candidate aggregates, `PDL_API_KEY`.

**Accounts (D-019):**
- Meta business verification for WhatsApp. It can take days, so start it first.
- A Telegram bot from @BotFather.

Enter every key only at the go-live prompt, never in chat.

1. **Pull trunk.** Use the commit the architect names as tonight's (every PR below that says "merged").
2. **Run go-live:**
   ```
   bash scripts/launch/trainee-go-live.sh --dry-run
   bash scripts/launch/trainee-go-live.sh --brain agent
   ```
   - It applies every Trainee migration in order, sets secrets, deploys the five functions and schedules the three runs. Then it runs the smoke checks. `docs/launch/TRAINEE-GO-LIVE.md` explains each step and the rollback.
   - Give it:
     - `OPENAI_API_KEY` (OpenAI only);
     - `LOOPMESSAGE_API_KEY`;
     - `INGEST_CONTACT_EMAIL`;
     - `TRAINEE_ALLOWED_CONTACTS`: your number and Muse's test numbers, comma-separated. Sign-up is closed to everyone else.
   - `--brain agent` turns on the model brain. Most of tonight's features exist only there.
3. **Set the webhook.** Paste the LoopMessage webhook URL the script prints into LoopMessage's dashboard.
4. **Mail tracking (optional tonight):**
   - turn it on with `CAREER_MAIL_TRACKING=on`;
   - it needs the career Google sign-in for the test account (read-only Gmail).
   - Without it, section 6 is BLOCKED, not failed.
5. **Smoke must pass.** The script's last step prints PASS, WARN or FAIL for each function. A FAIL stops tonight's tests until it is fixed.

## 1. Chat basics and channel rules (iMessage)

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 1.1 | `hi` from an allowed number | A reply within 60 s. An account is created; no web sign-up is needed. | Reply received; time recorded |
| 1.2 | `hi` from a number not on the list | The sign-up-closed reply. No account is created. | Exactly that reply |
| 1.3 | `HELP` | The fixed help text | Exact text |
| 1.4 | `STOP`, then `what jobs did you find` | STOP confirmation, then an answer to the question (fixed by PR #50: answers keep coming after STOP) | Both arrive. No alert or report until START. |
| 1.5 | `START` | Back-on confirmation | Exact text |
| 1.6 | A 1,000-word message | An answer. Nothing crashes, and the text is never cut silently. | Answer received |

## 2. Discovery and alerts

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 2.1 | `find me investment banking analyst roles in New York` | Real postings, each with the employer's own link | Every link opens a live posting. Count dead links (target 0). |
| 2.2 | `text me when new ones come in` | Alerts restated (role, place, how often, quiet hours) | Restatement matches the ask |
| 2.3 | Wait | New-match alerts | Record each alert's "first seen" time against the time it arrived. **Target: under 15 minutes.** |
| 2.4 | Next morning | The daily report at the person's hour, with every listed posting and link (PR #50 fixed reports that delivered 2 of 10) | All links present |
| 2.5 | Alert precision | Muse labels each alert match or no-match for the stated search, on the sheet from WO-037 when it lands | **Target 90%+ over 200 labeled roles.** Tonight counts toward the 200. |
| 2.6 | Hidden market | For 20 random alerts, Muse searches LinkedIn and Indeed by hand the same day. No automation, ever. | Share not found there (target 20%+). Record each search. |

## 3. Applying (the person's own computer, approve-first)

The apply engine runs on the tester's own computer, signed in as themselves. It never runs on a server tonight.

- **Prepare:**
  ```
  deno run -A workers/career-browser/approve-first.ts prepare-batch urls.txt facts.json resume.pdf
  ```
  It needs `UPMORE_SUPABASE_URL`, `UPMORE_SUPABASE_ANON_KEY` and `UPMORE_APP_URL`. You sign in in a browser window; no password is typed into any chat.
- **Run** (after the yes): `deno run -A workers/career-browser/approve-first.ts run resume.pdf`.

| # | Step | Must happen | Pass bar |
|---|---|---|---|
| 3.1 | prepare-batch over 10 real Greenhouse, Lever and Ashby postings | The approval card arrives in the thread with every answer as the form shows it. Postings with open questions are listed. | Every card arrives whole (PR #50). **Fill rate: count answered vs required per posting.** |
| 3.2 | The questions Trainee asks by text | Each unknown is asked once; answers are checked against the form's own choices. | No question asked twice (ask again with `what do you need from me`) |
| 3.3 | `draft 2` on a written question | A full draft from confirmed facts only, never saved until `use 2` | No invented fact (check every claim against the facts file). Canonical-style "no AI" forms are never drafted. |
| 3.4 | Reply `yes` to a card | The run applies on the computer; a receipt text arrives per application. | Receipt per application |
| 3.5 | **Real submissions (the PR #16 gate)** | 3 hand-watched submissions per portal (Greenhouse, Lever, Ashby), on roles the tester genuinely wants, each confirmed by the employer's email | Record: screenshot, captured answers, employer email. **The cloud worker (WO-039) unlocks per portal only when these 3 confirmations are in the database.** |
| 3.6 | Extension (WO-031, when it lands) | Load `extension/` unpacked in Chrome. Run the queue over 20 postings, tapping approve on each. | Time per application (**target under 10 s**). Fields right vs fields filled. Zero wrong submissions. |

## 4. Resume

Merged (#49); needs `CAREER_BRAIN=agent`.

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 4.1 | `make my resume fit this one` with a posting | First, "What name and email should go at the top of your resume?" | Asked once |
| 4.2 | `Jordan Lee, jordan@example.com` (your real ones) | Saved. Then a private link alone on its line and a one-line changelog. | **Under 60 s**, timed. Open the PDF: every line is something you confirmed. |
| 4.3 | `save a banking version that leads with my finance internship` | The persona restated exactly | Restatement matches |
| 4.4 | `apply as my banking resume` | Switched; the next tailored resume uses it | Order matches the persona |

## 5. Interviews

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 5.1 | `mock interview for Goldman investment banking` | 6 role-specific questions, one at a time | Questions fit the role |
| 5.2 | Answer each | A debrief that quotes your own words, with a rubric score per answer | No quote you didn't say |
| 5.3 | `brief me for my interview at JPMorgan` | The company brief with sources and a 10-point plan | Every source link opens |
| 5.4 | Voice mock (#53; needs `CAREER_VOICE=on`; `start a voice mock for Goldman IB`) | The link opens a voice session. Debrief within 2 minutes of hang-up. | Time from your last word to its first audio (**target under 1 s**); debrief time |

## 6. Tracking

Merged (#46); needs `CAREER_MAIL_TRACKING=on` and the Google grant. With `CAREER_BRIEF_DIGEST=on` (#56), an interview invite in the mail is briefed in the same run, and the weekly digest arrives at the person's day and hour.

| # | Step | Must happen | Pass bar |
|---|---|---|---|
| 6.1 | An employer's "we received your application" email arrives | A status text within the run interval | Time from email to text (**target under 1 hour**) |
| 6.2 | `where do I stand with JPMorgan` | Tracker and mail status | Matches the inbox |
| 6.3 | A scam "job offer" email | **Never texted** | Nothing arrives |
| 6.4 | An interview invite email (with `CAREER_BRIEF_DIGEST=on`) | The brief: the invite's facts, sourced patterns, a 10-point plan | Time from email to brief (**target under 1 hour**); nothing in it the invite did not say |
| 6.5 | `weekly digest on Sunday at 6pm` | The setting restated; the digest arrives then | Built only from your own rows |

## 7. Memory

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 7.1 | `remember I never want roles in Texas`, then later `find me analyst roles` | No Texas roles | Holds after 40+ messages |
| 7.2 | `what did I apply to last week` | From the timeline, with dates | Matches what happened |
| 7.3 | `what do you remember about me` | Standing instructions and confirmed facts only | Nothing invented |
| 7.4 | `forget everything` | Erased, including tailored resumes, outreach drafts and (with #59) mail-tracking events and drafts | A later `what do you remember` returns nothing |

## 8. Connector

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 8.1 | `introduce me to someone at Goldman` | The honest cold-start answer: nothing is proposed until 500 people opt in, with the opt-in offered | Never a fake match |

## 9. WhatsApp and Telegram

Ready to test once #57 is merged and deployed, and the owner has set the channel inputs at go-live. A channel left empty
stays NOT_WIRED: its webhook answers 503 and nothing is lost.

**Owner, before testing (on your own machine):**
- Telegram: create the bot with @BotFather, then give go-live `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`. Enter
  generates the webhook secret.
- WhatsApp: Meta business verification (can take days), a permanent system-user token, the phone number id, the app
  secret, and the approved updates template (`docs/launch/whatsapp-templates.json`). Give them at the go-live prompts.

| # | Step | Must happen | Pass bar |
|---|---|---|---|
| 9.1 | Telegram: open `t.me/<bot>?start=<link>` from the link Trainee texts on iMessage ("link my Telegram") | Linked to the same account; no code typed | One account, both channels |
| 9.2 | Run sections 1, 2.1-2.2, 4.1, 5.1 and 7 on Telegram | The same words as iMessage, on Telegram | Compare each reply with iMessage's, side by side |
| 9.3 | `draft emails to the bankers on my list` (with a list imported) on Telegram | A 10-draft batch arrives as separate messages, each draft whole, in order | No draft cut; numbering intact |
| 9.4 | WhatsApp: message the business number first, then repeat 9.2 | The same words as iMessage | Side-by-side compare |
| 9.5 | WhatsApp: wait more than 24 hours with no message, then let an alert fire | A short template ("Trainee has N new updates for you. Reply to see them."); after your reply, the full alerts in order | Nothing lost, nothing out of order |
| 9.6 | `STOP` on Telegram | Alerts held on every channel; answers keep coming | Same as 1.4 |

WhatsApp's 24-hour rule is a platform rule, and it is the one place WhatsApp can't be identical.

## 10. Outreach (networking)

Merged (#55). Drafting works with no switch; sending needs `CAREER_OUTREACH_SEND=on` and the career Google sign-in with
Gmail send. Hunter checks need `HUNTER_API_KEY`; without it, only the free checks run and the labels say so. Use a list
you exported from your **own** account (D-018a): your LinkedIn connections export, or an Apollo CSV from your own
Apollo account.

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 10.1 | Send the CSV, then `how many of these can I email?` | Counts, with each check labelled exactly as it ran | No check claimed that did not run |
| 10.2 | `sign them <your name>`, then `draft emails to the bankers on my list` | Up to 10 drafts, each in full, numbered | Check every claim against your confirmed facts: **zero invented** |
| 10.3 | `send 1-3` (first send only to an address you own) | Exactly drafts 1-3 approved; sent by the scheduled run, 90 s apart | One recipient per email, no Cc or Bcc; the text sent is the text you approved |
| 10.4 | Reply "stop" from the recipient address | That address is on the do-not-contact list | No later draft to it, for any user |
| 10.5 | `which bankers did I email in October?` | From the timeline, with dates | Matches what was sent |

## 11. Career guidance

#58 when merged. Hired-candidate backgrounds need `PDL_API_KEY`; without it, Trainee says it has no data.

| # | Text | Must come back | Pass bar |
|---|---|---|---|
| 11.1 | `how do I get into Goldman investment banking` | Programs, timeline and requirements, each with a link and a checked date; 3 moves, each citing a requirement | Every link opens; a probability only with its cited base rate |
| 11.2 | `I got an offer: analyst at JPMorgan in New York, $110k base` | A benchmark with n and year for each number, and a negotiation script | No benchmark from n under 5; no invented competing offer |
| 11.3 | `who did Goldman hire last year` | With the PDL key: aggregates only (schools, prior employers, degrees), nothing under 5. Without it: says it has no data | Never a named person |

## Recording

- One row per test in `docs/testing/live-2026-10-20.md`: number, time, channel, result label, transcript or screenshot path, and notes.
- Send every FAIL's transcript to the architect, who turns it into a test that stays red until it is fixed.
