# Backend audit, 2026-10-20: why things fail

Owner, 2026-10-20: "many things that cause error occur because either things aren't built to as high of a depth, or the
backend is poor, so for the 100s of tasks, ask why this may be the issue?"

## How it was done
- **Six auditors, one per layer**, on trunk 53db2d55. Chat brain, channels, apply pipeline, database, the proactive
  layer, and router depth.
- **Each finding carries:**
  - the symptom the person sees;
  - a why-chain to the root, with file:line at every level;
  - a class: DEPTH (built shallow), BACKEND (state, plumbing, concurrency) or BOTH;
  - severity and evidence quality;
  - the smallest fix, with a fail-first test.
- **Reproduced where it could be.** Most findings were reproduced with throwaway scripts outside the repo: SQL on a
  local Postgres loaded with every migration, Deno against trunk's modules, Chromium for the extension.

The full reports are beside this file:
- `chat-brain.md`: 13 findings, 10 verified
- `channels.md`: 11 findings, 10 verified
- `apply.md`: 11 findings, 7 verified
- `database.md`: 11 findings, most verified
- `proactive.md`: 11 findings, 9 verified
- `router-depth.md`: 246 probe threads

## The answer, in one paragraph
Both, and they compound. The backend has a few root defects that each break many features at once:
- one counter doing two jobs;
- state kept per conversation instead of per person;
- control state (pause, STOP, erase) checked in one place out of five;
- no lifecycle for anything that waits.

The depth problem is mostly that **code checks the shape of an action, not its meaning**. A queued posting is never
checked against the company asked for. A remembered instruction is never checked for "don't ask me". A reply is never
checked against confirmed facts.

The router adds a third cause: it matches the list's own wording. On the list's wording it gives up 14% of the time; on
paraphrases, 51% (`router-depth.md`). Its tests were fitted to the same wording, which is why the problem stayed hidden.

## Root causes, ranked by what they break

| # | Root cause | Class | Breaks (examples) | Found in | Order |
|---|---|---|---|---|---|
| 1 | The account `version` is both the chat commit's concurrency counter and the approval fence, and every turn bumps it | BACKEND | Any chat message makes every open card stale. Approved applications stay `queued` forever but count toward cap and cooldown. Extension cards refused. | database #1, apply F3, chat F1 | **WO-092 (PR #117)** |
| 2 | Turns are not serialized per person, and the channel claims the message before the turn (no replay) | BACKEND | Two quick texts: the second's tools run, then it is refused and "couldn't answer" is sent. A slow turn is told "couldn't answer" but commits anyway. | chat F1/F7/F13, channels F2/F3, database #4 | next |
| 3 | Control state (pause, STOP, erase, "stop alerts") lives in three places, and later rails check one or none; nothing re-checks at delivery | BACKEND | Paused: alerts, cards and approved outreach still go. Erased: alerts and saved answers survive. Months-old outreach approvals still send. "Stop my alerts" is reverted by a running job. | proactive F1/F5/F6, database #2/#3 | **WO-091c (lane C)** |
| 4 | Code checks a tool call's shape, not its meaning | DEPTH | Wrong company queued; duplicates and the current employer queued. "Autopilot, don't ask me" saved as a rule. | chat F2/F4, battery BR-018/021/023/084 | **WO-091b (lane B)** |
| 5 | The guards check wording, not structure; replies are never fact-checked | DEPTH | The claim guard replaces correct answers with a canned promise. "Excel" is invented as a skill. Tool names leak. | chat F5/F6/F10 | **WO-091a (lane A)** |
| 6 | No lifecycle: nothing that waits ever expires or is swept | BACKEND | Applications stuck `driving` forever, then "you already applied". Cards stuck `submitting`. The outbox floods weeks-old rows. | apply F2/F11, channels F5, database #6 | WO-091d (lane D) for apply |
| 7 | The apply state machine lacks edges | BOTH | Browser validation blocks submit and the card says "Sent". A rejected attempt can never be retried. The person finishing it themselves can't be recorded. | apply F1/F4 | **WO-091d (lane D)** |
| 8 | Agent facts and the tracker are per thread, not per person | BACKEND | A new conversation knows nothing: no facts, no tracker. The tailor says "no confirmed facts". | chat F3, database #7 | next |
| 9 | The router's intent is a regex chain fitted to the list's wording | DEPTH | 51% give-up on paraphrases. A substring matcher turns "tracker" into the company RA. | router-depth 1/6 | the agent brain (D-027), after 4 and 5 |
| 10 | Capabilities missing under both brains | DEPTH | Calendar, a people connector, referral tracking, outreach follow-ups, a tailor that rewrites bullets, company files beyond 38 | router-depth 10, triage BUILD | queued orders |

Smaller roots each have their own finding:
- one person's failure aborts the scheduled run for everyone (proactive F4);
- "cancel" and "end" are treated as opt-out words (channels F1);
- Workday hosts keyed to the data centre (apply F7);
- no retention anywhere (database #9);
- three meanings of "today" (database #11).

## What holds (checked, no finding)
- **No cross-user leak at the database layer.**
  - All 26 client-callable security-definer functions take the user from `auth.uid()`.
  - Every `p_user` function is revoked from `authenticated`.
  - All 53 career, channel and connector tables have RLS, with owner-only policies.
- **The exact-payload approval binding holds.** The server recomputes the hash, and double sends are blocked.
- **Webhook dedupe.** Duplicate webhooks never run a second turn on trunk, and the immediate send never doubles with the
  scheduled send.

## Numbers this changes
- **Approval and apply-loop rows reopened.** The triage's FIXED-IN-TRUNK rows for approval mechanics (BL-340–348) and the
  apply loop (BL-043–054) held only with no chat turn between prepare and answer. WO-092 fixes them.
- **The agent brain on the fixed task set** (run 39505938110, calibrated judge 96.7% held out):
  - AGENT 11/15 (±2), against ROUTER 2/15 (±1);
  - that is 73%, against D-027's 80%;
  - the battery's failures are mostly roots 4 and 5.
- **The brutal-list battery** (run 39500971945): 39–43/87 on the agent. These are the same roots.
