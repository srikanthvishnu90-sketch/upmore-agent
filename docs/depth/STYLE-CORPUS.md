# STYLE-CORPUS: the response-style examples in every chat prompt (packet added for G4)

`packages/domain/75-style-corpus.js` parses the owner's five corpus files (`corpus/upmore-convo-corpus-N-of-5.txt`,
built into `corpus/corpus.json` by `node scripts/build-style-corpus.cjs`), picks the examples nearest the person's
message (lexical TF-IDF over the example's user turns and title, with topic boosts; the four safety examples always in)
and renders the block the chat reply (`supabase/functions/agent-chat/handler.ts`, the per-message `systemDynamic`) and
the financial planner (`plannerModel` style in `supabase/functions/_shared/model_gateway.ts`) append to their system
prompts on every message. The hard rules come first and outrank every example.
Check: `node --test tests/depth-STYLE-CORPUS.test.cjs && node evals/depth/run.cjs STYLE-CORPUS`.

Bug this packet pins, written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S18 (found here): example 5.14 "Verification code" shows the assistant asking "Text it to me and I'll use it" with the
  note "One-time codes OK in chat". The owner's standing rule (CLAUDE.md, secrets never travel through chat) is that the
  agent never asks for a password, code or card in chat. "hulu sent me a verification code" picked 5.14 first, so the
  prompt taught the model the opposite of the rule (and `guardSecretAsk` had to strip the reply afterwards). Now an
  example that breaks a standing rule is in `RULED_OUT` and never selected, and the hard rules say "Never ask for a
  password, a one-time code, a PIN or a card or account number in chat". D18 empties the list; D19 drops the rule.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Every example parses | 79 examples, the last of each file included | `S01` in tests/depth-STYLE-CORPUS.test.cjs | the example open at the end of a file is never flushed, so 5.17 and the other last examples are lost | proven (also fails S02, S03, S04, S05, S16) |
| S02 | Each line is its role | 1.15 reads user, assistant, context, assistant | `S02` in tests/depth-STYLE-CORPUS.test.cjs | a parenthesised line is context only before the first turn, so a mid-conversation pause is glued onto the reply above | proven |
| S03 | A wrapped line stays in its turn | the card's second line joins the card | `S03` in tests/depth-STYLE-CORPUS.test.cjs | a wrapped line becomes a new context turn | proven |
| S04 | A card is the assistant's | a person typing [CARD] is not a card | `S04` in tests/depth-STYLE-CORPUS.test.cjs | any turn with [CARD] marks the example as showing a card | proven |
| S05 | A section rule ends the example | the thesis prose after ===== is not a turn | `S05` in tests/depth-STYLE-CORPUS.test.cjs | only a run of # ends an example; the prose after ===== is glued onto the last reply | proven |
| S06 | Tags from the title and every turn | 5.06 Scam pattern is fraud, 4.12 is emotion | `S06` in tests/depth-STYLE-CORPUS.test.cjs | tags are read from the title alone | proven (also fails S10, S11) |
| S07 | Sloppy texting | sned mom 100 rn finds the rushed-send example | `S07` in tests/depth-STYLE-CORPUS.test.cjs | the sned typo is not mapped to send | proven |
| S08 | Amounts are the word money | $1,250.50 is one money token | `S08` in tests/depth-STYLE-CORPUS.test.cjs | the amount pattern stops at the thousands comma, so $1,250.50 is money plus a stray number | proven |
| S09 | Filler words carry no weight | 'can you please send it to me' is send | `S09` in tests/depth-STYLE-CORPUS.test.cjs | the stop words are not removed | proven (also fails S07, S08, S10) |
| S10 | The nearest examples lead | cancel netflix is 4.03, my dad passed is 5.10 | `S10` in tests/depth-STYLE-CORPUS.test.cjs | the score is not divided by the example's length, so long examples outrank the nearest one | proven |
| S11 | A shared topic is enough | worried finds the emotion examples | `S11` in tests/depth-STYLE-CORPUS.test.cjs | the topic boost is dropped | proven |
| S12 | The safety examples are always in | 5.04 unknown send state is in every block | `S12` in tests/depth-STYLE-CORPUS.test.cjs | a safety example is dropped from the always-in list | proven (also fails S14, S15) |
| S13 | Shown once | yes yes double yes shows 2.08 once | `S13` in tests/depth-STYLE-CORPUS.test.cjs | a safety example the message matches is picked again | proven |
| S14 | Nothing relevant, nothing extra | hi and an empty message get only the safety examples | `S14` in tests/depth-STYLE-CORPUS.test.cjs | a zero score still counts as a match | proven (also fails S11) |
| S15 | At most k nearest | k 2 gives two plus the four safety examples | `S15` in tests/depth-STYLE-CORPUS.test.cjs | the caller's k is ignored | proven |
| S16 | Hard rules first | the block starts with HARD RULES | `S16` in tests/depth-STYLE-CORPUS.test.cjs | the hard rules come after the examples | proven |
| S17 | Every hard rule | A yes covers only the latest card is in the block | `S17` in tests/depth-STYLE-CORPUS.test.cjs | the one-yes-per-card rule is dropped | proven |
| S18 | Never an example that breaks a standing rule | hulu sent me a verification code never shows 5.14 | `S18` in tests/depth-STYLE-CORPUS.test.cjs | the ruled-out list is empty, so 5.14 (text me the code) leads the block (the bug found building this packet) | proven |
| S18 | Never an example that breaks a standing rule | the block says never ask for a code in chat | `S18` in tests/depth-STYLE-CORPUS.test.cjs | the no-secrets-in-chat hard rule is dropped | proven |
<!-- results:end -->
