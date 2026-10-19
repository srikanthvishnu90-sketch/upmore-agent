# WO-025: Mock interviews by text, and the pre-interview brief

Status: v1 built (text only) · Branch `wo/025-mock-interview` · Depends on: 127 (question banks, rubric), the company
records in `packages/career-data/cirs/`, the card hook pattern (WO-022), D-015 (nothing during a live interview).

Owner targets: "Start a 20-minute role-specific mock with one text; scored debrief within 2 minutes of hanging up.
Question banks for the top 50 companies' known interview patterns. Pre-interview brief (questions that company asked,
10-point prep plan) within 1 hour of the user forwarding the invite." This order builds the text version. Voice is a
later step.

## What v1 does
- **Start with one text.** "mock me for data analyst at Stripe", "start a mock interview", "start a 10 minute mock for
  swe at Google", "mock me for Stripe" (a company with a record, named alone).
  - 20 minutes is 6 questions (about 3.5 minutes each; 5 to 30 minutes, 2 to 6 questions).
  - The plan, in order: tell me about yourself; a behavioral question; a role technical question; one question from the
    company's record; a second technical question from another section; why this company.
  - Technical questions come from the role's question bank (127 `questionBank`: the inline drill sets first, then bank
    items that already ask something). Bank items that name a company are left out.
  - A role with no bank (nurse, teacher, anything outside the 9 families) gets the general behavioral set, and the
    first text says so.
- **The company question comes only from that company's record.** It quotes the record with its source label, for
  example `Stripe's record says (public page, stripe.com, 2026-10-12): "..."`.
  - Matching is exact: the record's id or short name. "Bain Capital" is not Bain & Company; "Citadel" is not Citadel
    Securities; archetypes are never a company.
  - No record: no company question, and the first text says "No record for Acme on file, so nothing here is about how
    they interview."
  - A record with nothing usable (BCG, Hudson River Trading, Millennium today) gives no company question, and says so.
- **Each answer**: the 127 rubric score (structure, evidence, specificity; out of 15), a one-line nudge, then the next
  question. "skip" skips. "resume mock" asks the waiting question again.
