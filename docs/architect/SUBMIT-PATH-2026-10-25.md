# Application submission for a person as the chat leaves them (2026-10-25)

Branch `arch/submit-path`, off `arch/backend-g6-receipts` 6bf3478e (which contains `arch/backend-integrated-flow`).
Repo only: nothing is deployed, no migration is applied, no real employer is reached. SUBMIT-STEER-1130 and SPLIT-1146.
This side owns the host, the executor and the database. The router's chat families are Muse's.

## The one path

The person texts → `prepare-ahead.ts` prepares on the server → the card → their own tap → `career_apply_claim_own` →
the engine submits on their computer (`approve-first.ts` `runApproved`) → `career_apply_finish_own` records it → chat
reads it back. The cloud worker runs the same engine. The agent submits; the person approves the exact answers on the
card. There is one ledger (`career_apply_ledger`) and one cap (`career_apply_daily_limit`), both in SQL (G3,
`20261025100000`). The cloud card bridge's `least(15, …)` is a stricter opt-in limit on the cloud only, and it is not on
this path.

## What a real person lacked at 6bf3478e

Measured with the product's chat host (the router bundle agent-chat runs), not a hand-made profile:

| Input | At 6bf3478e |
|---|---|
| Resume | "yes, that's my resume" confirms 15 entries with no provenance and no event, so the executor keeps 0 of 15. The server prepare then stops at `no_resume` before it asks anything. |
| Name, email | Without them no resume can be tailored, and nothing asks for them, so the prepare returns `no_resume` every time. |
| Phone, name, email said in chat | They never reach a form. Only sponsorship and work authorization were offered back from the person's own words (G2). |
| Work authorization, sponsorship | They reach the form through G2's "use N". |
| Read-back | "did my application to Acme go through?" gets the banner. "where are my applications" reads the router's own tracker, never `career_apply_jobs`. |

## Functions (signatures for Muse)

### (a) Resume confirmation with real provenance: `_shared/career_router_evidence.ts`

```ts
evidenceResumeConfirmation(o: {
  userId: string; now: number; message: string;          // the person's yes, this turn
  before: Profile | null; after: Profile | null;          // the profile the turn started from, and the one it left
  out: { intent?: string | null; resultStatus?: string | null };  // the router's result for this turn
  shown: { text: string; message_ids: string[] } | null;  // what Trainee showed since the upload, verbatim
  upload: { kind: "message" | "file"; ref: string; sha256: string; text: string } | null;  // the person's original upload
  events: EventStore | null;                               // career_events (supabaseEventStore)
}): Promise<{ stamped: number; unshown: number; untraced: number; refused: number }>

resumeConfirmationContext(rows: { id; role; content }[] /* the thread, newest first */, after: Profile)
  : Promise<{ shown: Shown | null; upload: Upload | null }>
```

It stamps a fact only when all of these hold:
- it was a draft before this turn and is confirmed after it, on the router's own confirm (`career_resume_ingest`,
  `completed`);
- its words (`fact.text`) appear in what was shown;
- its own lines (its title and bullets) appear in the person's upload.

A stamped fact gets:
- a `fact_confirmed` event in `career_events`, recording the message hash, the shown hash, the shown message ids, and
  the upload ref and hash;
- `provenance: "owner confirmed in chat the resume entry shown to them (<at>)"`;
- `confirmation_event_id`;
- `source_ref`.

An event that is not recorded stamps nothing. agent-chat runs it after the router's turn and before the commit, on that
intent only (`handler-career.ts`).

**Muse's part (router, 142).** The confirm reply today shows a count: "I read it as 15 facts (1 education, …)". A yes to
it evidences nothing, which is honest. For the entries to reach the executor, the reply before "yes, that's my resume"
must show each entry's own words (`fact.text`). Any layout works, as long as each entry's text appears whole.
`flow-real-person.test.ts` uses `Here is what I read:\n1. <fact.text>\n2. …` as the contract.

