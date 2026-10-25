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
