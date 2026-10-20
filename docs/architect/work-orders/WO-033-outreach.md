# WO-033: outreach

Branch `wo/033-outreach`. Migration `20261021010000_career_outreach.sql`.

Owner targets (verbatim):

1. "500 bulge bracket investment bankers-class lists: built with verified emails in under 24 hours, 85%+ deliverable
   addresses, under $50 data cost per list."
2. "Outreach drafts personalized per recipient from real facts, approved in batches of 10 with one reply; 10 approved
   drafts per 2 minutes of user time."
3. "Sends capped at 20-30/day from the user's warmed Gmail so deliverability survives; no blast mode, ever."
4. "Referral map for the user's top-20 target companies in week one: school, past internships, LinkedIn connections."
5. "Which bankers did I email in October?" must be answerable.

Owner decision, 2026-10-20:

- A data budget of up to $300 a month.
- Apollo is the list source (CSV exported from its UI, no API).
- Hunter is the independent verifier.
- Prices and terms are in `docs/career/contact-vendors.md`.

## What was built

### 1. Contact lists (`supabase/functions/_shared/career_contacts.ts`)

**Sources.** Every source sits behind the `ContactSource` seam.

- `csvSource` reads a CSV by header name: the person's LinkedIn connections export (its "Notes:" preamble is skipped),
  an Apollo export (detected from its header), or any list with a name column and a company or email column.
- Rows are deduplicated: the same address, or the same name at the same firm.
- Firm names are normalized: "Goldman Sachs & Co. LLC", "GS" and "Goldman" are one firm.
- Every row keeps its source (file and row number).
- Every URL column, LinkedIn profile URLs included, is dropped.
- `vendorSource()` answers NOT_WIRED with one line: build the list in Apollo, export, send the CSV.

**Free first pass.** It runs on every imported address:

- **Syntax:** one plain address; a list in one cell fails.
- **MX:** through DNS-over-HTTPS behind the `MxResolver` seam; `MX_NOT_WIRED` offline.
- **Role inbox** (careers@, info@ and their kin).
- **Throwaway domain.**

**Paid check.** `hunterVerifier` calls Hunter's Email Verifier:

- `HUNTER_API_KEY` is required; without it the check is NOT_WIRED.
- It runs only on addresses that passed the free pass.
- At most 4 calls a second; a 429 is retried once after `retry-after`.
- Results are cached per address per month in `career_email_checks`, keyed by month and a SHA-256 of the address.
  The table names nobody.
- Hunter's six statuses are kept as they are. Only `valid` counts as deliverable. `accept_all` and `webmail` are
  reported apart.

**Labels.** An address is "verified" only when it passed every check that ran on it. `listReport` names:

- exactly the checks that ran, and on how many addresses ("mail server (MX) on 2 of 4");
- what was not checked;
- Hunter's counts and the share of Hunter-checked addresses that are `valid`, against the 85% target;
- Apollo's own "Email Status", kept as the vendor's claim and never counted as a check.

Trainee never probes a mailbox over SMTP itself, and says so.

**Cost.**

- The person's own exports cost $0.
- An Apollo list costs what the owner types (`record_list_cost`): plan price x rows / exports in the period.
- That cost is VERIFIED only with an invoice number the person typed; otherwise ASSUMED.
- The under-$50 check is computed from it.

### 2. Drafts in chat (`career_outreach.ts`, tool `draft_outreach`)

**Writing.** The model writes one email per person, from three things only:

- the person's confirmed facts (never a draft fact);
- the recipient's row (name, firm, title, school);
- what is on both sides (`sharedFacts`: the same school or the same firm, each naming the fact and the row field).

**The fact-lock** (`outreachLock`) checks every draft:

- every capitalized name, number and month traces to a source;
- WO-030's `factLock` (`essay_draft.ts`, now on trunk) runs on top, so titles, degrees, tools and scale words trace too.
  "A junior" is caught when the facts say "Class of 2027";