### (b) Name, email and phone from the person's own words: `_shared/contact_draft.ts`

```ts
contactDraft(fact: "first_name" | "last_name" | "full_name" | "email" | "phone", said: { text: string; at: string }[])
  : { fact; value: string; text: string; at: string } | null
isContactFact(f: string): boolean
```

The questions turn (`career_apply_questions.ts`) offers it under a `fact:first_name`, `fact:last_name`, `fact:email` or
`fact:phone` question: "You told me on Oct 24: "my name is Jordan Rivera". That answers Jordan. Say "use 1"". Only
"use N" saves it, as with G2.
- **What counts:** a first-person statement only ("my name is …", "my email is …", "my phone number is …", "reach me
  at …").
- **What never counts:** someone else's details ("my sister's phone …"), a question, a hedge, or a negation.
- **Names:** a first and last name are taken only from a name of exactly two words.
- **Freshness:** the newest message about a field decides.
- **Production read:** `supabaseQuestionStore.statements` now also reads the person's messages that mention their name,
  email or phone.

`prepare-ahead.ts` asks `fact:first_name`, `fact:last_name` and `fact:email` once, when there are confirmed entries but
no name or email to print on the resume. Before, it stopped at `no_resume`. The questions are bound to the posting, so
answering them makes it a candidate again.

### (c) Read-back from `career_apply_jobs`: `_shared/career_apply_status.ts`

```ts
statusAsk(message: string): { company: string | null } | null
statusReply(message: string, rows: AppRow[] | null, now: number): { reply; status; intent: "career_apply_status" } | null
applicationsTurn(o: { message; userId; now; read: (userId) => Promise<AppRow[]> }): Promise<… | null>
supabaseApplications(admin): (userId) => Promise<AppRow[]>   // career_apply_jobs only
```

| Recorded state | Read back as |
|---|---|
| `confirmed` | "submitted, and X confirmed it (confirmation N)". Said only in this state. |
| `submitted_unconfirmed` | "submitted on <date>; X has not confirmed it yet (their page showed N)". |
| `unknown_outcome` | "I can't tell whether it reached X. It will not be sent again." |
| `queued` | "approved, not sent yet". |
| `driving` | "being sent now". |
| `failed`, `not_submitted` | "not sent (<reason>)". |
| `needs_user` | "stopped before it was sent; it needs you". |
| No row | "I have no application to X on record". |
| Unreadable | "I couldn't read your applications just now". |

agent-chat answers it in code before the router and the brain, like the card (`handler-career.ts`). If Muse would rather
the router own the wording, `statusReply` is pure and can be called with rows the handler reads.

## Tests

- `tests/architect/submit-real-person.test.ts`: 15 tests (evidence 1–1d, prepare 2–2c, own words 3–3c, read-back
  4–4c).
  - Mutations, each red on its test: M1 contact ask removed, M2 contact offers removed, M3 shown not checked, M4 upload
    not checked, M5 an unrecorded event stamps anyway, M6 "submitted, not confirmed" said as success, M7 an unreadable
    record guessed as none.
  - M8 (someone else's phone offered) stays green: it is caught a second time by the possessive check.
- `tests/architect/flow-real-person.test.ts`: real Postgres and Chromium, 10 steps.
  - **Today's router reply:** a yes to the count evidences nothing, so that person stops at `no_resume`.
  - **With the entries shown:** every entry gets its event and upload.
  - **The questions:** the prepare asks for name and email, and they are offered from the person's own words and used
    with "use N". The dry run then asks phone, sponsorship and work authorization, each offered from their words and
    used with "use N".
  - **The submit:** the prepare is ready with only the person's answers and the tailored resume. The card shows each
    answer. Their tap queues it, with one ledger row, and the read-back says "approved, not sent yet". The employer page
    receives Jordan / Rivera / email / phone / no / yes and the tailored resume byte for byte, once.
  - **The record:** `submitted_unconfirmed` REAL-7001, read back as "has not confirmed it yet".
- **Fail-first:** at 6bf3478e none of these load (the modules are new). The measured behavior is in the table above.

## Not done here (named)

- The router's resume confirm reply must show each entry (Muse's lane). Until it does, the live router path evidences
  nothing, and the executor gets only what the person answers to questions.
- The router's own replies to "my name is …" (the banner) and to "I'm a US citizen, I don't need sponsorship" (it claims
  a save and a prepared packet when neither exists, as in `tests/architect/pending/g2-workauth-honest.test.ts`) are
  Muse's.
