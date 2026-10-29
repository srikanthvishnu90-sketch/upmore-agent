# WO-110: facts follow the person into a new thread

Status: ready · Depends on: none · Size cap: ~250 lines · Assignee: any

## Why
`evals/career/task-context-brutal.ts` (rubric `task-context-brutal.md`): the **memory** dimension scores 1.6/5 and **context** 1.6/5 on the
router path. In a new thread (`thread: "B"`) a person with a confirmed resume (4 years ICU nursing, Chicago, SQL and Tableau) and a standing
"I need sponsorship (F-1 OPT)" is met with "Nothing is on your record yet" (T08.1, verbatim: "Nothing is on your record yet. The record holds only
what you state in chat ...") and a greeting that asks who they are (T20). Confirmed profile facts live in the thread's snapshot
(`ctx.profile`); only `stated_facts` kinds ride the account (`career_host.js:80-150`, `mergeStatedFacts`, and the SQL-kind split), so a
fact confirmed from a resume in thread A is invisible in thread B.

The agent brain reads the person through `known` (`situationFrom`, `career_situation.ts`) and `ctx.profile`. `career_situation.ts` carries standing
instructions, alerts, applications and interviews but no confirmed profile facts (grep finds none). Verify live before building: run T07, T08, T20
with `--brain agent`; if the agent already recalls the facts through a tool, this order shrinks to the router fallback.

## What
Confirmed profile facts (kind, text, confirmed) are read from the account for every turn in every thread and put in the agent's person block;
the router seeds `ctx.profile` from them when the thread's own profile is empty. A fact is shown with its source ("from your resume",
"you told me on Oct 12"); unconfirmed drafts never ride. Corrections still replace across threads (WO-095 rules).

## Files
`supabase/functions/_shared/career_situation.ts` (add `facts`), `supabase/functions/agent-chat/career_brain.ts` (person block),
`supabase/functions/_shared/career_host.js` + `packages/domain/142-career-router.js` (seed), tests.

## Acceptance
Brutal scenarios T07, T08, T20, T16.2, T19.2 reach 5.0 on memory and context with `--brain agent` and `--brain router`; a unit test per path that a
fact confirmed in thread A is on the record in thread B and an unconfirmed draft is not. The eval fixtures are the acceptance; no edits to them.

## Out of scope
New fact kinds, resume parsing, the SQL validator.