- "I ... studied/worked/interned at X": X must be in the person's facts;
- "you ... at X": X must be on the recipient's row;
- any clause that claims something shared ("fellow", "we both", "like you", "same school") may name only what is on
  both sides.

A draft that fails is written again once, with the failures named. If it still fails, it is not shown, and the reply
names who was left out.

**Which rows get a draft.** Only verified addresses. Never anyone already contacted, never anyone on the do-not-contact
list. At most 10 a batch.

**The person's signature.** It is set once in their own words (`set_outreach_signature`) and added by code, with one
opt-out line: "If you'd rather not hear from me, reply stop and I won't write again."

**Showing the batch.** Code renders it (`batchMessages`): each draft in full and numbered, with its source row and
what is in common, split on purpose into messages of at most 1,500 characters. A tool sets `turn.show` (`loop.ts`), so
the reply is code's text and the thread's intent becomes `career_outreach_batch`.

**Answering the batch.** The reply is code's (`outreachTurn`, before the brain), and only while the batch is the
thread's last word:

| Reply | What it does |
|---|---|
| "send all", "send 1-7,9", "send all except 3" | Approves exactly those. |
| "redo 3" | A new version, through the same fact-lock. |
| "skip 4" | Drops one. |
| "edit 3: my words" | The person's own text. |
| "send none" | Approves nothing. |

**Adversarial replies** approve nothing and say why: "send 1-100", "send all except" with nothing after it, a backwards
range, "send 0", "send 1-7; drop table".

**Binding.** Each approval is the SHA-256 of the exact message: recipient, subject, and the full text with the footer.
A redo or an edit makes a new message, and the approval is gone. The send recomputes the hash, and the database claim
checks it again.

### 3. The send path (`career_outreach_gmail.ts`, `runOutreachSends`, `career_outreach_claim`)

**The token.** Gmail `users.messages.send`, with the career Google grant's token through WO-024's reader, now
scope-aware (`careerTokenFor(d, scope)` in `career_mail_gmail.ts`; `careerToken` is unchanged). No grant, or no
`gmail.send` scope: NOT_WIRED, and the approval waits.

**The message.** `buildRaw` writes To, Subject and the MIME headers only:

- one plain address;
- no Cc or Bcc, ever;
- a line break in a header is refused, never cleaned.

**Caps,** in TS (`capFor`, `admitSend`) and again in SQL (`career_outreach_claim`, under the person's advisory lock):

- 20 a day by default; the person may set 1 to 30 (`set_outreach_limit`, and only when they say the number). 31 is
  never stored and never admitted.
- 10 a day for the first 7 days from the first send Trainee recorded.
- At least 90 seconds since the last send.
- The scheduled run (career-proactive, every 5 minutes) sends at most one message per person per run. Sending is
  spread out, never a burst.

**Off until the owner turns it on.** It runs only when the owner sets `CAREER_OUTREACH_SEND=on`, like WO-024's
`CAREER_MAIL_TRACKING`.

**Replies** (`runOutreachReplies`) read the threads Trainee started (`gmail.readonly`, metadata only):

- **A bounce** (mailer-daemon, "Delivery Status Notification") marks the draft bounced.
- **"stop" or "unsubscribe" from the recipient themselves** adds the address to `career_outreach_dnc`, forever. It is
  kept as a hash, survives an erase, and goes only with the account. Someone else's "stop" does nothing.
- **Anything else** is a reply.

### 4. Events

Every draft that is drafted, approved, sent, replied to or bounced is written to the WO-027 timeline. The three new
kinds are `outreach_approved`, `outreach_replied` and `outreach_bounced`, added to `EVENT_KINDS`, to the table's check,
and to `career_recall_own`'s kind list.

- **Subject:** "Name, Firm".
- **Detail:** name, company, title, a role word read from the row ("Banker" for a banking title or an analyst at a
  bank), batch, number, the address's domain only, and the subject.
- **Recall:** the tool's description now names outreach and "bankers". `matchesSubject("bankers")` finds "Banker" in
  the detail.
- **Tested end to end** (WO-033/E1): import an Apollo CSV, draft, "send all", the scheduled run, then
  `recall({kinds:["outreach_sent"], subject:"bankers", when:"in October"})`. It returns the two October sends and not
  the September one.

### 5. The referral map (`career_referrals.ts`, tool `referral_map`)

**Targets.** Up to 20 firms:

- firms the person named in this message;
- then their stated target firm;
- then alert words that are a known firm name.

**Paths.** Built only from their own exports and confirmed facts, through module 135 (`findPaths`, `rankWarmth`):

- a 1st-degree connection at the firm (connections export);
- people on any list who went to the person's school (only a school a confirmed fact names);
- the person's own confirmed internship or job there, citing the fact id.

**Sources.** Every path names its source row ("Connections.csv, row 14"). The older 122 import (`profile.connections`)
is read too, cited as "LinkedIn connections (imported earlier), row n".

**No export.** The reply is the one-line ask: "Export your LinkedIn connections (Settings, Data privacy, Get a copy of
your data) and send me the file."

