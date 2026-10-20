# WO-051: a model's second opinion on the mail the rules are unsure of

Owner target (unchanged): 95%+ of application status changes read from the person's own mail, at 97%+ precision. On
blind300 (independent, harder SYNTHETIC mail; committed and spent) the rules scored **95.7% / 83.3%** after WO-050. More
rules fit the author's voice. This order builds a model second opinion for the mail the rules leave uncertain, behind a
switch that stays **off**. Nothing here calls a model: every test uses a stub, no key was used, nothing was spent.

Labels: **VERIFIED** (measured here, command shown), **SYNTHETIC** (hand-written mail), **NOT_RUN**, **ASSUMED**.

## 1. Result in one paragraph

The second pass WO-040 built (ambiguous "other" mail only) is widened into a second opinion on every message the
classifier's own scores leave unsure, with every safety rule enforced in code after the model answers, a strict answer
schema, a per-person daily cap counted in the database, and the sender's address no longer sent. With
`CAREER_MAIL_MODEL` unset, the rules read all 2,564 committed emails byte-for-byte as before and the run plans exactly what
the rules plan (VERIFIED, WO-051/E1). On the committed splits **11.0%** of mail would be sent (0-18% by split; blind40's
30 emails 43%), before the filter that needs an application on file (VERIFIED, pure computation). **Model quality is
NOT_RUN.** Its ceiling is low: of blind300's 41 rule mistakes only **9** are among the mail sent (18 are a guard's
decision, 3 confident readings, 11 name no application), so a perfect model lifts blind300 by at most 9 emails and cannot
reach 95% recall alone. The privacy decision is the owner's (D-025, pending).

## 2. Design

**Switch.** `CAREER_MAIL_MODEL=on` on career-proactive (WO-040's switch; `index.ts` unchanged). Off or unset: no wiring, no
claim, no call, the rules alone. On without `OPENAI_API_KEY`: `NOT_WIRED` with the one-line ask.

**Uncertain** (`certainty`, `career_mail_model.ts`). Only mail the scorer itself read: never a guard's decision (scam,
look-alike, calendar notice, forward, noise, alert sender; nor "other" from a post-scorer guard: job board, personal
address, cold outreach, no job word, a scheduling tool naming no employer and job). Of that mail, the softmax share of the
scores (`mailScores`) decides:
- a status kind under `UNCERTAIN.kindSure` = **0.80** of the share ("weak");
- "other" with a status kind at `UNCERTAIN.otherNear` = **0.10** or more ("near"), or WO-040's ambiguous flag.
Both numbers were chosen on the read splits only (dev, dev4-dev7: 11.0% sent there) before any blind split was looked at.
Then WO-040's filters (`neverSent`, `toAsk`): it names an application (`APP_REF`), no marketing desk, no look-alike, no
instruction to a model, arrived after the last read, and could be about an application on file (`candidates`).

**Sent** (`mailModelPayload`): `From: <display name> (domain <domain>)`, the subject (300 characters) and the Gmail snippet
the classifier already reads (400), every email address and every 6+ digit number masked, `store: false`. Never the
sender's address, the person's address, the body, an attachment, the date or the message hash (comment in the module;
WO-051/P1). The wiring adds `response_format` with a strict JSON schema (`MAIL_VERDICT_FORMAT`: `kind` in the six kinds or
`none`, numeric `confidence`, no other field); the gateway now passes a `json_schema` response format on to OpenAI.

**After the answer** (`opinion`, `secondPass`), whatever the model said:
- read strictly: the whole answer must be the JSON object, the kind spelled exactly, confidence a number in [0, 1]; else
  ignored. Under 0.85 confidence: ignored;
- a rejection is never turned into an interview, a test, an offer or a recruiter's reply: the rules read a rejection, or
  any rejection family fired (decisive or soft) (`rejection_kept`);
- a calendar or scheduling tool's notice is never changed (`calendar`): an interview there still needs the interview, the
  employer and the job, and is evidence only;