- **The debrief** comes at once after the last answer, on "end mock" / "stop the mock" / "done", or when the time
  runs out. It has:
  - a score per question;
  - the 2 strongest and 2 weakest moments, each a sentence quoted from the person's own answer;
  - 3 practice items: redo the weakest question, the weakest rubric dimension (or a fact check, or "end with a
    decision"), and the record's steps, or a note that there is no record;
  - no number other than rubric scores and counts. The average is labeled "a practice score, not a hiring prediction".
- **The last-word rule (same as the card).** A text counts as an answer only while the mock's question is the thread's
  last reply (`meta.intent = career_mock`). Anything the brain said after it means the next text is the brain's.
- **Timeout.** After 30 minutes with no reply, a text is no longer an answer. "end mock" still gives the debrief of what
  was answered.
- **Carrier words.** Over SMS, STOP, END, QUIT, CANCEL, UNSUBSCRIBE, STOPALL, HELP, INFO and START are carrier keywords.
  None of them alone ever starts, ends or answers a mock. The mock ends with "end mock" or "stop the mock".
- **D-015.** "I'm in my real interview right now..." mid-mock is refused, not scored, and the mock waits.
- **Storage.** `career_watch_kv`, key `career:mock:<thread>`, through the service client. It is deleted when the mock
  ends. An account erase deletes it too: `career_host_commit` (`20261016120000_career_account_stated_facts.sql`)
  deletes every `career_watch_kv` row of the person except `career:turn:%` receipts. No migration was needed.
- **Wiring.** `mockTurn` runs in `handler-career.ts` right after the card hook, behind the same guards (no structured
  task or batch, not a host control). It runs before either brain, so it works on the router (live today, D-008) and
  on the agent brain. It costs one primary-key read of `career_watch_kv` per turn (none for a carrier word).
- **The brief.** `brief({company, role, cir, postings})` in `career_mock.ts`, and the brain tool `interview_brief`
  (read). Each brief fits one text (1,600 characters) and has:
  - what the company's record says (steps, what they look for, interview style), quoted with source labels;
  - a plain line that the record holds no list of that company's questions;
  - the posting's skill words, when a posting from that company is in the pool;
  - the role's top 3 question types, from the bank's sections;
  - exactly 10 plan points.
  With no record it says so and gives the role-only plan.
- **Fix found on the way.** `get_interview_questions` called 127's `findCir(company)` without the library, so it never
  found a record. It now uses the same exact match (`findRecord`). 127 gained `cirLibrary()`: every record, from disk in
  Node and from the bundle's embedded `CAREER_CIRS_JSON` in Deno. Both bundles were rebuilt.

## What is NOT built, and why
- **Voice.** No voice rail is wired (127 `voiceMockAvailability()`), so there is no sub-second turn-taking and no "hang
  up". The debrief comes at once by text, so the 2-minute target holds for text. Voice needs a telephony or realtime
  audio provider. The owner picks it; it must not be Anthropic (D-002). That is its own order.
- **Brief within 1 hour of a forwarded invite.** There is no invite intake: no inbox read (WO-015 is still drafting) and
  no parser for calendar invites. Today the brief is on ask, through the brain tool (agent brain only). The router path
  has its own prep brief (142 `composeBrief`). The mock does not add a code-first "brief me" command, so it does not
  take over those phrasings.
- **"Questions that company asked."** No record holds a list of a company's actual questions. The brief says so rather
  than presenting bank questions as theirs.
- **Top 50 company banks.** 33 companies have records today:
  Airbnb, Amazon, Anduril Industries, Bain & Company, Blackstone, Boston Consulting Group, Citadel Securities, Coinbase,
  Datadog, D. E. Shaw & Co., Deloitte Consulting, Duolingo, Evercore, Figma, Goldman Sachs (IBD), Google, Hudson River
  Trading, Jane Street, JPMorganChase (IBD), KKR, Lazard, McKinsey & Company, Microsoft, Millennium, Morgan Stanley
  (IBD), Notion, Palantir Technologies, Plaid, Point72, Ramp, Snowflake, Stripe, Two Sigma.
  Five archetypes (AI infra, consumer, dev tools, fintech, healthtech) are not companies and are never used as one.
  30 of the 33 yield a company question.
  To reach 50 honestly:
  1. The owner names the 50 (for example by how often they appear in `career_postings` for our users). The list is not
     guessed here.
  2. 17 or more new records, each researched the way the 33 were: every fact with its source URL, source type and date,
     validated by 125's schema.
  3. For "known interview patterns", a sourced section per company of questions that company asked: official prep pages
     first, and candidate reports labeled anecdotal.
  4. Re-checks when facts go stale. Until then a company outside the records gets role questions only, and the mock says
     so.
- **Known limits.**
  - The rubric is built for stories. Technical answers are domain-checked only where 127 has graded drills (finance),
    so a correct short technical answer can score low.
  - The session is saved before the turn's reply is committed. If that commit fails and the person retries, the same
    answer can be scored twice.

## Tests and how to run
- `deno test -A --no-check tests/architect/wo-025-mock.test.ts` (14 tests):
  - the commands, and that the carrier words are never commands;
  - a full session from start to debrief;
  - the debrief quotes only the person's words, with no stat that was not computed;
  - "stop" alone neither starts, ends nor answers;
  - an answer after the brain spoke is not a mock answer, until "resume mock";
  - the 30-minute idle timeout, and the 20-minute limit;
  - no record means no company question, and a near name is not a record;
  - the brief: labels, quotes found in the record, exactly 10 points, at most 1,600 characters for all 33 records;
  - HYGIENE from `evals/career/compare.ts` over more than 1,500 replies;
  - a real interview is refused;
  - the storage key and the erase SQL;
  - the brain tools;
  - the handler wiring, read as text.
- `deno test -A --no-check tests/architect/wo-002-career-tools.test.ts`: the tool list now includes `interview_brief`
  (read).
- The staged-handler suites now let the handler read `career_watch_kv` (the mock session; none is running in them):
  `node --test tests/capability2-bundle.test.cjs tests/career-batch-delegation.test.cjs tests/career-bundle-reachability.test.cjs tests/career-durability.test.cjs tests/independent-worker-atomic-interplay.test.cjs`.
- Bundles: `python3 scripts/build-router-core.py --check` and `python3 scripts/build-router-core.py --career-only --check`.
- All architect tests: `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`.
