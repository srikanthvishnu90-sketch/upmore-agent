# WO-022: Prepared on the person's computer, approved by one text, run on the person's computer

Status: building (architect) · Depends on: WO-021 W1 (`prepare`), W4 (`run`, #29), receipts (#32), D-014, D-017 ·
Takes over: WO-021 W2 and W3 from Codex (2026-10-20, owner's "whatever you believe is best"; Codex keeps C-01, C-02, C-03).

## Why
WO-021 says what the card shows and how a yes is read, but not how a prepared application gets from the person's
computer, where the engine's dry run must happen (D-017), to the thread where the card is shown and the yes is texted.
Without that, approve-first exists only on the command line. D-014 keeps module 155's old batch card out of it: this is
built on the one stack (planner, queue, engine).

## The loop
1. **Prepare (the person's computer).** `approve-first.ts prepare-batch <urls file> <facts> <resume>`.
   - It runs the engine's dry run on each posting, the same as `prepare`.
   - Each ready one goes to `career_apply_prepare_own` as the signed-in person: the payload, its hash and its card lines.
   - Postings with open questions are listed with the questions; nothing is guessed.
2. **Store.** Table `career_apply_prepared`, one row per prepared application.
   - The database checks the hash (`sha256(career_apply_canonical(payload))`) and that the payload is the signed-in person's.
   - The person can read their own rows.
   - Only the database functions write.
3. **Card (W2).** "show my applications" (or the scheduled run, later) shows the prepared rows not yet shown, at most 8 per card.
   - Each application is numbered, with every answer, the resume and where it goes, from the card lines the engine's dry run produced.
   - One card is under 1,600 characters. If it would be longer, the card holds fewer applications.
   - The card is recorded (its id, its rows and their hashes, the time).
4. **The yes (W3).** In `handler-career.ts`, before any brain, the last card in the thread is read. Then:
   - **"yes":** approves every application on the card exactly as shown. Each is enqueued with `career_apply_enqueue`; its approval reference is the hash of the payload that was shown.
   - **"yes but not 2" / "yes except 2, 5":** approves all but those.
   - **"no":** approves nothing; the card is closed.
     - Not "stop", as WO-021 had it. Over SMS, STOP is the carrier's opt-out word, and `trainee-inbound` silences every text on it before a turn runs.
   - **A number not on the card:** refused, with the card's numbers said.
   - **A card older than 24 hours:** refused; the reply says to text "show my applications" to see it again.
   - **The queue's own refusals** (daily cap, a company in its 30-day cooldown, a duplicate, a changed account) are said per application, plainly.
   - **"change 2 email to x":** not built in this order. The reply says that application is set aside, to change it in the facts and prepare it again. Changing an answer changes the engine's approval, so it must be prepared again.
5. **Run (the person's computer).** `approve-first.ts run` (#29) claims and runs them. Receipts (#32) say how each one ended.

## Rules
- Code decides what was approved; the model never does. A text that is not one of the approval forms goes to the brain as now.
- **An answer counts only while the card is the thread's last word** (the last assistant message's intent is `career_apply_card`).
  A "yes" to anything the brain asked after the card is not a yes to the card. To answer it then, the card is shown again.
- **A card that closed or went stale can be shown again;** its applications are not lost.
- Nothing is enqueued that was not on a shown card, and nothing on a card is changed after it was shown.
- The service key stays in the edge functions. The person's computer only calls the `_own` functions, signed in as them.

## Done means
- **DB:** `prepare_own` refuses a wrong hash, someone else's payload, and an unknown card. A card's rows are enqueued exactly once.
- **W2:** the card names every field the payload sends and nothing else, stays under 1,600 characters, and holds at most 8 applications.
- **W3:** fixed parses, the refusals above, and a simulated thread: prepare, card, "yes but not 2", queue, worker run, receipt texts. Run against local fixtures.
