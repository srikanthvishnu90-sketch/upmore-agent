# WO-026: the Connector, double-opt-in warm introductions

Status: built, not wired (branch `wo/026-connector`) · Depends on: WO-004 (the conversation interface), WO-013 (texting
channel), WO-022 (the last-word rule) · Wiring into `handler-career.ts` and the scheduled run is left to the architect.

## What it is
- Trainee keeps an opt-in network of its users, plus opted-in mentors, alumni and recruiters.
- It brokers warm introductions, one at a time, for career reasons only:
  - a student meets an alum at a firm they want;
  - candidates swap what interviews at a firm were like;
  - a job seeker meets someone who can refer them;
  - peers form prep pairs for the same role.
- Code decides who is proposed and what anyone is told. The model never does.

## The flow
1. **Join, in conversation.** "join introductions as a student" (or candidate, mentor, alum, recruiter).
   - Then what they need: "connect me with someone at JPM", "connect me with someone who interviewed at Goldman",
     "get me a referral at Evercore", "find me a prep partner for analyst interviews".
   - Then what they offer: "I can talk to students about Goldman", "I can refer people at Evercore",
     "I can share my JPMorgan interviews", and "I work at Goldman Sachs" right after Trainee asks for it.
   - Each one is saved in the person's own words and restated.
   - A request before joining stores nothing; the reply explains the opt-in.
