# Review: Channel Battery Scoreboard, 1,000 executions (2026-10-19)

Reviewer: the architect, 2026-10-20. Subject: the owner-supplied scoreboard of the channel-rollout candidate
(commit `75ccf5f5`, branch `integration/channel-rollout`, deployed as agent-chat v238, telegram-inbound v1,
whatsapp-inbound v1). The battery's harness, scenarios, transcripts and `results.jsonl` are not in this repository,
so this review checks the scoreboard against its own quoted transcripts and against the code at `75ccf5f5`. Nothing
here re-runs the battery. Labels: VERIFIED (checked in code or in the quoted transcript), REPORTED (the
scoreboard's number, not re-checked), NOT_RUN.

## 1. Verdict

The battery is careful work and most of its honesty is real: it discloses its harness seams, says the splitter
never fired, says the 13 identical `SBX-0001` IDs are a fixture, and grades end state from the stores. Four of its
conclusions do not hold as written, and one finding is a product-rule breach in the build that is live today.

1. **What was measured is not trunk.** `75ccf5f5` forked from trunk at `ad534539` (2026-10-18) and is 301 trunk
   commits behind (VERIFIED). Its `agent-chat/handler-career.ts` has no model brain: it never imports
   `career_brain.ts`, so every turn is the deterministic router (VERIFIED). None of trunk's WO-019 to WO-041 work is
   in it. The scores describe the deployed v238 product. They say little about trunk, where most of the failure
   mechanisms already have a built answer (§4).
2. **"Zero invented facts" is too strong.** The scoreboard's own transcripts contain two kinds of statement the
   detectors were not armed for (§2.1).
3. **Channel approvals are blind.** A person approves a batch of applications on Telegram or WhatsApp without
   seeing one answer of any of them (§2.2). That breaks the rule every external effect lives under: the person
   approves the exact payload. BLOCKING, live now.
4. **HONEST-STOP is over-credited** and the sample size is overstated (§2.3, §2.4).

## 2. Corrections to the scoreboard

### 2.1 Invented statements the detectors did not catch (VERIFIED in the quoted transcripts and in code)

- **The product misstates what the person said.** CB-0247: the person asked for "a coffee-chat email to an analyst at
  Waypoint Onboarding". The reply said "You named no firms, so the plan proposes a starting set … Goldman Sachs,
  Morgan Stanley, JPMorgan…". CB-0441: "my top target company is Bluepeak Networks and my recruiter contact there is
  Omar Farouk" got "Building the list now: investment bankers … You named no firms".
  - The person named a firm both times, and asked for investment bankers neither time.
  - Cause: `extractNamedFirms` (`packages/domain/124-career-outreach.js:83`) only recognizes firms in its lexicon, so
    any company outside it counts as "no firms named". The router then states that as a fact about the person
    (`142-career-router.js:1438`).
  - This is the D-007 failure, not a routing miss. The detectors looked for invented people, figures, companies and
    contact data, never for a false statement about the person's own words.
- **An action is claimed that may not exist.** "Building the list now … the build runs on the proposed set now"
  arrives with `result_status: awaiting_user` (CB-0247, CB-0441). If no build was started, and the status says
  nothing is running, this is a false progress claim. NOT_RUN: confirm against the stores in the battery's world.
  Either start the build, or say "I can build this list once you confirm".
- **There is no proof check on confirmations.** The reply "Submitted 13 with employer confirmations" lists the same
  ID 13 times. The battery is right that this is fixture behavior. But nothing in the product would notice 13
  different employers returning one confirmation ID, and nothing shows the person proof. The owner's standing rule
  (2026-10-20): every submission or action shows proof.
  - Proof means per application: the employer's own confirmation text or ID, a screenshot of the confirmation page,
    and the time.
  - Two employers returning the same ID must block the "confirmed" wording.

### 2.2 Blind approval on the channels (BLOCKING, VERIFIED in `channel_present.ts` at `75ccf5f5`)

- **What the person sees.** The batch card holds every answer, but it never goes to the channel. On Telegram the
  person gets the summary ("13 are tailored and sitting at the final review screen — the card shows each one with
  the exact answers it will send"), then "Batch batch-… is waiting on your yes" with an **Approve this batch**
  button. On WhatsApp they get "1 — Approve this batch".
- **What the tap does.** It approves the card's hash. The hash binding is sound: the hash stays server-side, the
  token is single-use, and the core re-verifies it. But the person has never seen what the hash covers.
- **Trunk is different.** Trunk's WO-022 card sends every answer as text ("Every answer below goes exactly as
  shown", up to 8 applications under 1,600 characters, one alone up to 4,000) before "yes" can count.
- **Fix, in either lane.** Before the button or numbered choice, send the card's own lines: every application and
  every answer, split on application boundaries within the 4,096-character limit. Bind the button to the hash of
  exactly what was sent. Until then, the channel approval control must not be offered.

### 2.3 HONEST-STOP is over-credited (VERIFIED for CB-0381)

- **CB-0381 should be a FAIL.** Turn 1 named the company ("final rounds with Lincoln International") and fell back.
  Turn 2 reported the offer, and the product said "no row in this thread matches it yet, so I will not guess a
  company onto it". The company was in the thread one turn earlier.
- **Why the grade is wrong.** Refusing to guess is right. Not having heard is a memory failure, not honesty. Graded
  as HONEST-STOP, it moves a memory failure into a non-failure grade.
- **Rule for the re-grade.** An honest stop that asks for a fact the person already gave in this conversation is a
  FAIL.
- **The adjudication rules were added after a 20-run smoke.** They were applied uniformly, which is good. But they
  were chosen after seeing data, and the MI-123 rule is the one that over-credits.

### 2.4 Sample size and the real rates

- **Two surfaces, one core.** The 1,000 executions are 500 scenarios through one core, each rendered on two surfaces.
  The grade tables are identical across surfaces by construction. For the core, n = 500. The second surface adds
  evidence only about rendering.
- **Core rates per scenario (REPORTED counts, n = 500):**

  | Grade | Count | Share |
  |---|---|---|
  | PASS | 116 | 23.2% |
  | PARTIAL | 209 | 41.8% |
  | FAIL | 130 | 26.0% |
  | HONEST-STOP | 45 | 9.0% |

  With §2.3 applied, HONEST-STOP shrinks and FAIL grows. The size of the shift is NOT_RUN without the transcripts.
- **Fallback rate.** 36.9% of agent turns ended in the generic fallback or containment (REPORTED), so more than one
  turn in three answered nothing.

## 3. Other findings

- **Two channel implementations exist, and the live one is not D-019's.**
  - Deployed: `telegram-inbound` and `whatsapp-inbound`, with WhatsApp on **Twilio**.
  - Trunk (WO-038, merged as #57): `trainee-telegram` and `trainee-whatsapp`, with WhatsApp on the **Meta Cloud API**
    as D-019 records.
  - Owner decision needed: one provider and one implementation.
  - The deployed lane's presentation layer (`channel_present.ts`: block-boundary splitting, real buttons,
    single-use approval tokens, one product voice) is good work, and worth porting onto whichever implementation
    stays.
- **Two outreach send policies.**
  - Deployed: "12 a day, +5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days".
  - Trunk WO-033: 10 a day in the first week, 20 by default, 30 at most, 90 seconds apart.
  - One policy has to win, and it should be in DECISIONS.
- **Wording defects in the canonical replies:**
  - "Noted — a offer landed" (CB-0381);
  - stop lines run together without a break ("…inventing an answer Stopped — TestCo 11…", CB-0485).
- **Untested, as the scoreboard itself says:**
  - the splitter;
  - bold and list rendering;
  - document delivery (CHANNEL-DOC-1: open on trunk too; no `sendDocument` anywhere on trunk, VERIFIED);
  - iMessage parity;
  - anything live.

## 4. The battery's failure mechanisms against what trunk has built

Trunk's agent brain (WO-002, D-008: the model decides, code enforces) runs behind `CAREER_BRAIN=agent`. Its tools,
VERIFIED in `supabase/functions/_shared/agent/career_tools.ts`, cover most of what failed. None of it has been
measured on this battery's scenarios.

| Battery mechanism (scoreboard numbers, REPORTED) | Trunk's built answer | Status on trunk |
|---|---|---|
| Follow-up collapse; 36.9% fallback | The agent brain reads the whole thread and calls tools; it does not route on keywords | Built; off by default; NOT_RUN on these scenarios |
| Watch creation 0/40 ("alert me when…") | `set_job_alerts`, `get_job_alerts`, `stop_job_alerts` | Built |
| Tracker assertions don't write | `track_application`, `list_applications`, `where_do_i_stand` | Built |
| Memory 0/60 (plant, correct, recall) | `recall`, `get_memory`, `remember_instruction`, `add_profile_fact` / `confirm_profile_fact` (WO-019, WO-023, WO-027) | Built |
| One outreach draft never materializes | `draft_outreach` (WO-033): one draft, approved by its exact text | Built |
| Mock "next question" falls back | `get_interview_questions`, `score_interview_answer` (WO-025); voice WO-035 | Built |
| Tailoring "show me what you changed" | `tailor_resume` (WO-028) | Built; the diff view itself is not verified here |
| Connector usually not honestly stopped | WO-026 connector: nothing proposed until 500 people opt in | Built |
| Negotiation benchmark | `offer_benchmark` (WO-036; real LCA and OEWS data) | Built |
| Resume PDF over a channel | none (CHANNEL-DOC-1) | NOT BUILT on either lane |
| Firm named outside the lexicon gets "you named no firms" | the agent brain reads the person's words; the router's lexicon bug is still on trunk's router | Router bug open on both lanes |
| Blind channel approval | WO-022 card text with every answer | Built on trunk's card path; channel-button path not on trunk |

## 5. What to do, in order

1. **Owner: choose the lane.** Either trunk becomes what deploys, with the presentation layer ported onto it, or the
   deployed lane takes trunk's brain and tools. Two products that drift apart, each tested separately, is the
   current state, and it is what makes this scoreboard hard to act on. Recommendation: trunk, because it holds the
   brain and twenty work orders the deployed lane lacks.
2. **Fix blind approval in the live lane now, or turn the channel approval control off** (§2.2). Applying the fix
   is a deploy, so it needs the owner.
3. **Fix the firm extraction false statement** in the router on both lanes. Treat any capitalized organization phrase
   in the person's words as a named firm. Never say "you named no firms" when the message names one.
4. **Add the missing detectors to the battery:**
   - a false statement about the person's words (a "you named no / you didn't say" claim against a message that
     contains it);
   - an action claim with no state change ("building now" with nothing started);
   - one confirmation ID across different employers;
   - an approval control offered without the payload shown on that channel;
   - the CB-0381 re-grade rule.
5. **Re-run the same 500 scenarios against trunk with both brains,** router and agent, through trunk's channel
   adapters.
   - The router run costs nothing.
   - The agent run calls OpenAI: about 1,790 agent turns.
     - At the gateway's default model, the ASSUMED cost is roughly $0.003–$0.01 a turn, so about $5–$18 for the run.
       That is spend, so it needs the owner's yes.
     - The harness, scenarios and grading rules must be committed to this repository first, so the run is
       reproducible and the numbers can be checked.

## 6. What I need from the owner

- The battery's harness, its 500 scenarios and its grading rules, committed to this repository.
- Which lane deploys, and which WhatsApp provider (Twilio or Meta Cloud API; D-019 says Meta).
- Whether the live v238 keeps its channel Approve button until the fix in §2.2 ships. Recommendation: turn it off.
- A yes or no on about $5–$18 (ASSUMED) of OpenAI spend for the agent-brain run of the same battery.
