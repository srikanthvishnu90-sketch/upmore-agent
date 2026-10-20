# WO-049: Draft written answers on the extension card, from the person's confirmed facts

Status: built on `wo/049-essay-card`, not deployed · Depends on: WO-030 (`essay_draft.ts`: AI-policy gate, confirmed facts
only, factLock, length limit), WO-031 (the extension, its card and approve-the-exact-payload), WO-042 (ask once from the
form), D-007 (never invent), D-024 (proof per application), the owner rule: OpenAI only.

## Why

The extension left every written question ("Why do you want to work here?", "Describe your experience with...") under
"Still needed". The person had to leave the form, text Trainee, draft it in chat (WO-030) and come back. Written questions
are 70 of the 300 required questions still asked across the 199 captured postings (`docs/apply/fill-coverage.md`: 29 in
sample A, 41 in B). They are what keeps a posting from being ready, and they slow a 60-applications-in-30-minutes session.

## What it does

1. **The offer.** Each written question the form still needs gets a "Draft from my facts" button on the card. A written
   question is one `mapQuestion(...).kind === "essay"`, required, not answered, not an identity field
   (`essayQuestions`). Nothing is drafted until the person taps. A click a script makes drafts nothing. The page never
   asks for a draft. No model is called on its own.
2. **The draft** comes from a new edge function, `career-essay-draft`:
   - The card sends the posting id, the company, the question as the form asks it, the form's other labels and the
     field's `maxlength`. It never sends a fact.
   - The function reads the person's facts from their own account, from every career thread
     (`agent_flow_state.state.career.stores.profile.facts`, newest thread first, one fact per id). Any fact in the
     request is ignored.
   - It runs WO-030's `draftEssay` unchanged in what it decides:
     - the employer's AI policy decides first (`employerGate` over the question and the sibling labels);
     - only confirmed facts are used, and fewer than 2 that fit means no draft, with `whatWouldHelp` saying what would
       let it draft;
     - factLock is checked, and a draft that fails is written once more, then not shown;
     - the form's limit is met by writing again, never by cutting.
   - `draftEssay` gained one optional input, `limitText`: the field's `maxlength`, read with the label.
3. **OpenAI only.** The model goes through the gateway's `callModel` with `essayModelConfig`, which pins
   `MODEL_PROVIDER` to OpenAI whatever the environment says. The model is `CAREER_MODEL` when set, else the gateway's
   default.
4. **The daily cap.** At most 60 drafts per person in any 24 hours:
   - counted on the server, once per draft that reached the model, however many tries it took (a policy refusal or thin
     facts cost nothing);
   - each draft is one row on the person's own timeline (`career_events`, kind `note`, source `essay_card`), so no
     migration was needed;
   - the row is reserved before the first model call and counted after it, so two taps at once never pass 60;
   - when the cap is reached the card says plainly: "You've had 60 drafts in the last 24 hours, Trainee's daily limit, so
     nothing was drafted...".
5. **On the card.** A draft shows in full in an editable box, with the facts it used by label only, and two buttons: Use
   this and Redo.
   - When there is no draft, the card says why in one line and the question stays asked. That covers a policy refusal,
     thin facts (what would help), unverified (the untraced items), too long, a model failure and the cap.
   - A cut-off or unverified draft is never shown. The function never returns its text, and the extension's
     `showableDraft` checks again.
   - After a policy refusal, the Draft button goes away.
6. **Use this** is the only way a draft reaches the form.
   - The content script fills the field. The field becomes source `drafted`, with factId `essay-draft:<fact ids>`, and
     the card is read again. The approval hash covers the text exactly like any other answer.
   - All the existing checks still hold: the payload is compared in the same task as the click, and a value a page
     script writes is source `page` and blocks.
   - When the person edits the box after Use this, the edit goes on the form, the card and its hash follow, and Approve
     stays off until the edit has landed. An approval of the text before the edit is refused.
   - Redo asks for a different version (the earlier draft goes to the model as the one to differ from). If the earlier
     draft was already used, it comes off the form until the person uses the new one.
7. **Kept for this posting only.** After the application goes, a used essay is kept by `formAnswersToKeep` under its
   `job:` key. An essay, or anything drafted, that would get a `fact:` or `label:` key is not kept at all.