**Getting the file in.** A CSV attached to a turn is imported and checked by code before the model runs
(`agentTurn` `attachments`, `importContactsFile`). A 2,000-row export never goes through the model.

## Files

**New**

- `supabase/functions/_shared/career_contacts.ts`
- `supabase/functions/_shared/career_outreach.ts`
- `supabase/functions/_shared/career_outreach_gmail.ts`
- `supabase/functions/_shared/career_referrals.ts`
- `supabase/migrations/20261021010000_career_outreach.sql`
- `tests/architect/wo-033-outreach.test.ts`
- `tests/db/career_outreach.test.sql`
- `tests/fixtures/wo-033/apollo-export.csv`
- `tests/fixtures/wo-033/linkedin-connections.csv`
- `docs/career/contact-vendors.md`
- this file

**Changed**

| File | Change |
|---|---|
| `_shared/agent/career_tools.ts` | 7 tools: `contact_list`, `verify_contacts`, `record_list_cost`, `draft_outreach`, `set_outreach_signature`, `set_outreach_limit`, `referral_map`; recall's description |
| `_shared/agent/loop.ts` | `turn.show` |
| `_shared/agent/timeline.ts` | 3 kinds |
| `_shared/career_mail_gmail.ts` | `careerTokenFor` |
| `agent-chat/career_brain.ts` | attachments, outreach, verifier |
| `agent-chat/handler-career.ts` | `outreachTurn` before the brain; outreach deps, Hunter; the shown intent |
| `career-proactive/handler.ts` and `index.ts` | The outreach run behind `CAREER_OUTREACH_SEND` |
| `scripts/text.ts` | Simulator: CSV import, outreach in memory, a simulated Gmail that only prints |
| `tests/architect/wo-002-career-tools.test.ts` | The pinned tool list |
| `tests/db/run.sh` | Wiring for the new migration and DB test |
| `scripts/launch/trainee-go-live.sh` and `docs/launch/TRAINEE-GO-LIVE.md` | The migration and its mark |
| `tests/fixtures/export-tables.json` and `src/upmore-app-template.html` (then `build-app`) | `career_outreach_drafts` is exported; the do-not-contact list, settings and Hunter's cache are the service's only |

## Tests

**`tests/architect/wo-033-outreach.test.ts`: 18 tests.**

- **C1, C2:** Apollo and LinkedIn mapping; no URL kept.
- **C3:** labels never claim an unchecked check.
- **C4:** Hunter: NOT_WIRED, statuses, accept_all apart, 85% over Hunter-checked only, cache, 429.
- **C5:** the vendor is NOT_WIRED; cost is VERIFIED only with an invoice.
- **F1, F2:** the fact-lock catches an invented shared school, a misattributed school or firm, an invented number,
  firm or month, and "junior" or "Python". A draft that stays invented is not shown.
