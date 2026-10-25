# Router impact assessment: the sponsorship sentence read as work authorization

2026-10-23. Written research only. Nothing is changed by this document. The frozen router (63a1233f) and modules 141,
142, 149 and 132 were loaded **unmodified**, and only to observe them. Production was read, never written: one
aggregate count and a list of functions.

## The defect, in one line

`profile.constraints.workAuthorization` holds a **sponsorship** sentence. Three modules then read it as the answer to
**"Are you authorized to work in the US?"** One of them turns "No sponsorship needed." into **No**.

## Where the wrong value is written

1. **130-career-onboarding.js:25, 81, the root.**
   - The interview asks one question for two facts: "Work authorization: what is your status, and will you need
     sponsorship now or later?"
   - The raw reply goes into `constraints.workAuthorization`, and `needsSponsorship` is derived from it by regex.
   - So by design the field is a mixed "visa" answer, never a clean authorization fact.
2. **142-career-router.js:7896–7906 (`writeSensitiveCorrection`), the mislabel.**
   - On a chat correction about sponsorship, the router writes the sponsorship clause itself into `workAuthorization`
     (`cons.workAuthorization = parsed.clause`) and sets `needsSponsorship`.
   - When no first-person clause matched, the clause is the router's own fallback text: "No longer needs sponsorship"
     or "Will need sponsorship in the future" (7888, 7890). The stored "work authorization" can therefore be words the
     person never wrote.

## What each reader does with it (observed, not inferred)

Probe: `handleStateChangeIntents` on the sentence, then each reader on the resulting profile. All modules loaded
unmodified. Reproduce: `node docs/architect/evidence/router-work-authorization-probe.cjs` (read-only; it loads the modules and writes nothing).