8. **Proof (D-024).** For each drafted answer:
   - the local proof (`approved_answers`) and the recorded evidence carry `fact_ids` and `edited`;
   - the proof reads "drafted by Trainee from your facts (F-001, F-002), used by you as drafted" or "..., edited and used
     by you";
   - the card line reads "(drafted by Trainee from your confirmed facts F-001, F-002; put on the form by you)".

## Files

- `supabase/functions/_shared/career_essay_card.ts` (new): the function's pure core. It contains `readRequest`,
  `essayCardDraft`, `cardMessage`, `factLabel`, `essayModelConfig`, `supabaseFacts`, `supabaseDraftCounter` and
  `handleEssayDraft`.
- `supabase/functions/career-essay-draft/index.ts` (new): wires the core to Supabase Auth, the service client and
  `callModel`, and records the draft's spend in `agent_turn_costs` with no thread.
- `supabase/config.toml`: `[functions.career-essay-draft] verify_jwt = true`.
- `supabase/functions/_shared/essay_draft.ts`: optional `limitText` on `draftEssay`.
- `extension/src/apply_core.ts`:
  - new: source `drafted`, `essayQuestions`, `showableDraft`, `draftFactId` / `draftFactIds`, `draftProvenance`;
  - changed: `cardLines`, `evidenceRecord` (takes `drafts`) and `formAnswersToKeep` (drafted answers are kept as `job:`
    only).
- `extension/content.js`: the `drafted` map, `snapshot` sources, `essays`/`formLabels` on the card, `useDraft` and the
  `essay-fill` message.
- `extension/background.js`:
  - `essay_drafts` per tab and posting, `requestDraft`;
  - the panel-only `essay-draft` and `essay-use` messages;
  - drafts on the pending record, and provenance in the proof.
- `extension/panel.js`, `panel.html`, `panel.css`: the written-question blocks.
- `extension/lib/trainee-core.js`: rebuilt.
- `evals/apply/fill-coverage.ts` and `docs/apply/fill-coverage.md`: the new "Drafted for review" column.
- `scripts/gate.sh`: the new function in the career typecheck.
- Tests:
  - `tests/architect/wo-049-essay-card.test.ts` (new, 14);
  - `tests/career-extension-browser.test.cjs` (4 new, 52 in all; `personAnswers` can leave named fields);
  - `tests/fixtures/extension/world.cjs` (the `essay` and `aiban` variants, and the stand-in route
    `/functions/v1/career-essay-draft`).

## Interfaces

`POST /functions/v1/career-essay-draft`. It takes the person's own session token; a service key gets 403.

```
request  { posting, company, label, type, siblings: string[], limit: { chars?, words? }, previous?: string }
reply    { ok: true,  text, facts: [{ id, label }], fact_ids, message, used, cap }
       | { ok: false, why: "policy"|"thin"|"unverified"|"too_long"|"model"|"cap"|"invalid", message, used, cap }
```

Every refusal is a 200 with `ok: false` and the one line the card shows. A malformed request is a 400.

Extension messages (panel only):

- `essay-draft {tabId, name, redo?}` returns `{ok, item}`;
- `essay-use {tabId, name, text}` returns `{ok, hash}`.

The background sends `essay-fill {name, text, factIds}` to the content script. Only the frame that holds the field
answers it.

## Tests

### Deno (`deno test -A --no-check tests/architect/wo-049-essay-card.test.ts`, 14 tests, stub model)

| Test | What it proves |
|---|---|
| /1 | A policy refusal (Canonical's real ban, a ban in the question, Anthropic's named policy) makes no model call, reads no facts and counts nothing. |
| /2 | Thin facts make no model call, and the card says what would help. |
| /3 | A draft that fails factLock twice is not shown. |
| /4 | The length limit (the field's maxlength, or the label's own words) is met by a rewrite, never a cut. A cut-off draft is never shown. |
| /5 | The cap is 60 in 24 hours. It is counted once per draft, refused before any read or call, a two-tap race is released, and refusals are free. |
| /6 | Facts come from the server only: a fact sent by the client is ignored, never given to the model, and cannot pass the lock. |
| /7 | Output never contains an unconfirmed fact. Fact labels only. Redo asks for a different version. |
| /8 | The edge: 401/403/400/405, JSON, OpenAI pinned, no Anthropic and no model identifier in the function, `verify_jwt` on. |
| /9 | The fact and counter stores are scoped to the person. |
| /10 | `essayQuestions` and `showableDraft`. |
| /11 | The payload hash binds the text, plus card line, provenance and evidence. |
| /12 | Essays are kept as `job:` only. |
| /13 | Extension wiring (tap-only, panel-only). |
| /14 | The eval column is separate from Filled. |

