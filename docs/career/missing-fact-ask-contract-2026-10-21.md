# Missing-Fact Ask — host wiring contract (module 172)

Owner ruling 2026-10-21 14:11 CDT: when a required application field
has no user-confirmed fact, Trainee asks the user in Messages with the
specific question, stores the reply with provenance as a confirmed
fact, then continues. It never fills a guess and never tags anything
REAL that the user did not state (14:05 CDT: a value that exists only
as a derivation — module 149's `deriveAnswers` output included — is
not a statement).

Module: `packages/domain/172-career-missing-fact-ask.js`
(branch `muse/2026-10-21-ask-on-missing`). This doc is the seam
between the module (Muse's lane, delivered) and the chat host
(Claude's lane): the host surfaces asks as Messages turns, routes
reply turns into intake, persists the produced facts, and resumes
the paused application. The module itself does no I/O, sends
nothing, and holds no state between calls — the session is a plain
serializable object the host owns.

## Exported interface (exact)

```js
const Ask = require("./172-career-missing-fact-ask.js");

Ask.assessCoverage(profile, fieldDefs, deps?)
// -> { covered: [{field_key, value, fact_id, tag:"REAL"}],
//      missing: [{field_key, type, reason:"no_stated_confirmed_fact",
//                 derivable_refused: string|null}],
//      reader_mode: "module167"|"injected"|"stub167", parser170: bool }

Ask.createSession(profile, fieldDefs, opts?)
// opts: { now, context: {company?, title?, run_id?|application_id?|ref?},
//         deps: { reader } }
// -> session (shape below); queue = one question per missing field,
//    in field-def order; complete=true when nothing is missing.

Ask.currentQuestion(session) // -> the open question object or null

Ask.intakeReply(session, replyText, opts?)
// opts: { now, question_id?, idFactory?(field_key, seq) }
// -> { status: "stored", fact, field_key, value, tag:"REAL",
//      resume: {...}, session }
//  | { status: "reask", question_id, field_key, reason, text,
//      stored: false, session }
//  | { status: "stale_question", expected_question_id, session }
//  | { status: "no_open_question", session }
// NEVER mutates the input session; the returned session replaces it.

Ask.applyStoredFact(profile, fact) // -> new profile with fact appended

Ask.FIELD_CATALOG, Ask.DEFAULT_FIELD_KEYS, Ask.parseReply, Ask.VERSION
```

Field defs accept the shapes the apply path already uses: a bare key
string, `{key}`, 149's `{question_key}`, 171's `{field_id}`, or
`{field_key}` / `{profile_key}`; `required:false` defs are skipped;
duplicate keys dedupe. Unknown keys become generic text fields whose
only coverage is an explicit stated `answer_key` fact.

The default field set (when `fieldDefs` is null/empty):
`sponsorship, work_authorization, years_of_experience,
graduation_month, graduation_year, education_level, located_in_us,
country, start_date, relocation_willingness, security_clearance,
age_18_plus`.

## Session shape (host persists this verbatim, e.g. on the thread
state beside the other career stores)

```json
{ "kind": "missing_fact_ask_session", "version": 1,
  "reader_mode": "module167",
  "context": { "company": "…", "title": "…", "run_id": "…" },
  "created_at": "<iso>", "covered": [ …assessCoverage covered… ],
  "queue": [ { "question_id": "mfq_sponsorship",
               "field_key": "sponsorship", "type": "yes_no",
               "text": "…", "accepted_shape": "yes / no",
               "reason": "no_stated_confirmed_fact",
               "derivable_refused": "…"|null,
               "status": "open"|"answered",
               "asked_at": "<iso>"|null, "reasks": 0,
               "answered_value": …, "answered_at": "<iso>" } ],
  "open_question_id": "mfq_…"|null,
  "stored_facts": [ …facts produced by intake… ],
  "complete": false, "seq": 0 }
```

Question ids are stable: `mfq_<field_key>` plus `_<slug>` from
`context.run_id|application_id|ref` when the host supplies one. One
open question per field per session by construction.

## Coverage semantics (what the host must NOT re-decide)

- Facts are read ONLY through module 167's reader
  (`trustedFacts`): `needs_confirmation`, status in
  {draft, quarantined, held, suppressed}, or `quarantined:true`
  facts are invisible — a held fact never covers and the ask fires.
  The reader is injectable (`deps.reader`); every assessment stamps
  `reader_mode` so a stub-backed verdict is never mistaken for a
  167-backed one.
- Coverage = a 167-cleared fact that STATES the field's value:
  an eligibility fact carrying the value (sponsorship, work
  authorization), an education fact at the stated precision
  (graduation year from a stated end year; graduation month ONLY
  from a month-precision end or an explicit month fact), a fact
  carrying `answer_key` + `value` (the shape intake writes), or an
  answers-map entry marked user-stated (`stated:true` or
  provenance.source `"owner_reply"`).
- NEVER coverage: module 149 `deriveAnswers` entries (they carry
  `{value, confirmed, factId}` and no stated provenance — derived
  sponsorship, summed years, DOB-computed age, degree-token levels
  all leave the field missing, with the refused derivation NAMED in
  `missing[].derivable_refused`); a city/hometown for `country`;
  a time zone for `located_in_us`; an employer's sector for
  `security_clearance`; a graduation date for `start_date`.
- Restatements are statements (owner card ruling, 2026-10-21): a
  stated country fact covers `located_in_us`; a stated residence in
  a US state covers it too. Cross-fact inferences are not.

## Host wiring (Claude's lane)

1. **Trigger.** Where the apply path currently stops
   UNANSWERED / UNCOVERED on a required field (prepare leg, module
   155/149; the approval card's UNANSWERED-STOP lines), the host
   calls `assessCoverage(bank, requiredFieldsOf(posting))`. If
   `missing` is empty, proceed as today. Otherwise
   `createSession(bank, requiredFields, {now, context:{company,
   title, run_id}})` and persist the session on the turn state
   (the `career_host.js` STATE_KEYS carriage is the seam).
2. **Ask turn.** Send `currentQuestion(session).text` as the
   Messages turn — one question per turn; the rest of the queue
   waits. The card/readback names each newly stored fact with its
   provenance ("owner-stated <answered_at>") exactly as it names
   REAL / UNANSWERED-STOP lines today.
3. **Reply routing.** While a session has an open question, the
   host routes the user's next reply turn to
   `intakeReply(session, text, {now, question_id:
   session.open_question_id})` BEFORE general dispatch, and
   persists the returned session. Outcomes:
   - `stored` → append `fact` to the user's bank through module
     122's normal write path (the fact is already 122-shaped:
     status "confirmed", `needs_confirmation:false`,
     `source:"owner_reply"`, full `provenance`), then act on
     `resume` (step 4).
   - `reask` → send the outcome's `text` (clarifying re-ask). The
     binding holds; nothing was stored; there is no retry limit in
     the module — pacing/abandonment is host policy.
   - `stale_question` / `no_open_question` → fall through to
     normal dispatch (defensive; routing by open_question_id
     should make both unreachable).
   Binding discipline: the ask owns the reply turn until it is
   answered. If the user plainly changes topic, the host may
   suspend the session (its own flag — the module has no cancel)
   and the paused application STAYS stopped; it never proceeds on
   a guess, and a suspended session resumes at its open question.
4. **Resume.** On `stored`, `resume` names `{signal, field_key,
   question_id, context, remaining, complete, next_question}`.
   If `next_question` is non-null, send its `text` (step 2). When
   `complete` is true, re-run the paused application's prepare
   with the updated bank: the field now reads covered through 167
   and the drive continues. `context` is the host's own reference
   (run/application id) echoed back untouched.
5. **Clocks and ids.** The host supplies `now` (ISO) at session
   creation and at each intake; `asked_at` stamps when a question
   becomes open, `answered_at` at intake, both carried into the
   fact's provenance with the verbatim reply. Fact ids default to
   `F-ASK-<field_key>-<seq>`; the host may pass `idFactory` to use
   its own id space (122's `addFact` will re-id unless keepId —
   provenance survives either way).

## What is proven (guard: tests/career-missing-fact-ask.test.cjs)

18 tests: for each of the 12 catalog field types, the five cells —
(a) no fact → exactly one field-specific ask; (b) derivable-only →
ask still fires, derivation named; (c) stated confirmed fact → no
ask; (d) reply → confirmed fact with full provenance, field
covered, resume signal; (e) unparseable reply → re-ask, nothing
stored. Plus: 167 quarantine variants never cover (real 167,
labeled `module167`; injection labeled `injected`); 149's derived
answers map never covers; the 2026-10-21 owner regression (two
derivations → exactly the sponsorship + years asks; his stated
"No" / 3 → none); queue order/advance/stale-id discipline;
149/171 def shapes; module 170 cascade in reply parsing
(provenance `parsed_via:"parser170"`); month precision never
gains a day.

## Assembly notes

- Modules 167 and 170 are imported into this branch VERBATIM from
  their landed branches (167 @ 1d27bf6b sha256 d60ab923…; 170 @
  a4d08d52 sha256 14b9ec42…) — dedupe at assembly, do not fork.
- 172 is registered in `docs/depth/MUTATION-COVERAGE.md` in the
  Gaps class (report regenerated); a planted-defect depth packet
  is the follow-up that moves it to covered, same posture as
  modules 156–171.
- Bundle registration of 172 (build-router-core list) is the
  integration lane's step, as with 165–171.
