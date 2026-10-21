# Root-cause notes (WO-061)

Owner, 2026-10-21: "after each test, understand why it fails the way it does before changing anything. For every
failure, write a short root-cause note first - why it happens, the exact code or prompt line responsible, and the fix
- and only then change it. Every fix gets verified with a measured re-run. No fix without the note, no note without
the re-run."

Each note: the failure (item, run, judges), why it happens, the exact line, the fix, and the measured re-run that
verifies it (or "re-run pending"). Items are read by failure reason only (evals/career/heldout-touched.json). Notes
are appended, never rewritten; a later finding gets its own dated line under the note.

Judges: g5 = gpt-5-mini, g41 = gpt-4.1-mini, ins = Instinct. Scores are of 38.

---

## Fixes already measured (written after the fact for the record; the rule starts with the notes below them)

### Fix (a): in-chat facts recalled (H003, H037)
- Failure: baseline run 39541224991, H037 failed (g5, ins) "said no company on file though the user named it".
- Why: the person block said "Upmore keeps this from their account, not from this chat ... never add to it" and
  "none on file"; the model read "none on file" as "I don't know".
- Line: `supabase/functions/_shared/agent/memory.ts` personBlock head; `prompt.ts` "What they told you earlier...".
- Fix: 2eb1896b. The block says the chat counts and "none on file" means only the account has no record.
- Re-run: 39543405447: H037 passes in all three; g5 33/32/31 vs baseline 39545926640 28/32/29. Kept.

### Fix (b): "can't read your account" (harness)
- Failure: H012, H014, H023, H029, H030, H031, H032 "evades with can't read your account".
- Why: the eval harness passed no situation; get_situation threw "their records could not be read this turn".
  Production reads the situation every turn.
- Line: `evals/career/run.ts` agentTurn call (no `known`); `career_situation.ts` empty "Tasks:" heading.
- Fix: f265092a. The harness passes the persona's real (empty) situation; an empty account says "none on file".
  Production parity, not brain improvement.
- Re-run: 39545335380: g5 32/32/33, g41 34/36/34 (re-score); the phrase is gone from every failure reason. Kept.

### Judge-2 repair
- Failure: run 39541224991, gpt-4.1-mini HTTP 400 on all 38 items.
- Why: callers write `{ ...modelConfig(env), model: X }`; reasoning effort chosen for the default model rode along.
- Line: `model_gateway.ts` toOpenAI `if (cfg.reasoningEffort) body.reasoning_effort = ...`.
- Fix: 470b5246. Effort and headroom follow the request's model. Test fails without it.
- Re-run: 39546674445: gpt-4.1-mini scored every item of every pass, 0 judge errors.

### Fix (c1): harness stores (reverted)
- Failure: H031 in all three passes of 39545335380.
- Why (believed): the harness passed no standing-instruction or resume stores, so tools threw "not kept here".
- Fix: da93085c. Re-run 39546674445: both CI judges 28/27/31 vs (b) 32/32/33, H031 still failed 3/3. Reverted
  (89355c81). The re-run showed the real cause: with a store, the brain saved "use my research resume" as an
  instruction and confirmed it, never checking that such a resume exists. Brain cause, not harness.

### Fix (c2): a missing record said plainly, first
- Failure: the empty-state family in every run (second judge: 7-8 of ~10 failures).
- Why: asked to act on a record that is not there, the brain saved or confirmed around it, or gave a next step
  without saying there is none.
- Line: `prompt.ts` "Their own records ..." rule had no "check it exists before acting" step.
- Fix: fa98a8a8. Check the named record exists before acting on, saving or confirming it; if not, the first
  sentence says "You don't have [that record] on file yet." and the one step that adds it.
- Re-run: 39548093320: both CI judges 33/34/34 (best so far); H012, H014, H023, H029, H030, H032 pass 3/3; H031 one
  judge in one pass. Kept. It caused H004 (below).

---

## Run 39548093320 (brain fa98a8a8, fix (c2)): every failure