### Browser (`UPMORE_CHROMIUM_SANDBOX=off node --test tests/career-extension-browser.test.cjs`)

| Test | What it proves |
|---|---|
| essay card 1 | No draft without the tap (none on Fill, while waiting, or on a script's click). The draft is shown whole with fact labels. The field and payload stay empty until Use this. Use this fills the field. The approved hash and the employer's received form carry exactly the draft. The proof says "used by you as drafted" with fact ids. The answer is kept as `job:` only and is not filled at another employer. |
| essay card 2 | Redo replaces the draft (`previous` sent; a used draft comes off the form). An edit after Use this changes the payload and hash. The old hash is refused. The employer gets the edited text. The proof says "edited and used by you". |
| essay card 3 | A page script that rewrites a used essay stops the send. Nothing is recorded or sent. |
| essay card 4 | A form that asks for answers without AI shows the refusal, with no box, no Use this and no Draft button. Thin facts, a cut-off draft and an unverified draft each say so in one line, show nothing and leave the question asked. |

### Planted defects

Each was put in one at a time and then reverted. A named test caught each one.

| # | One-line defect | File | Caught by |
|---|---|---|---|
| D1 | The form's other labels not passed to the policy gate (`siblingLabels: []`) | career_essay_card.ts | WO-049/1, /5 |
| D2 | A `facts` list in the request trusted ahead of the server's | career_essay_card.ts | WO-049/6 |
| D3 | Cap checked with `>` instead of `>=` | career_essay_card.ts | WO-049/5 |
| D4 | The field's maxlength not passed to `draftEssay` | career_essay_card.ts | WO-049/4 |
| D5 | The `job:`-only guard for essays and drafted answers removed | apply_core.ts | WO-049/12 |
| D6 | `edited` always false in the proof | apply_core.ts | WO-049/11 |
| B1 | The panel's `isTrusted` check on Draft removed | panel.js | essay card 1 |
| B2 | `showableDraft` replaced by `r?.ok` (a cut-off draft shown) | background.js | essay card 4 |
| B3 | An edit after Use this not sent to the form | panel.js | essay card 2 |
| B4 | Drafts not attached to the pending record (proof wrong) | background.js | essay card 1 |
| B5 | A used draft not recognised (`asDrafted = false`) | content.js | essay cards 1, 2, 3 |

## Demo the owner can run

1. Run `deno test -A --no-check tests/architect/wo-049-essay-card.test.ts`. Expect 14 passed.
2. Run `UPMORE_CHROMIUM_SANDBOX=off node --test --test-name-pattern="essay card" tests/career-extension-browser.test.cjs`.
   Expect 4 passed. This drives the real extension in Chromium against a captured Lever form with a TEST "Why do you
   want to work here?" field. The draft comes from the TEST stand-in; nothing reaches a real model or employer.
3. Live, after you deploy (your call):
   1. Run `supabase functions deploy career-essay-draft`. It uses the `OPENAI_API_KEY` already set; no new secret is
      needed.
   2. Load the extension, open a posting with a written question, press Fill, then tap Draft from my facts.
   3. Read the draft, tap Use this, edit it if you like, and approve.
   4. Open Proof. The answer says it was drafted from your facts, with their ids.

## Out of scope

- Drafting without a tap, or for every question at once.
- Cover letters as files.
- Workday (no button there).
- Any change to the 60-in-30 harness. Its queue fills and approves as before, and a written question is still answered
  by the person on the page.
- A migration (the counter lives on the person's timeline).
- Deploying.

## Numbers

From `docs/apply/fill-coverage.md`, regenerated. "Drafted for review" is its own column and never part of Filled.

| Sample | Required | Filled | Essays still asked | Drafted for review | Kept for the person's own words (employer AI policy) |
|---|---|---|---|---|---|
| A (biggest employers) | 1011 | 854 (84.5%) | 29 | 26 | 3 |
| B (random boards) | 847 | 708 (83.6%) | 41 | 41 | 0 |

Size: about 1,300 added lines, including the tests (380 in the deno test file, about 200 in the browser tests), the
rebuilt bundle and this document. The function core is 227 lines and its entry 45. The extension adds about 250 lines
across `content.js`, `background.js`, `panel.js` and `apply_core.ts`.