- **P1:** "send 1-7,9" and the adversarial replies.
- **P2:** the turn approves exactly the drafts named; out of range approves nothing; a stale intent is not an answer.
- **P3:** the batch is shown in full, at most 1,500 characters a message, no markdown.
- **S1:** no send without approval; an edit needs re-approval; a tampered message is refused.
- **S2:** warm-up 10, the 21st of a day refused, the person's 30, 31 never, 90 seconds, one per run.
- **S3:** one recipient, no Bcc, no header injection; NOT_WIRED without `gmail.send`.
- **O1:** stop and unsubscribe go on the do-not-contact list forever; a bounce is recorded; someone else's "stop" does
  nothing.
- **E1:** "which bankers did I email in October", end to end.
- **R1:** the referral map cites rows and asks for the export when there is none.
- **R2:** 2,000 connections, measured.
- **L1:** no LinkedIn URL is fetched (grep of the new sources, plus a fetch spy during import and mapping).

**`tests/db/career_outreach.test.sql`: 37 checks.**

- One address per draft; a line break in the subject is refused; at most 10 a batch.
- An approval must equal the message's hash; 31 is never stored.
- The new kinds are in the table's check and in recall.
- Owner-only reads; nobody but the service writes or claims.
- The claim: 90 seconds, warm-up 10, 20, the person's 30 and then the 31st refused, changed, not approved,
  do-not-contact, a bad day start, another person's draft.
- Hunter's cache: keys and statuses.
- The erase deletes drafts and settings and keeps the do-not-contact hashes.
- Deleting the account removes everything.

## Planted defects

Each is a one-line change. Each made the named tests fail and was reverted; after the revert, 18 passed, 0 failed.

| Defect | File | Failing tests |
|---|---|---|
| D1 warm-up cap ignored | career_outreach.ts | WO-033/S2 |
| D2 31 a day allowed | career_outreach.ts | WO-033/S2 |
| D3 the send trusts the stored hash, not the message | career_outreach.ts | WO-033/S1 |
| D4 an edit keeps the old approval | career_outreach.ts | WO-033/S1 |
| D5 an invented shared school passes the lock | career_outreach.ts | WO-033/F1, WO-033/F2 |
| D6 "send 1-100" accepted | career_outreach.ts | WO-033/P1 |
| D7 "stop" does not add do-not-contact | career_outreach.ts | WO-033/O1 |
| D8 accept_all counted deliverable | career_contacts.ts | WO-033/C4 |
| D9 the label claims MX that never ran | career_contacts.ts | WO-033/C3 |
| D10 the banker role is not recorded on events | career_outreach.ts | WO-033/E1 |
| D11 Hunter cache ignored (paid twice) | career_contacts.ts | WO-033/C4 |
| D12 a profile URL kept on import | career_contacts.ts | WO-033/C1, WO-033/C2, WO-033/L1 |

## Measured

| Number | Value | Label |
|---|---|---|
| Referral map, 2,000-connection export, 20 firms (import and map) | 115 to 135 ms over several runs | VERIFIED: `deno test -A --no-check tests/architect/wo-033-outreach.test.ts` prints it (WO-033/R2) |
| Daily caps (10, 20, 30, never 31), 90 s spacing, one per run | Enforced | VERIFIED in tests (WO-033/S2 and the DB test) |
| Deliverable share of a real 500-banker list (85% target) | Not measured | NOT_RUN: no real list, no Hunter key |
| Cost of one 500-banker list | Up to $41.75 (Apollo Basic share $29.50 + Hunter up to $12.25) | ASSUMED: third-party prices, `docs/career/contact-vendors.md` |
| List built in under 24 hours | Not measured; with a CSV in hand, import and the free pass take seconds; Hunter at 4 a second is about 2 minutes for 500 | NOT_RUN |
| 10 approved drafts per 2 minutes of user time | Not measured: needs the real model's latency and a person reading 10 drafts. The approval itself is one reply. | NOT_RUN |