- Nothing is applied or deployed. The handler changes reach people only on the owner's deploy.

## Running the real flows yourself (JOIN-1202)

`bash tests/flow/run-real-flow.sh` runs `flow-real-person.test.ts` and `flow-connected.test.ts` on a throwaway
Postgres 16 with CI's migration order and a sandboxed Chromium. It sets `CI=true`, so a missing Postgres or browser
fails the run; it never prints NOT_RUN and passes. As root it re-runs itself as the `postgres` account, because
Chromium's sandbox refuses root.

Needs:
- **Postgres 16:** `/usr/lib/postgresql/16/bin`, or `PGBIN=`.
- **Deno and Node:** Deno 2.9.6 and Node 22 on `PATH`.
- **Playwright 1.64.1:** `npm ci --prefix tools`.
- **A Chromium:** `UPMORE_CHROMIUM_PATH=` (CI uses the runner's `google-chrome`). Otherwise Playwright's own, from
  `(cd tools && npx --no-install playwright install chromium)`.
- **Network once:** to fetch the tests' imports.

Measured at 455da675, warm: 3 tests and 24 steps in 1m23s. flow-real-person took about 28s, flow-connected G1 25s and
G4 37 to 44s. The gate also runs both under `CI=true` in GitHub Actions (`architect-tests`).

Exact local environment used:

```
UPMORE_PLAYWRIGHT_PATH=<checkout>/tools/node_modules/playwright
UPMORE_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome   (Chromium 141)
PGBIN=/usr/lib/postgresql/16/bin   (PostgreSQL 16.15)
deno 2.9.6
node 22
```

## Handler-level contract (JOIN-1215)

The contract is the agent-chat request and what follows from it, not a ctx seam. The router (142) stays synchronous and
pure, and never calls a host writer or reader. The handler `supabase/functions/agent-chat/handler-career.ts`
(`handleChat`) runs the host steps around the router's turn, in this order:

| # | When | Call (file:line) | Reads / writes | What the person reads |
|---|---|---|---|---|
| 1 | before the router, when the text answers the questions | `questionsTurn` (handler-career.ts:359 → `_shared/career_apply_questions.ts`) | **Offers:** their own message about name, email, phone (`contact_draft.ts` `contactDraft`), sponsorship or work authorization (`eligibility_draft.ts`). **Writes:** only on "use N", through `career_apply_question_answer_as` | the offer quoted with its date; "Saved, as drafted" only after the write returned. A failed write gives the 503 "I could not confirm that your career reply or changes were saved" |
| 2 | before the router, when the text is a status question | `applicationsTurn` (handler-career.ts:428 → `_shared/career_apply_status.ts`, `supabaseApplications`) | reads `career_apply_jobs` only | each application in its recorded state. "X confirmed it" only for state `confirmed`. "I couldn't read your applications" when the read fails |
| 3 | the router's turn | `host.runTurn(message, ctx)` (:501, :508) | the thread's career state | the router's reply |
| 4 | after the router, on `career_resume_ingest` + `completed` only | `resumeConfirmationContext` (:524) then `evidenceResumeConfirmation` (:525), `heldReply` (:529) → `_shared/career_router_evidence.ts` | **Reads:** the thread's last 40 messages, i.e. what was shown since the upload, and the upload. **Writes:** a `career_events` `fact_confirmed` row per evidenced entry, and the entry's provenance, `confirmation_event_id` and `source_ref`. An entry it cannot evidence goes back to draft | when anything is held: what is confirmed and what stays a draft, and why, **in place of** the router's "Confirmed" |
| 5 | the commit | `persistence.commit` (:590) | the thread's state, including the stamps and holds from step 4 | — |

Signatures (career_router_evidence.ts):
- `:36` `evidenceResumeConfirmation(o: { userId, now, message, before, after, out, shown: Shown | null, upload: Upload | null, events }): Promise<EvidenceResult>`
- `:25` `EvidenceResult { stamped, unshown, untraced, refused, held: string[] }`
- `:79` `heldReply(r): string | null`
- `:95` `resumeConfirmationContext(rows /* newest first */, after): Promise<{ shown, upload }>`

What the router must render for step 4 to evidence anything: the reply before "yes, that's my resume" shows each
entry's `fact.text` whole. A count is not enough.

**Tests, through `handleChat` on a real Postgres** (`tests/flow/handler.ts`, `tests/flow/postgrest.ts`: the real
supabase-js client, Supabase-parity grants and RLS, the HTTP hop answered over the same database):
- `tests/architect/handler-submit-path.test.ts`: 9 tests.
  - **(a2)** A yes to a count is held as drafts and never called confirmed: no event, and the executor gets 0.
  - **(b1)** Name, email and phone said in chat write nothing and claim nothing. They reach the form only through "use
    N", exactly as typed.
  - **(b2)** A failed write is never called saved.
  - **(c1)** Work authorization and sponsorship come from their own words through "use N".
  - **(c2)** Citizenship answers neither.
  - **(d1–d3)** Read-back from `career_apply_jobs`; never a success without the recorded confirmation; an unreadable
    record is said.
- `tests/architect/pending/handler-submit-router.test.ts`: 3 tests, red until the router changes.
  - **(a1)** The entries are shown, then one event per entry, then the executor gets exactly those.
  - **(a3)** The entries are shown and the event write fails: nothing is confirmed, and the reply says so.
  - **(c)** No "saved" and no "prepared packet" that does not exist.
- Locally, where esm.sh is unreachable: `--import-map=tests/flow/supabase-npm.json`, the same supabase-js 2.117.1 from
  npm.

| Head | handler-submit-path | pending router |
|---|---|---|
| 6bf3478e (before) | 4 passed, 5 failed (a2, b1, d1, d2, d3) | — |
| 455da675 | 8 passed, 1 failed (a2: "Confirmed — your resume facts are on your record.") | — |
| this commit | 9 passed | 3 red: a1 "15 of 15 not shown"; a3 its precondition; c "Updated — I saved your corrected sponsorship answer" |
| join eea59b6e | 8 passed, 1 failed (a2; the join predates this commit) | 3 red, same messages |

## Volume ceilings on the chosen path (CAPS-1218 inventory; nothing removed yet)

Latest definitions, in migration order. Removal waits for a green join head, and goes in code and migration drafts only.

| Ceiling | Value | Where |
|---|---|---|
| The person's daily limit | default 25, floor 1, max 50 (`career:account.daily_limit`) | `supabase/migrations/20261020050000_career_apply_daily_limit.sql:6-11` (`career_apply_daily_limit`) |
| The daily count check at the tap and the claim | `least(coalesce(p_daily, 50), career_apply_daily_limit(u))` over 24h of the one ledger | `20261025100000_career_apply_one_ledger.sql:76-87` (`career_apply_ledger_refusal`) |
| Enqueue's limit argument | `p_daily default 25`, refused unless `between 1 and 50` | `20261025100000_career_apply_one_ledger.sql:156,162` (`career_apply_enqueue`) |
| The card tap passes the person's limit | `career_apply_enqueue(…, career_apply_daily_limit(p_user))` | `20261020050000_career_apply_daily_limit.sql:51` (`career_apply_card_answer_for`) |
| Extension and form-answer paths | the same | `20261021000000_career_apply_extension.sql:27`; `20261021120000_career_apply_form_answers.sql:18` |
| Cloud claim | `least(coalesce(o.daily, 25), career_apply_daily_limit(u))` | `20261025100000_career_apply_one_ledger.sql:236`; also `20261024120000_career_apply_cloud_gate_waiver.sql:63`, `20261025110000_career_apply_bridge_reconcile.sql:98` |
| Cloud opt-in's own limit | `daily between 1 and 50` | `20261021080000_career_apply_cloud.sql:191` |
| Card cloud bridge (DRAFT, not applied) | `least(15, coalesce(o.daily, 15), …)`; opt-in default 15 | `20261024130000_career_apply_card_cloud_bridge.sql:70,200,617,703,716,730-731`; `20261025110000_career_apply_bridge_reconcile.sql:160` |
| Claim batch size | `least(6, p_limit)` per claim call | `20261025100000_career_apply_one_ledger.sql:263,275`; `20261025110000_career_apply_bridge_reconcile.sql:71,130` |
| The person's computer claims one at a time | `claim(limit = 1)`; the loop claims 1 | `workers/career-browser/approve-first.ts:408,443` |
| Cloud worker concurrency | `max(1, min(6, contexts ?? 3))` browser contexts | `workers/career-cloud/worker.ts:236` |
| TS mirror of the daily limit | `DEFAULT_DAILY = 25, MAX_DAILY = 50`; `dailyLimit()`; `admitApplication` → `daily_cap` | `supabase/functions/_shared/career_apply.ts:46,57,68` |
| Store-side claim bound | `limit > 6` refused | `supabase/functions/_shared/career_apply_store.ts:37` |
| Applications per card | `MAX_PER_CARD = 8` | `supabase/functions/_shared/career_apply_cards.ts:43,87` |
| Server prepare-ahead | 5 per person, 50 per run (caller); SQL clamps per person to 25 and the run to 200 | `workers/career-browser/prepare-ahead.ts:67`; `20261025120000_career_apply_prepare_ahead.sql:75-77` |
| Old batch stack (off this path, no real site: G3a) | `SPEC_CAPS { perDay: 15, perVendorPerDay: 5, perCompanyPer30Days: 1 }` | `packages/domain/149-career-portal-apply.js:123,665-667` |

Kept unchanged, as asked:
- **One per company per 30 days:** `career_apply_ledger_refusal`, `20261025100000_career_apply_one_ledger.sql:81-82` (and the cloud refusal at :241), `company_cooldown`.
  **Flagged as unresolved:** it is not user-approved policy and not an exact-duplicate rule, and different roles at one
  company may be legitimate.
- **Unique confirmation IDs:** `career_apply_confirmation_key`, `career_apply_jobs_confirmation`.
- **Payload-hash re-verify at claim:** `career_apply_void_unsendable`, `career_apply_jobs_fixed`.

## Approval model on the chosen path (APPROVAL-1226; changed 2026-10-27 by D-MS-1)

- **A batch, by the person's own call.** `career_apply_card_answer_own(p_card, p_approve int[])` approves every listed
  item of one card in one call (`20261020030000_career_apply_cards.sql:130`, body
  `20261020050000_career_apply_daily_limit.sql` `career_apply_card_answer_for`). A card holds up to `MAX_PER_CARD = 8`
  applications.
- **Each approval is bound to the exact payload.** The card stores each item's `payload_hash`. At the answer, an item
  whose prepared payload no longer hashes to it is `changed`, not queued (the same function). Enqueue requires
  `approval = payload hash = career_apply_payload_hash(payload)` (`20261025100000…:162-163`). The claim closes any job
  whose payload no longer hashes to its approval as not sent (`career_apply_void_unsendable`).
- **(Superseded 2026-10-27 by D-MS-1, below.)** ~~A chat "yes" does not approve (Option A, 2026-10-22).~~ A text "yes"
  to the card replied "A text yes doesn't send anything … tap Approve"; later (SERIAL-1461) only a yes in direct reply to
  the card's message counted.
- **(Resolved 2026-10-27 by the owner, D-MS-1.)** The tension between "a yes does handle a batch of submissions" and
  Option A is closed in favour of the texted yes.

### Approval model from 2026-10-27 (D-MS-1, mass submission, chat side)

- **A texted yes approves exactly the batch shown, on any channel** (SMS/iMessage, WhatsApp, Telegram, the web app).
  `cardTurn` (`supabase/functions/_shared/career_apply_cards.ts`) calls the existing batch approval once,
  `career_apply_card_answer_as(p_user, p_card, p_approve int[])` with the card's numbers: the same function the tap uses
  (`_own`), no new trust path. The database still decides per item: an item whose prepared payload no longer hashes to
  the hash the card carries is `changed`, not queued, and the rest go on; the reply names it ("2. Beta Labs: not sent: it
  changed after the card was shown") and says how to see it again.
- **Which card a yes is about.** The card this thread showed, while it is still the thread's last word (the plain yes
  that iMessage, SMS and the web app send), or the card whose message the text replies to (Telegram, WhatsApp Cloud). A
  reply to any other message approves nothing and says how. Of two cards shown only the latest is open (opening a card
  closes the older one in `career_apply_card_open_for`): a yes to the older one is "out of date", nothing approved.
  Within 10 minutes of the showing (the chat and `career_apply_card_answer_for`'s `card_stale`), once (`card_answered`).
- **What a reply means.** "yes", "yes to all", "approve all", "send them", "go ahead": the whole card. "yes except 3",
  "yes but not Acme", "approve, skip 2": all but those. "only 1, 2 and 5", "just 1 and 2", "1, 2 and 5", "send 1 and
  3": exactly those. "not Acme" alone: confirmed first ("Reply "yes except 1" to send the other 5"), nothing approved.
  "no": declines all. "wait", "hold on", "not yet": holds, nothing approved, the card still waits. "maybe", "ok", "sure",
  "yes?", "1 or 2", "approve 2", "yes 3", "yes acme", "yes but not the one in Ohio": unclear, nothing approved, the card
  asks again in plain words. A number not on the card, an employer not on it, "yes send all 60" on a card of 3, or a
  subset that leaves nothing: refused, nothing approved. "stop" stays the carrier's opt-out, never a card answer.
- **No 8-per-card limit (D-MS-2).** "show my applications" puts the whole batch on one card, paged into messages of at
  most 3,800 characters for reading (`batchFor`; the reply's `parts`, delivered whole on every channel), and one yes
  covers every page; the answer says plainly how many were approved and lists each not sent with why. A batch past 20
  pages (a transport bound for one reply) shows what fits and says "N more are ready; they come on the next card". The
  scheduled push (`cardFor`) is still one text. **Until builder A's D-MS-2 migration** drops the database's
  `between 1 and 8` (`career_apply_card_open_for`, the `items` check), the database refuses a larger card: the chat then
  shows 8 and says how many more wait, and the next card holds the rest.
- **Mass asks.** "apply me to all of them", "apply to the top 50", "apply to all remote ones", "apply to every SWE intern
  role you found" queue the listed postings (a filter is read against the listed titles and locations) as one batch
  (`career_apply_chat.ts` `applyManyAsk` / `applyManyTurn`). The resume rule is unchanged: no confirmed resume, nothing
  queued, the reply asks for it.
- **Tests:** `tests/architect/mass-submit-chat.test.ts`, `mass-submit-channels.test.ts` (iMessage, Telegram, WhatsApp
  through their real webhook handlers), `mass-submit-handler-pg.test.ts` (the production handler on Postgres, the web
  app's turn; `career_apply_jobs` asserted).
