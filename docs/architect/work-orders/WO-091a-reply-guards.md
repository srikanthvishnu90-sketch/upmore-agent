# WO-091a: the reply guards (claims, facts about the person, internal words)

Status: in review. Builder: architect (fix lane). Depends on: WO-077, WO-080 (both on `trunk`).

## Why: audit chat-brain F5, F6, F10, and the brutal battery (run 39500971945)
The end of the agent turn is the one place every chat reply passes through. Until now it ran one check (WO-077's claim
regexes), and that check did harm.

### F5: the claim check deleted correct answers and replaced them with a promise
- BR-062, "Is the SWE market bad right now?" → "I haven't actually done that yet: nothing was saved, set up or queued
  this time. Tell me again and I'll do it."
- BR-036: the shorter draft was replaced the same way (the turn's `add_profile_fact` had failed).
- BR-042, "share my resume with your whole network": the same text promised "I'll do it" for an act no tool can do and
  policy forbids.

Why-chain:
1. `unbackedClaim` ran regexes over every sentence. `alerts? (is|are)? (now)? (set|on|live|active)` matched advice such
   as "Keep job alerts on…", and `i('ve| have)? (…|noted|…)` matched "As I noted earlier…".
2. `NEGATED` looked only before the match, so "Your alerts are live only once you say yes" counted as a claim.
3. If any regex still hit after the one rewrite, the whole reply was replaced with `CLAIM_UNBACKED_REPLY`, not just the
   offending sentence.
4. The replacement itself promised a future action ("Tell me again and I'll do it") that code could not know a tool
   could do.
5. Root: a lexical guard standing in for a structural fact, with a whole-reply penalty.

### F6: chat replies and drafts invented facts about the person
- BR-032: "Excel/finance club treasurer experience (confirmed …)". Excel was never said.
- BR-024: the cover letter claims experience the facts do not hold.

Why-chain:
1. D-007 was enforced at the fact doors (saving, confirming) and on two artifacts: outreach drafts (`outreachLock`) and
   resumes (the tailor's truth check).
2. The free-text chat reply, where cover letters, recruiter emails and "which skills match" answers are written, went
   through no fact check.
3. Root: the fact lock was built per artifact, not at the one boundary every reply passes through.

### F10: tool vocabulary reached the person
The battery's `no_internal_vocab` check failed on `job_id` (BR-001), `get_posting` (BR-008), `referral_map` (BR-041),
`remote_ok` (BR-064, BR-090) and `full_name` (BR-077). BR-021 printed a raw id, `greenhouse:copperlineinfra:4100016`.

Why-chain:
1. Tool results and errors speak to the model in schema words, and the model repeats them.
2. Nothing on the reply stopped tool names or snake_case keys.
3. Root (reply side): no filter at the boundary. The history side (tool results vanish between turns) is out of scope
   here.

## What changed
`supabase/functions/_shared/agent/loop.ts`:
- **Claims (F5).** A claim is first-person past or present-perfect action language: "I've set an alert", "I saved…",
  "Saved:", "Done — alerts…", "I queued…", "Queued 1 application", "I sent the email", "I've applied you to…". These
  are not claims:
  - advice and imperatives: "Keep job alerts on", "Set an alert for…", "Turn alerts on if…";
  - "As I noted";
  - questions.

  A negation clears a claim only inside the claim's own clause, either before the claim ("Nothing was queued") or
  directly on it ("I queued none of them"). Clauses split at commas, semicolons, dashes and the coordinators and, but,
  or, so, yet, although, though, while and whereas. A negation in another clause leaves the claim standing: "I've
  saved your preference, but nothing was sent" is still a claim. This was changed in the PR #123 review; the order first
  said "negation anywhere in the sentence", and that let this sentence through. A condition before the claim, or in the
  claim's own clause, also clears it ("live only once you approve"). What a "Saved:" label saves, and anything quoted,
  are the person's words, so they negate nothing ("Saved: you never want agencies" is still a claim). Typographic apostrophes
  are read as plain ones. A new kind, "something sent or applied for", is never backed inside the turn, because external
  effects never run there.
- **The rewrite.** One check per turn, in one message, covers an unbacked claim, internal words and untraced facts. The
  WO-077 wording stays: "no tool that does that succeeded this turn". Then code acts:
  - **Claims:** only the sentences that make an unbacked claim are dropped; the rest of the reply, and its line breaks,
    stay. If nothing is left, the reply is `CLAIM_UNBACKED_REPLY`, now "I didn't change anything this time." That line
    promises nothing.
  - **Leaks:** stripped (`stripLeaks`).
  - **Untraced facts:** bracketed (`bracketUntraced`).
- Tool results that succeeded this turn are kept (`seen`) as fact sources and as the postings behind any raw job ids.

`supabase/functions/_shared/agent/reply_guards.ts` (new):
- `pieces`/`rebuild`: a reply as sentences with their separators, so one sentence can go and the rest is rebuilt
  unchanged.
- **Fact lock on the reply (F6).** This reuses `factLock` from `essay_draft.ts`, the same lock `outreachLock` runs
  inside, and adds no second lock.
  - **Which clauses are checked:** a clause about the person: "your/my …", "I/you built/used/led/worked/studied…",
    "I'm a/you're a…", "(confirmed …)", or "gave me…". A clause that negates or names a gap is not checked, and neither
    is a question.
  - **Sources:**
    - confirmed facts (not drafts; memory.ts's rule) and the account's stated facts;
    - this turn's message;
    - the person's earlier messages (never the model's own replies);
    - this turn's tool results.
  - **What counts as an untraced claim:** an untraced word only where the clause attributes it to the person:
    - a known tool or skill;
    - a tech token or acronym after a skill cue ("experience with ETL");
    - a degree;
    - a title after "as a / I'm a / your role as";
    - a year, money or percent;
    - a count of years or people;
    - a name after "at / from".

    Ordinary capitals ("Strong", "Hiring", "your Fieldnote recruiter", "your Trainee extension") do not count.
  - **Code's last resort:** a placeholder: `[your skill]`, `[your title]`, `[your degree]`, `[number]`, `[month]`,
    `[result]`, `[employer or school]`. Text already in brackets and links are never touched.
- **Leak filter (F10).** It finds any tool name from this turn's tool list, any snake_case word, any uuid and any raw
  `board:slug:id` id, or any id-like posting id from this turn's tool results. A word the person typed themselves, and
  anything inside a link, is left alone. Code's last resort:
  - a known job id becomes "title at company" from this turn's tool results, or just goes when the sentence already
    names that posting;
  - an unknown id or uuid goes, and empty brackets are tidied;
  - a field or tool name becomes plain words (`remote_ok` → "remote ok").

`supabase/functions/_shared/essay_draft.ts`: the fact lock's word lists (`TOOLS`, `TITLES`, `DEGREES`, `SCALE`) are
exported so the reply lock can tell which untraced word is which kind. The lock itself is unchanged.

Code's own text is never filtered: a shown batch (`turn.show`), the step-limit and model-error replies.

## WO-077's tests
They stay green and unedited. WO-077/2 and /4 assert `reply === CLAIM_UNBACKED_REPLY` for a reply whose only sentence is
an unbacked claim. Under this order that is exactly the "nothing remains" case, so they now assert the neutral line.
The guarantee they protect still holds: a reply never says something was saved, queued, set or tracked when no tool did
it this turn. WO-077/1, /3, /5 and /6 run as before. Trunk moved twice while this was built, and both sets of tests
pass here: WO-080's 14 tests (rebased onto 5f7efe45 before the PR opened), and WO-091b's tests (trunk 30b8b305, taken
in with a merge commit after review).

## Tests: `tests/architect/wo-091a-reply-guards.test.ts` (20 tests, scripted models, no provider)
- **F5.1–F5.7:**
  - BR-062 advice returned unchanged with no extra call;
  - imperatives, "as I noted", negations and conditions are not claims;
  - first-person past action language is a claim (typographic apostrophes; "sent" never backed; one sentence with a
    backed and an unbacked claim);
  - F5.3b and F5.3c, added in the review: a negation in another clause does not clear a claim. These still claim:
    - "I've saved your preference, but nothing was sent."
    - "Nothing was queued, and I've set an alert for Stripe."
    - "Not yet; I've set an alert…"
    - "…preference — no email went out."

    Negations in the claim's own clause still clear it: "I haven't saved anything yet.", "I didn't queue them.",
    "Nothing was queued.", "I queued none of them." In a whole turn, the saved-preference sentence is put to the model
    once, then dropped, and the rest of the reply stays;
  - sentence-level drop keeps a draft;
  - BR-036's shorter draft survives its failed save;
  - BR-042's refusal stays with no promise;
  - nothing left gives the neutral line.
- **F6.1–F6.6:**
  - "Your Excel skills…" with no Excel in confirmed facts: one rewrite is asked, naming Excel and the brackets, then
    Excel becomes `[your skill]`;
  - the model's own bracketed rewrite stands;
  - traced facts pass untouched with no extra call;
  - the sources are checked one by one: the message, earlier user turns and tool results trace; an earlier assistant
    turn and a draft fact do not;
  - BR-032's real skills answer loses the unbracketed Excel and keeps SQL, Copperline, $4,000 and the gaps list;
  - BR-024's real cover letter loses "ETL" and keeps every traced fact and its own placeholders.
- **F10.1–F10.5:**
  - BR-008: a tool name is put to the model, then removed;
  - BR-021: a raw id becomes "Software Engineer, Platform at Copperline Infra", or just goes when the sentence already
    names it;
  - field names, a uuid and an unknown id go, while a link and the person's own `user_id` stay;
  - BR-041/BR-064: one check message covers a claim, a leak and a fact together;
  - a shown batch is never filtered.

## Evidence
- **Fail first:** against trunk's `loop.ts`, 18 of the 20 fail. The 2 that pass guard against over-reach (traced facts
  untouched; code's own text untouched). The review's 2 new tests, F5.3b and F5.3c, also failed against this PR's first
  version and pass now.
- **Architect suite** (`deno test -A --no-check --ignore=tests/architect/pending tests/architect/`): trunk 30b8b305 has
  658 passed; this branch, merged with that trunk, has 678 passed and 0 failed.
- **Edge suite** (`deno test -A --no-check tests/edge/`): 869 passed on trunk and 869 passed on this branch. No new
  failures.
- **`deno check`:**
  - `loop.ts`, `reply_guards.ts`, `essay_draft.ts`, `career_outreach.ts`, `agent-chat/career_brain.ts`;
  - the new test;
  - `evals/career/run.ts`, `evals/career/run-conversations.ts`.
- **Precision on real replies.** Every agent reply in battery run 39500971945 was replayed through the guards: 117
  replies, excluding those already replaced by the old check. Each turn's own tool calls, with their real ok or failed
  results, were replayed with the persona's facts. 8 replies changed, and all 8 are true positives:
  - 7 leaks: BR-001 `job_id`, BR-008 `get_posting`, BR-021's raw id, BR-041 `referral_map`, BR-064 `remote_ok`, BR-077
    `full_name`, BR-090 `remote_ok`;
  - BR-024's "ETL".

  Nothing correct was dropped. A first draft of the classifier also bracketed "your Trainee extension", "your LinkedIn
  connections", "your password manager" and "24–48 hours". Those false alarms led to the attribution cues above, and
  none remain. After the clause-scoped negation change, the replay was run again, on the code merged with trunk
  30b8b305. The same 8 replies changed, with byte-identical diffs, and there were no new false positives.

## Demo
`deno test -A --no-check tests/architect/wo-091a-reply-guards.test.ts tests/architect/wo-077-claims.test.ts`

## Cost
At most one extra model call per turn, shared by all three guards, and only when a reply trips one. In the replay, 8 of
117 replies tripped one.

## Out of scope / not covered
- **Inventions made of traced words.** BR-024's "built React-based dashboards in coursework" and "used SQL daily" use
  only words found in the facts (React, SQL). A word-level lock cannot see an invented activity. That needs a
  claim-level check (an LLM judge or structured drafting), which is a separate order.
- **The history side of F10.** Keeping the turn's listed postings in `agentMeta` and allowing picks by number is not
  done here, and neither is rewording tool errors in `career_tools.ts` (T:197, 377, 380). The filter catches what still
  leaks.
- **Clause splitting is lexical.** A negation before the claim with no comma or coordinator between them still counts
  as the claim's own clause. For example, in "No worries I've saved your preference", the "No" clears the claim.
- **Promises in the future tense** ("I'll watch for new roles") are not claims here. Only "I'll keep/remember that"
  stays a claim (WO-077/5).
- **Code's plain-word replacements are blunt.** `get_posting` becomes "get posting". The model's one rewrite is the
  real fix, and the replacement is the floor.
- **A claim about an earlier turn** ("I saved that yesterday") is still read as this turn's claim (as in WO-077).
- F1–F4 and F7–F13 of the same audit.