2. **A private match profile** (`profileFrom`). It is built only from:
   - facts the person stated (the account's `stated_facts`, with their words);
   - facts they confirmed;
   - the master profile Trainee holds: target firms, target roles, confirmed education and experience, first name.

   A draft fact or one with no words of theirs is left out. Every item carries its own id and its source
   (`chat: "<their words>"` or `career:F-003`). Only the owner can read it. There is no directory and no search by name.
3. **One proposal at a time** (`score`, `proposeNext`).
   - **Primary reasons.** A need met by an offer is worth 3:
     - meet: they work at the firm and offered to talk about it;
     - intel: they offered their interview notes for the firm;
     - referral: they work there, offered to refer, and are an alum, mentor or recruiter;
     - prep: both want a partner for the same role.
   - **Bonuses.** A shared school or a shared target firm adds 1, and only when there is already a primary reason.
   - **The fit bar is 3.** The best person above it is proposed, or nobody: never a weak fit to hit a number.
   - Every reason cites fact ids from both profiles. No cite, no score.
   - Both people's filters hold.
4. **Double opt-in.** Both people get the proposal.
   - Before both said yes, each side reads only two things:
     - the other side's role kind ("an alum", "a student");
     - the one-line why, which names only the needs, offers and shared facts the match rests on.
   - No name, no contact, no id, nothing else.
   - A "yes" or "no" counts only while the proposal is the thread's last word (the cards rule).
5. **The intro.** When both said yes, each side gets:
   - who the other is (first name when they gave one);
   - why;
   - an offer to pass times along: "times Tue 3pm or Wed noon" is relayed, in their words, to the other person;
   - "block" if anything feels off.

   Trainee never shares a phone number or email. People share their own if they want to.
6. **Follow-through** (`checkins`, `followText`, `connector_followup_for`).
   - A proposal one side has not answered is nudged once after 72 hours, then expires 72 hours later. The side that said
     yes is told, with nothing shared.
   - An intro is checked on 72 hours after it is made: "did you get to talk?". It is nudged once 72 hours later, then
     recorded as `no_reply`. Trainee never guesses whether they met.
   - Answers: "we met, it was useful", "we met, not useful", "we didn't meet".
7. **Learning** (`applyFeedback`). The person's own filter changes:
   - useful: that kind of intro is preferred;
   - met but not useful: that kind is avoided (it drops below the bar unless the fit is strong);
   - two not-useful intros with the same kind of person: that kind of person is no longer proposed;
   - not meeting: nothing changes.

   The fit bar never moves down.

## The consent model (each rule is enforced in the database, and again in code)
- **Opt-in only.**
  - Nobody is proposed who has not opted in, or who paused or left.
  - Leaving clears what the profile held and expires anything waiting.
- **Nothing identifying before both yes.**
  - `connector_intros` and `connector_blocks` have no direct read for anyone.
  - A person reads their introductions only through `connector_my_proposals_own` / `_as`, which return:
    - their own why;
    - the other side's role kind;
    - `other_user` only once both said yes.
  - Names are read for the intro text only through `parties()`, which refuses before both yes.
  - A "no" tells the other side nothing.
- **No fact, no intro.** `connector_propose_for` refuses cites that are missing for either side, or not in that side's
  stored profile.
- **Spam and abuse.**
  - One pending proposal per person.
  - At most 3 proposals in 7 days per person.
  - A pair is proposed once, ever.
  - A block either way stops proposals for good. The block is made by introduction, so the blocker never needs, and
    never gets, the other's id.
  - A report also hides the reporter from the reported person forever (even after both said yes, and the times relay
    stops). It is flagged for human review (`reported and reviewed_at is null`).
- **Mentors and recruiters.**
  - They are proposed only once verified.
  - `verified` is set only by the service role (`connector_verify_for`).
  - A changed role clears it.
- **Privacy.**
  - A profile is readable only by its owner.
  - Nothing takes a name or lists people: "connect me with Maya Chen" and "show me all the mentors" are refused.
  - Deleting the account deletes the profile, its introductions and its blocks (cascade). Note this includes a report
    the deleted person made.
- **Export data** (privacy policy):
  - `connector_profiles` is exported as a table;
  - the person's introductions are exported through the redacted read;
  - `connector_blocks` is left out with its reason in `tests/fixtures/export-tables.json`.
- **Never "stop".** The carrier opt-out word is not a command here, and neither are quit, cancel or end.
- **"I work at X" outside the Connector.** It goes to the rest of Trainee. The Connector reads it only right after it
  asked for it.

## The gate (cold start)
- **Flag off.** The Connector answers nothing but "Introductions to other people aren't open yet". This holds unless
  `CONNECTOR_ENABLED=on`.
- **Flag on, network under 500.** `connector_open()` is false while there are fewer than 500 opted-in, unpaused
  profiles. In that state:
  - people can join and say what they need and offer;
  - they are told introductions start once enough people have joined;
  - nothing is proposed, and `connector_propose_for` refuses with `connector_closed`.
  - Joining has to be possible here, or the network could never reach 500. **Architect to confirm.**
- **Target.** First match within 24 hours of opting in, after the cold start. That needs the scheduled matching run below.

## Files
- `supabase/migrations/20261020110000_career_connector.sql`:
  - tables, RLS and the redacted view;
  - `_own` / `_as` functions over one internal `_core` each;
  - the service-only `connector_propose_for`, `connector_followup_for` and `connector_verify_for`.
- `supabase/functions/_shared/career_connector.ts`:
  - the pure functions and `connectorTurn`;
  - `memoryConnectorStore` (the database's rules, for tests and the simulator);
  - `supabaseConnectorStore(admin, { deliver, career })`.
- `tests/db/career_connector.test.sql`: every refusal, and that nothing identifying is readable by the other side before
  both yes. It is in `tests/db/run.sh`.
- `tests/architect/wo-026-connector.test.ts`: 12 tests, end to end on fakes.
- Export coverage:
  - `tests/fixtures/export-tables.json`;
  - `src/upmore-app-template.html`, rebuilt into `index.html`, `src/upmore-app.html` and `sw.js`;
  - `tests/export-coverage.test.cjs`.

## Wiring (architect)
- **The handler.** In `handler-career.ts`, call `connectorTurn` before the brain, as `cardTurn` is called:
  - pass `flag: Deno.env.get("CONNECTOR_ENABLED")` and `supabaseConnectorStore(admin, { deliver, career })`;
  - store the reply's `intent` on the assistant message's `meta.intent`.
- **`deliver`.** It must follow the card push rules (WO-022):
  - write the text into the person's texting thread as Upmore's last word, and queue it once;
  - never in quiet hours, never to a thread that texted STOP, never while the person is mid-conversation;
  - return false when it holds a text back. The person then sees the proposal with "show my intro".
- **The scheduled run.** The proactive run calls `checkins(intros, now)`. For each step it records the step with
  `connector_followup_for`, then sends `followText`.

## What is NOT built
- **Wiring:**
  - into `handler-career.ts`;
  - into the scheduled run, both matching after joining (for the 24-hour target) and follow-through;
  - the `deliver` function.
- **Voice onboarding.** Joining is by text only.
- **Calendar booking.** Times are relayed as the people wrote them; no invites, no calendar reads.
- **Pro follow-through.** Coaching before or after the meeting and paid-tier features.
- **The review tool.** Nothing yet shows reported people to a person on the team, or sets `reviewed_at`.
- **Verifying mentors and recruiters.** `connector_verify_for` exists, but nothing calls it yet (no admin screen).
- **The app screens.** The `_own` functions exist; no app screen uses them yet.
- **Matching scale.** `proposeNext` scores every opted-in profile in memory. That is fine to a few thousand; past that
  it needs a pre-filter by firm and role.

## How to run the tests
```
deno test -A --no-check tests/architect/wo-026-connector.test.ts
deno check supabase/functions/_shared/career_connector.ts
bash tests/db/run.sh                 # includes career_connector.test.sql; Postgres binaries, not as root
node --test tests/export-coverage.test.cjs
deno test -A --no-check --ignore=tests/architect/pending tests/architect/
```