## Demo (the owner can run it)

**Offline, no model, nothing sent:** `deno test -A --no-check tests/architect/wo-033-outreach.test.ts`. E1 is the whole
path, from import to the October recall.

**With the real model**, in the simulator (OpenAI key, `gpt-5-mini`). Mail is simulated and only printed:

```
deno run -A scripts/text.ts --brain agent --fresh --at 2026-10-14T15:00:00Z
/attach tests/fixtures/wo-033/apollo-export.csv
here's my banker list
(tell it your school and internship and confirm them; then:)
sign my emails Sam Student
draft emails to the bankers on my list
send all
/clock +15m
which bankers did I email in October?
```

The same flow with a scripted model printed:

1. On import, the note "2 of 4 addresses passed every check that ran (50%). Checked: syntax, mail server (MX), not a
   role inbox, not a throwaway domain. Not checked: Hunter verifier".
2. The batch, each draft in full.
3. "send 1-100" got "Nothing was approved: there is no draft 100."
4. "send all" got "Approved 2, exactly as shown ... at most 20 a day (10 a day in your first week of sending)".
5. The scheduled run sent one message per 5-minute step.
6. The recall listed both sends: Blake Fixture, JPMorgan, and Avery Synthetic, Goldman Sachs.

## Not built, and why

- **The 500-banker list itself.** Each person builds theirs in their own Apollo account (D-018a: an export from Upmore's account is never given to users; lists served to users wait for a data licence).
  Until a CSV is sent, `contact_list` with `bulk` answers NOT_WIRED with the one-line ask.
- **Apollo's real header names.** They are ASSUMED. Apollo's docs do not list them. The owner exports 5 rows to confirm.
- **Live sending.** It is off until the owner sets `CAREER_OUTREACH_SEND=on` and the person's career grant carries
  `gmail.send`. The 2026-10-13 send-disabled ruling in module 124 still holds for 124. This is a separate rail behind a
  flag.
- **HUNTER_API_KEY.** It is the owner's to set; the check is NOT_WIRED until then.
- **Reading replies outside the threads Trainee started.** A "stop" sent as a new email is not seen. WO-024's mail
  reader could pass such mail to `recordReply`; that is not wired.
- **The texting channel.** It caps a reply at 4 bubbles of 700 characters (`conversation.ts`), so a 10-draft batch is cut
  there. The web app and the simulator show it whole. The batch is already split into messages of at most 1,500
  characters (`batchMessages`); sending them as separate texts needs the channel to queue them (a WO-013 change).
- **CSV upload in the web app.** The agent-chat handler receives images only. CSV attachments reach the brain through
  the conversation interface (simulator and texting). The web upload is a WO-012 item.
- **Contacts are per thread.** They live in the thread's career snapshot (`state.contacts`, at most 3,000 rows,
  inside the snapshot's 1 MB limit). A list sent in one thread is not seen in another.
- **The referral map's alumni path.** It needs a list with a school column. LinkedIn's connections export has none, so
  from that export alone the paths are 1st-degree connections.

## Architect review (2026-10-20)
- **Recipients protected across users.** At 2 million users the same few hundred thousand professionals are everyone's
  target, so per-sender caps alone would still flood them. `career_outreach_claim` and `admitSend` now refuse a send when
  the address already got 3 Trainee-drafted emails in 30 days from anyone (`recipient_cap`, a lock on the recipient so
  two runs cannot take the third slot), and do-not-contact is checked across every user (a stop to anyone stops all).
  Tests WO-033/X1, X2 and the DB checks; planted defects (cap removed, per-user do-not-contact) each fail their test.
- **Apollo terms (D-018a).** Apollo data only from the person's own account; lists served to users wait for a licence.