- a forward counts only through the original sender it shows (`forward_no_sender` otherwise), and stays `via: "forward"`,
  which never confirms (planUpdates);
- the model's "received" never starts tracking: dropped on "other" mail (`kind_not_allowed`), and against a step the rules
  read it only holds that step back (`received_held`);
- an offer from the model is kept only on the employer's own authenticated mail for an application on file
  (`fromEmployer`; `offer_not_employer`), and planUpdates only says it ("may be an offer"), never moves a stage;
- "none" turns an unsure status into "other" (it can only hold a step back);
- as in WO-040: anything the model decided needs the employer's own mail and an application on file; its offer and
  rejection are only said; it never names the employer or writes a word the person reads.

**Cost.** Per person per run 20 (WO-040), per run 300 (WO-040), and **200 a person a day**, claimed before any call through
`MailStore.claimModelCalls` (`career_mail_model_claim` in `20261021130000_career_mail_model_calls.sql`: the database's UTC
day, a per-person advisory lock, the cap clamped to 200 in SQL, service role only). A store that cannot count grants none.
Each person's calls are one `agent_turn_costs` row (WO-040's meter). Run stats gain `mail_model_capped`.

## 3. Interfaces

- `career_mail.ts`: `mailGuards(m) -> { calendar, forwarded, decidedAgainst, rejectionWords }` (new, read-only; the
  classifier's output is unchanged, WO-051/E1).
- `career_mail_model.ts`: `UNCERTAIN`, `MAIL_MODEL_DAILY_CAP`, `certainty(m, rules?)`, `neverSent(m)`, `senderShown(from)`,
  `MAIL_VERDICT_FORMAT`, `VERDICT_KINDS`, `readVerdict(msg, strict?)`, `opinion(m, verdict, rules?, o?)`; `toAsk`,
  `secondPass`, `mailModelPayload`, `mailModelWiring` keep their WO-040 signatures.
- `career_mail_store.ts`: `MailStore.claimModelCalls?(userId, want, cap, now) -> granted` (memory and Supabase).
- `career_proactive_run.ts`: `MailStats.model_capped`; `handler.ts`: `mail_model_capped`.
- `model_gateway.ts`: `toOpenAI` passes `response_format` of type `json_schema`.
- `evals/career/mail-model-eval.ts`: `allSplits`, `HELD_OUT`, `selection`, `reach`, `score`, `withModel`.

## 4. Numbers (SYNTHETIC; VERIFIED; no model)

`deno run --allow-read evals/career/mail-model-eval.ts`. "Sent" assumes an application at every employer (the most sent).
"Reach": the rules' mistakes among the mail sent, i.e. the most a perfect model could fix; held-out splits print no labels.

| Split | Emails | Unsure | Sent | Reach (mistakes sent / all; not sent: guard, sure, names no application) |
|---|---|---|---|---|
| dev | 332 | 31 (9.3%) | 23 (6.9%) | 0/2 (1, 0, 1) |
| devcheck | 33 | 1 | 0 (0.0%) | held out |
| holdout | 50 | 5 | 5 (10.0%) | held out |
| blind40 | 30 | 19 | 13 (43.3%) | held out |
| dev4 | 260 | 49 | 34 (13.1%) | 4/8 (2, 1, 1) |
| dev4check | 88 | 17 | 9 (10.2%) | held out |
| blind160 | 160 | 16 | 13 (8.1%) | 0/1 (1, 0, 0) |
| dev5 | 190 | 34 | 25 (13.2%) | 0/0 |
| dev5check | 63 | 14 | 8 (12.7%) | held out |
| blind200 | 200 | 26 | 15 (7.5%) | 1/1 |
| dev6 | 239 | 28 | 14 (5.9%) | 2/5 (3, 0, 0) |
| dev6check | 78 | 12 | 5 (6.4%) | held out |
| blind240 | 240 | 39 | 21 (8.8%) | 1/3 (2, 0, 0) |
| dev7 | 225 | 61 | 41 (18.2%) | 1/6 (4, 1, 0) |
| dev7check | 76 | 24 | 11 (14.5%) | held out |
| blind300 | 300 | 82 (27.3%) | 44 (14.7%) | **9/41** (18, 3, 11) |
| all | 2564 | | **281 (11.0%)** | |

**Model quality on any split: NOT_RUN.** Rules + model precision and recall, the confusions with a real model, and the real
cost are not known. On a real inbox most mail names no application on file, so far less than 11% would be sent (ASSUMED).

**Payload size:** 1,425 characters on average with the schema (max 1,522), about 400 input tokens (ASSUMED, 4 characters a
token); the answer is about 15 tokens of JSON plus whatever the model reasons at minimal effort: 20-150 output tokens
(ASSUMED). At the gateway's price table for the career model, $0.0001-0.0004 a call (ASSUMED).

**The owner's one command** (spends about **65 calls, $0.01-0.03**, ASSUMED):

```
OPENAI_API_KEY=... deno run --allow-read --allow-env --allow-net=api.openai.com evals/career/mail-model-eval.ts --model live --only blind300,blind240
```

It prints, per split, rules-only against rules + model (precision, recall, rejection read as interview, status read as
another status), each override's count, the model's offers, and the cost from the gateway's meter. Without the key it prints
`NOT_RUN` and exits 0 (WO-051/V1). Not run here.

## 5. Decision (D-025, pending the owner)

`docs/architect/DECISIONS.md` D-025: what is sent to OpenAI and what never is, which mail, why, the switch, what the answer
can and cannot do, the cost estimate (tokens a call x calls a day; the 200 cap's worst case is about $2.40 a person a month,
above D-002's $1; lower `MAIL_MODEL_DAILY_CAP` to 60 to stay under it), and that the migration must be applied first.
Marked **pending owner**; WO-051/D1 fails if it is marked settled.

## 6. Tests: `tests/architect/wo-051-mail-model.test.ts` (15)

| Test | Covers |
|---|---|
| E1 | off is today: sha256 of every committed email's classification (2,564) equals the branch point's; the switch is only `CAREER_MAIL_MODEL=on`; the run with no model on every split asks nothing, claims nothing, and records and texts exactly what `planUpdates` with the rules alone does |
| U1 | only unsure mail is asked; sure readings, guards (calendar, scheduler, forwards, cold outreach) never |
| U2 | the sent counts per split (section 4), under 25% on every read split, 11% overall |
| P1 | the payload: name and domain, subject, snippet, masked; no address, date, hash; the comment says so; the strict schema reaches OpenAI's request; the sender's address never does |
| J1 | answers outside the strict schema are ignored (prose, another spelling, "other", a string, out of range, an array, no confidence) |
| S1 | a rejection (or a rejection's words) never becomes interview, test, offer or reply; the model's rejection is only said; with a stub saying "interview" or "offer" to everything, no labeled rejection becomes a step forward on any read or spent split |
| S2 | calendar and scheduling-tool notices are never changed |
| S3 | a forward only through its original sender, and it moves nothing |
| S4 | the model's "received" never starts tracking; against a rules' step it holds it back |
| S5 | the model's offer needs the employer's own authenticated mail for an application on file, and is only said |
| S6 | "none" holds an unsure step back; low confidence leaves the rules; agreement changes nothing |
| C1 | the daily cap: 195 used, 20 asked: 5 calls, 15 capped; spent for the day; a new day; a caller cannot raise it; a store without a counter asks nothing; the SQL holds 200, the lock, the database clock, service role only |
| K1 | one `agent_turn_costs` row with calls, tokens and price; the clear rejection is never asked |
| V1 | the live eval without a key prints NOT_RUN and exits 0; a stub saying "none" only holds steps back |
| D1 | D-025 says what is sent, why, the switch, the cost, and is pending |

WO-040's 24 tests pass unedited (its second-pass tests now run through the widened selection and the strict reading).

**Planted defects.** Each a one-line change, planted one at a time and reverted; the runner executed the WO-051 and WO-040
tests (all passing at baseline). VERIFIED with a throwaway runner, not committed.

| # | Defect | Caught by |
|---|---|---|
| D1 | the rejection guard removed | S1 |
| D2 | the calendar / scheduling-tool guard removed | S2 |
| D3 | a forward read through the forwarder, not the original sender | S3 |
| D4 | a forward without its original sender counts | S3 |
| D5 | the model's "received" allowed | S4, WO-040/M3 |
| D6 | the model's offer needs no employer mail | S5 |
| D7 | the run reads answers leniently (prose, any case) | J1 |
| D8 | the sender's full From line is sent | P1 |
| D9 | every status reading counts as unsure (`kindSure` 1.01) | U1, U2, K1, WO-040/M1, WO-040/W3 |
| D10 | a post-scorer guard's "other" counts as unsure | U1, U2 |
| D11 | low confidence accepted | S6, WO-040/M2 |
| D12 | the daily claim skipped | C1 |
| D13 | the cost not recorded | K1, WO-040/W1, WO-040/W4 |
| D14 | the gateway drops the answer schema | P1 |
| D15 | the classifier's share bar moved (0.5 to 0.49) | E1 |

## 7. Honesty log

- **Read:** CLAUDE.md, AGENTS.md, DECISIONS.md, WO-043 and WO-050 in full (WO-045 and WO-046 only as WO-050 summarises them); the classifier, the
  WO-040 second pass and its tests, the run, the store, the gateway, the eval scripts.
- **Thresholds** were chosen on the read splits (tune, tune2, dev3, dev4-dev7) only. After they were fixed, the selection
  report was run once over every split: held-out splits are counted without reading a label; for the spent blind sets the
  report counts how many rule mistakes fall in the mail sent (aggregates only; no blind item was printed or read).
- **One change after a spent split spoke:** S1's stub run ("interview" to everything) failed on blind300 (one labeled
  rejection, read by the rules as unsure with no decisive rejection word, became an interview). The guard was widened on
  principle to every rejection family (soft cues too: regret, closer, decision, future) rather than read the item; S1 then
  passed on every read and spent split. This makes blind300's later live score slightly optimistic on that confusion.
- **Never read:** anything under `/tmp` or any path with "sealed" in it. Throwaway scripts (the baseline hash, the probes,
  the token count, the defect runner) lived in an untracked folder in the worktree and are not committed.
- **No model was called**, no key used, nothing spent, no migration applied, nothing deployed.

## 8. Gate (VERIFIED on this branch, after merging trunk 4558945f)

- `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`: 539 passed, 0 failed.
- `python3 scripts/build-router-core.py --career-only --check`: router bundle verified (no bundled file changed).
- `deno check` on the changed modules and the eval: passes.

## 9. Demo (owner)

- `deno run --allow-read evals/career/mail-model-eval.ts` prints section 4's table.
- `deno run --allow-read --allow-env evals/career/mail-model-eval.ts --model live --only blind300` without a key prints NOT_RUN.
- `deno test -A --no-check tests/architect/wo-051-mail-model.test.ts` runs the 15 tests.

## 10. Files

- `supabase/functions/_shared/career_mail_model.ts` (certainty, payload, strict reading, opinion, cap);
- `supabase/functions/_shared/career_mail.ts` (`mailGuards` only);
- `supabase/functions/_shared/career_mail_store.ts` (`claimModelCalls`);
- `supabase/functions/_shared/career_proactive_run.ts`, `supabase/functions/career-proactive/handler.ts` (claim, capped);
- `supabase/functions/_shared/model_gateway.ts` (`response_format` passed on);
- `supabase/migrations/20261021130000_career_mail_model_calls.sql` (not applied);
- `evals/career/mail-model-eval.ts`; `tests/architect/wo-051-mail-model.test.ts`;
- `docs/architect/DECISIONS.md` (D-025); this document.