| The person said | Stored `workAuthorization` | 141 `work_authorization` | 149 / extension-sync `work_authorization` | 132 `savedAnswerFor` |
|---|---|---|---|---|
| "No sponsorship needed." | "No longer needs sponsorship" (router's fallback) | `yes-authorized` | **`"No"`, `confirmed: true`** | "No longer needs sponsorship" |
| "I don't need sponsorship." | "I don't need sponsorship" | `yes-authorized` | "I don't need sponsorship", `confirmed: true` | same sentence |
| "I do not require visa sponsorship." | that sentence | `yes-authorized` | that sentence, `confirmed: true` | same |
| "I no longer need sponsorship." | that sentence | `yes-authorized` | that sentence, `confirmed: true` | same |
| "I need sponsorship." | that sentence | `will-need-sponsorship` | that sentence, `confirmed: true` | same |
| "I will need sponsorship in the future." | that sentence | `will-need-sponsorship` | that sentence, `confirmed: true` | same |

What goes wrong in each reader:

- **141-career-doorstep.js:222–225.**
  - Not needing sponsorship plus any `workAuthorization` text becomes `yes-authorized`. That is an inference, which
    D-007 forbids. A person who needs no sponsorship is not thereby authorized: they may be outside the US with no
    status there, or their status may lapse before the start date.
  - Needing sponsorship becomes `will-need-sponsorship` as the answer to the authorization question. That is not an
    answer to it: a person on F-1 OPT is authorized now and will need sponsorship later.
  - 141:228 also hands the same sentence back as `sponsorship_detail`. That one is harmless: it is a sponsorship field.
- **149-career-portal-apply.js:508–515, 565–567 (`workAuthorizationToken`, `portalInputsFromBank`).**
  - Any text that starts with "no" becomes the token **"No"**. The router's fallback "No longer needs sponsorship"
    therefore answers the authorization question **No**: the inverse of what the person meant.
  - Any other sponsorship sentence passes through verbatim as a *confirmed* authorization answer.
- **132-career-apply.js:127.** It returns the raw text as the work-authorization answer.
- **`supabase/functions/_shared/extension_sync.js:75–83, 153–155`.** This is not a frozen module. It holds its own copy
  of the same token function and seam, behind the live `extension-sync` endpoint.
  - Re-run on that endpoint's composition (`composeSavedAnswers` with the bundled 149), it **serves
    `work_authorization: "No"` (`confirmed: true`) for "No sponsorship needed."**
  - Its comment says "a wrong fill is impossible either way". That holds for a verbatim sentence: the extension's exact
    option match fails, and it asks. It does **not** hold for the inverted token.

## Two more readers the first pass did not examine: 121 and 124

Added 2026-10-23 as an extension to this assessment. Citations verified against the unmodified files on
`arch/eligibility-separation-impl` @ `10528fee` (the coordinator's cited lines matched exactly; no drift). Both
modules are frozen, and both consume the same mixed field. Neither is changed by anything in this section: the
fixes and tests below are **designs only**, written so an unfreeze package can be scoped before any code moves.

### 121-career-jobs.js — matching hard filters exclude the person, with a false reason

**Consumer behavior (observed).** `scoreFit` (121:864) runs `hardFilters` (121:774) on every scored posting; any
fail returns the posting as `excluded: true` with the fail strings as its reasons (121:872).

- **121:793:** `needsSponsorship = c.needs_sponsorship === true || /sponsor/i.test(s(c.work_authorization))`.
  A bare substring test on the authorization text — the same defect class as the Workday spent-s1 regression.
  Negations count: "without sponsorship", "does not require sponsorship" and "No sponsorship needed" all contain
  "sponsor", so all of them read as *needs sponsorship*.
- **121:796–798:** with that flag set, a no-sponsorship posting fails with "work authorization: posting offers no
  sponsorship; you said you need sponsorship", and a citizens-only posting fails with the citizenship variant of
  the same sentence.
- **Second instance, same module:** `evaluateRestrictions` (121:300–308). A posting's parsed `no_sponsorship`
  restriction is dispositioned "excluded" when `needs === true || /sponsor/i.test(wa)` (121:306); "satisfied"
  requires `needs === false` or text with no "sponsor" in it. The exclusion reasons feed `hardFilters` at 121:818.

**Blast radius.** Silent false exclusion, with a reason that misquotes the person. The population hit hardest is
the one most eligible for these postings — people whose authorization text mentions sponsorship in order to
negate it. "US citizen; no sponsorship required" against a citizens-only posting is excluded at 121:798 ("you
said you need sponsorship"); "Authorized to work in the U.S. without sponsorship" against a no-sponsorship
posting is excluded at 121:797 and again at 121:306. The typed boolean already exists and is derived with
negation awareness where constraints are built (121:967–968: `/without sponsorship/i` → `needs_sponsorship:
false`); the text test at 793 overrides a correct `false` back to true and adds nothing but the defect.

**Fix design (not made; unfreeze package).** Sponsorship need is decided only by the typed
`c.needs_sponsorship`. Where the boolean is absent, the answer is *unknown* — routed to the existing
`needs_user_input` machinery (evaluateRestrictions already has that path) — never inferred from authorization
text. If a text fallback is ever retained, it must be module 156's positive-need classification (without / not /
no / n't carve-outs; the predicate family pinned by WO-048/16 on the option-choice path), never `/sponsor/i`.
Both instances (793 and 306) change together.

**Fail-first test design (not written).** `scoreFit` with constraints `{work_authorization: "Authorized to work
in the U.S. without sponsorship", needs_sponsorship: false}` against a posting whose JD states no sponsorship
is available → today `excluded: true`, reason "you said you need sponsorship" (red); on the design, not excluded
on that ground. Citizens-only variant: `{work_authorization: "US citizen; no sponsorship required"}` against a
citizens-only JD → today excluded at 121:798 (red); on the design, passes. Restriction variant: the first
profile against a posting carrying a parsed `no_sponsorship` restriction → today disposition "excluded"; on the
design, "satisfied". Positive control: `needs_sponsorship: true` against a no-sponsorship posting → excluded on
both, so the fix cannot overcorrect into admitting a real need.

### 124-career-outreach.js — the stored sentence is quoted to an employer

**Consumer behavior (observed).** `profileFactAnswers` (124:1433) builds fact answers for `draftReplyAnswer`
(124:1456) when a reply draft is composed to an employer's message. The `work_authorization` topic triggers when
the employer's text matches `/authorized|authorisation|work in the|sponsor/` (124:1444) — any mention of
"sponsor" in the incoming message asks for a work-authorization answer.

- **124:1445–1446:** the answer value is the raw stored `workAuthorization` (constraints first, then the merged
  profile), with `(TEST)` stripped, quoted verbatim: a `/citizen/` match composes "I am a {value} and authorized
  to work in the US."; anything else becomes "On work authorization: {value}." The `/citizen/` test is also a
  bare substring, so a sentence that negates citizenship ("Not a US citizen; will need sponsorship") still selects
  the citizen template and asserts authorization.
- **124:1447–1448:** the typed fallback ("authorized, no sponsorship") fires only when the stored value is
  *absent* and `needsSponsorship === false`. An absent value lands in `unknown`, and unknown topics are the only
  ones the draft flags for the person's confirmation ("left that for you to confirm before this goes out"). A
  present-but-mislabeled value is quoted with no flag.

**Blast radius.** Outbound and employer-facing. A stored sponsorship sentence is drafted as the answer to "are
you authorized to work in the US?" — "On work authorization: I will need sponsorship in the future." answers a
question the employer did not ask, the router's own fallback text ("No longer needs sponsorship") is quoted as
if it were the person's authorization statement, and the person's actual authorization status is never stated.
The draft still goes through the person's approval before sending, but approval is of the prose; nothing marks
the sentence as a mislabeled fact. The module's own safeguard catches absence only — mislabeling passes silently.

**Fix design (not made; unfreeze package).** The `work_authorization` topic is answered only from a first-person
authorization statement, gated the same way this assessment recommends for 132/141/149 and classified by module
156: a stored value that is about sponsorship — positive-need or its negation — is not an authorization answer,
and the topic goes to `unknown` (the existing safe path). Sponsorship, if it is answered at all, is its own
topic built from the typed `needsSponsorship` fact. The citizen template is composed from a typed citizenship
fact, never from a substring test on the raw sentence.

**Fail-first test design (not written).** `profileFactAnswers` on the reply "Are you authorized to work in the
US, and would you need sponsorship?" with `constraints.workAuthorization = "I will need sponsorship in the
future"` → today the answer text is "On work authorization: I will need sponsorship in the future." (red); on
the design, `work_authorization` is in `unknown` and nothing is quoted. Second input: the stored router fallback
"No longer needs sponsorship" → today quoted verbatim (red); on the design, `unknown`. Positive control: stored
"I am authorized to work in the US" → answered on both.

### Interaction with Branch A, as built (both modules)

**None, today.** Branch A (@ `10528fee`) is module 156 plus three seams — `extension_sync.js` serving,
`answer_options.ts` option choice, a `fact_schema.ts` note. Module 156 is in no bundle list; its only generated
copy (`supabase/functions/_shared/eligibility_facts.js`) serves the extension-sync seam. Neither 121 nor 124
references 156 or `eligibility_facts`, and nothing in Branch A writes `profile.constraints.work_authorization`
or `needs_sponsorship` — those are still written by 130/142 and read by 121/124 exactly as before. Branch A
closes the extension-serving path only; the router-profile consumers are Branch B scope. The fix designs above
deliberately reuse 156's classification, so an unfreeze package converges both paths on one predicate family
instead of growing a third copy of the rule.

## Reach (read-only, production project `upmore`)

- **Writer and readers are live.** `agent-chat` v249 runs the router. `extension-sync` is ACTIVE (v4). It serves the
  person's extension, which fills real employer forms on their own computer; the person presses Submit.
- **Data, as aggregate counts only (no content read):**
  - 1,275 stored profiles (`agent_flow_state` → `career.stores.profile`);
  - **2** carry a `workAuthorization` text;
  - **1** of the 2 is a sponsorship sentence, so the mislabel is live for one person;
  - **0** start with "no", so no one is served the inverted "No" today.
- **The inversion is latent, not hypothetical.** The next person whose correction falls back to "No longer needs
  sponsorship" is served `"No"` on a Yes/No authorization select. That is a knockout answer, pre-filled and marked
  confirmed, one Submit press from the employer.
- **Partly mitigated in the extension.** It skips its `work_authorization` key on a question that mentions
  sponsorship (`extension/lib/trainee-core.js:2790`). A plain "Are you authorized to work in the US?" still takes it.
- **The old batch stack is not a path.** 149's own drive cannot reach a real employer site since G3a (fail-closed).
  The live exposure is the extension path and the chat's doorstep card (141), which shows `yes-authorized` to the
  person as their answer.
- **No test covers it.** Nothing in `tests/`, `scripts/` or `evals/` exercises `workAuthorizationToken` or the
  router's fallback clause. That is how the inversion went unseen.

## What fixing it would affect

The fixes are listed safest first. None is made here; each needs the coordinator's go, and 2–4 need the owner's
unfreeze of the frozen modules.

1. **`extension_sync.js` seam (not frozen; smallest; closes the live inversion).**
   - Never derive `work_authorization` from a text that is about sponsorship.
   - Derive it only from a first-person authorization statement, read with G2's
     `eligibility_draft.ts statedValue("work_authorization", text)`. Example: "I am authorized to work in the US".
     That reader already refuses to let one fact answer the other.
   - Effect: those profiles get no served authorization answer, and the extension asks the person. One served value
     changes (the live profile with a sponsorship sentence: from a verbatim sentence to nothing).
   - Tests: a fail-first unit test on `composeSavedAnswers`, using the table above.
   - Deploy: `extension-sync` redeployed by the owner (frozen now).
2. **142 `writeSensitiveCorrection` (frozen).**
   - Write the sponsorship correction to `needsSponsorship` (and a `sponsorshipDetail` text) only. Stop writing
     `workAuthorization`.
   - Two parts are the owner's decision: 130's `answerCurrent` "visa" write, which lands in the same field, and the
     audit entry's `field: "work_authorization"`.
   - Affects the router bundle (`router_core.career.js`, regenerated) and the gauntlet scripts that assert the
     correction transcript.
3. **141 `resolveField("work_authorization")` (frozen).**
   - Drop both inferences and ask unless an explicit authorization statement is on the profile.
   - Changes `yes-authorized` in 7 test and gauntlet files (`career-gauntlet-r2a/r2b/r3`, `run-u-journeys`, …) and
     `will-need-sponsorship` in 2 gauntlet runners. Those expectations encode the inference and would be rewritten.
4. **149 `workAuthorizationToken` and 132 `savedAnswerFor` (frozen).**
   - Return nothing for a text about sponsorship. Map "no" only from an authorization statement.
   - Affects `extension_domain.js` (regenerated bundle) and the chat's confirmation prompts.
5. **130's combined question (product decision).**
   - Split it into two questions with two stored facts: status / authorization, and sponsorship now or later.
   - This removes the mixed field at its source. G2 already treats the two as separate facts.
6. **The one live profile (data; frozen; the owner's).** Clearing or relabelling its `workAuthorization` is a
   production mutation. With fix 1 in place it is no longer served as an authorization answer, so no data change is
   needed for safety.

**Recommendation:** fix 1 first, as a fail-first test plus the seam change, ready for the owner's redeploy. It closes
the only live path to the inverted answer without touching a frozen module. Then 2–4 as one unfreeze package, with
5 as the product follow-up.

## What I could not see

- The relay that assigned this was cut off mid-sentence ("141 answers 'yes, a…"). The observed 141 answer is
  `yes-authorized`, which matches that fragment.
- Any further part of the assignment is not covered here.