### H004 (p1 g5+g41, p3 g5): "says Friday" - REGRESSION from fix (c2)
- Why: the person states a fact about their own interview (a day). Fix (c2)'s rule sends the brain to check for a
  record first, finds none, and answers "the interview isn't on file" instead of recording the day they said. Before
  c2 it failed once in all earlier passes (run 39540312167).
- Line: `prompt.ts` "Before you act on, save or confirm anything that names one of their records ..." applies to
  facts the person reports, which the rule "When they report something that happened ... record it now" covers.
- Fix: scope the c2 rule to records Trainee keeps or made (a resume, an application, a draft, a list, a match),
  never to a fact the person is telling you now: that is recorded as they said it and confirmed in their words.
- Re-run: pending (after H006, one fix at a time).

### H006 (p2 g5+g41): "offers career help instead" - unstable across runs
- Why: the prompt says "You cannot ... check the weather: say so, and offer the closest thing you can do for their
  search." For a weather question "the closest thing" reads as weather help (sources, apps), so the model offers
  those in some passes. Also: the words "check the weather" in that line came from the held-out item (prompt pass
  188d8116, 2026-10-20, before the read rule): a held-out phrase in the prompt; removed.
- Line: `prompt.ts` line 69 (at fa98a8a8).
- Fix: for anything outside their job search, say so in one line, then one concrete thing for their job search;
  never point them to another way to get the off-topic thing. No item wording in the prompt.
- Re-run: pending (next).

### H007 (p1 g5): "sets up the watch, or says exactly what one thing it needs"
- Why: not yet traced. The reason says it described a watch configuration without saying it was set or naming the
  one missing thing. One judge, one pass of three: possibly variance.
- Fix: none until traced; watch the next runs.

### H009 (p2 g41): "confirms the move to the onsite stage"
- Why: not yet traced; one judge, one pass. Watch.

### H010 (p1, p3 g5): "asks a next interview question"
- Why: not yet traced. The reason says the brain gave a prompt and asked them to continue but did not ask the next
  question itself. Fails g5 only, 2 of 3 passes. Possibly the mock-interview flow or the brain answering a practice
  turn as coaching. To trace before fixing.

### H026 (p1 g5): "confirms it will track it, or says exactly what it needs"
- Why: the second judge's H026 p3 finding (39543405447) is a product bug: "I'll text only in your quiet hours
  22:00-07:00" inverts quiet hours. The tool tells the model `quiet_hours: "22:00-07:00"` and the person block says
  "quiet 22:00-07:00", a range with no meaning attached; the model read it as when it may text. The code's own
  quiet-hours logic is right (career_alerts.ts isQuiet: no texts inside the range).
- Lines: `career_tools.ts` set_job_alerts result `quiet_hours: \`${quiet_start}:00-${quiet_end}:00\``; digest result
  the same; `memory.ts` alertLine "quiet ${p.quiet_start}:00-${p.quiet_end}:00".
- Fix: say what it means: "no texts 22:00-07:00 (quiet hours); texts allowed 07:00-22:00". Queued after H025.

### H031 (p2 g5): "says no research resume is on file and asks them to add it"
- Why: in that pass it said there are no standing instructions on file but did not ask them to add the resume.
  One judge, one pass, after (c2). Watch.

### H034 (p3 g5+g41): "names realistic entry routes for a cashier moving into computer work"
- Why: not yet traced; the reason says it asked to confirm instead of naming routes. The advice rule ("give the
  substance now") exists; to trace before fixing.

### H036 (p1 g5+g41): "names the few things it needs plainly"
- Why: the prompt says "One question at most per reply. Never a list of things you need: pick the single most
  important missing thing". The item asks it to name the few things it needs; the rule forbids exactly that. A
  conflict in the prompt, not a model slip. Fails in most runs.
- Line: `prompt.ts` "One question at most per reply. Never a list of things you need ...".
- Fix: to decide with the training doc (Part 8 Rule 1: "bundle the questions you know you'll need"). Queued.

### H038 (p2, p3 g5): "prepares it for their approval or says plainly why it cannot right now"
- Why: not yet traced; the reason says it offered to search and asked for confirmation. Possibly the same family as
  (c2): the posting is not in its list, and it should say so first. To trace.
