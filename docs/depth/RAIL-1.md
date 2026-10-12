# Rail 1: recipient memory and resolution, for every person-to-person money flow

Owner: Claude. Status words: planned, built, proven (its test fails under the planted break and passes without it).

Why: every flow that names a person (pay, split, request, schedule, allowance, gift) has the same three ways to hurt someone: the money goes to the wrong person because a name matched loosely, it goes to a stranger who was never checked, or the agent "remembers" someone it should not. Before this rail each flow had its own lookup (AgentMoney.resolveRecipient, AgentMoneyPlans.person, AgentSend.lookalike) and the live handler knew nobody at all. Now there is one layer, one table, and one set of rules.

Scope: `packages/domain/42-agent-recipients.js` (resolve, the follow-up state machine, the book with evidence-gated save), wired into pay (`64-agent-send.js`, PAY-001 for saved people, PAY-002 for a confirmed stranger), split (`70-agent-split.js`, PAY-004), `AgentMoney.resolveRecipient` and `AgentMoneyPlans` (request, schedule, allowance, gift), the router (follow-up replies go to the asking flow, never the model), and the live wiring (`supabase/functions/_shared/flow_router.ts` reads `public.saved_recipients` through the caller's RLS client and writes saves before the reply). Table and RLS: `supabase/migrations/20261011020000_saved_recipients.sql`, tested by `tests/db/saved_recipients.test.sql` (14 checks: owner-only RLS, service_role bypass for the bridge, no `mention` source, no save without evidence, no card number as a handle, one row per handle per app).

Check: `node --test tests/depth-RAIL-1.test.cjs && node evals/depth/run.cjs RAIL-1` and `bash tests/db/run.sh`.

Not live: the migration is not applied to the live project (owner step). Until it is, the live handler's recipient read fails and pay and split answer "I can't read your saved recipients right now", never "I don't have Sam on file".

## The sub-capabilities (enumerated before implementation)

| # | Sub-capability | What the user sees |
| --- | --- | --- |
| S01 | Exact handle first, and a handle is only a handle | "@marcus" resolves to the person with that handle; "@sarah_m" never matches the name "Sarah M"; a bare word is read as a name first. |
| S02 | Full name second | "Sam" picks the saved "Sam" over "Sam K"; "Marcus T" picks Marcus T. |
| S03 | First name, after the handle and the nickname | "sarah" resolves to the only Sarah, straight to the card. |
| S04 | Two matches ask and stage nothing | "Which Marcus: Marcus L (@marcus) or Marcus T ($mtee)?" (handles shown, response-style corpus 1.04); no card, no loop confirmation; "T" or "Marcus T" continues to the card. |
| S05 | A handle look-alike is named | "@sarah-m" when "@sarah_m" is saved: "is one character away from Sarah M (@sarah_m). Did you mean Sarah M?"; NEW starts the stranger path; nothing is staged. |
| S06 | A name look-alike is asked about | "sarha" asks "Did you mean Sarah M?" instead of guessing or calling her a stranger. |
| S07 | Saved goes straight to the card | A saved row with no payment history still goes straight to the card under PAY-001; no new-recipient questions. |
| S08 | A stranger is asked who, and nothing is staged | "venmo dana 25": "I don't have Dana on file. New recipients are confirmed in full, every time. What's Dana's Venmo handle?"; no card exists. |
| S09 | The handle is typed back exactly | "@dana_k" for "@dana-k" does not match; two mismatches stop; ten minutes expire it; never mind stops it. |
| S10 | The stranger's card is the full one | "New recipient, first send: set up $25.00 to Dana (@dana-k) in Venmo"; the loop sees PAY-002 (T5); yes stages a handoff for the person to send. |
| S11 | Saved only after a completed send | Staging saves nobody; the debit posting saves the stranger (source completed_send, evidence the transaction id); a saved person's send only touches last_used_at. |
| S12 | Or after an explicit SAVE, never from a mention | SAVE after the read-back saves with the read-back as evidence; a save without the read-back is refused; a name in a message or a payment received saves nobody. |
| S13 | Split resolves through the same layer | The same "Which Marcus" question, the same look-alike, the same stranger path; a person saved in pay resolves in split; exact shares, the odd cent is the user's. |
| S14 | Unreadable recipients are said, not guessed | When the table cannot be read, pay and split say "I can't read your saved recipients right now"; nobody is called a stranger. |
| S15 | Rows become people, one per display name, a handle per app | Sam on Venmo and Sam on Zelle is one Sam; "zelle sam" shows the Zelle handle; with no app named the card shows the handle on the app the money goes by; save rows carry evidence; card numbers are refused. |
| S16 | Follow-up replies never reach the model | The handle, NEW, the answer to "Which Marcus" and SAVE go to the flow that asked, through the router, with zero model calls. |

## The three worst failures with real money or trust, and what guards each

1. **Money to the wrong person.** A loose name match, a look-alike handle resolved silently, a handle read as a name, the wrong app's handle on the card. Guards: S01, S02, S04, S05, S06, S15.
2. **Money to an unchecked stranger.** A new person staged without the app, the handle, the read-back and the full card. Guards: S08, S09, S10, S16.
3. **The agent remembers someone it should not, or forgets it cannot see.** A save from a mention, a save before the money moved, everyone a stranger when the table is down. Guards: S07, S11, S12, S14.

## Adversarial cases logged (all in the `[ADV]` test)

| Input | Expected | Why |
| --- | --- | --- |
| "send $40 to marcus" with Marcus L and Marcus T | "Which Marcus: Marcus L (@marcus) or Marcus T ($mtee)?" (handles shown, response-style corpus 1.04), nothing staged | Ambiguity |
| "send $40 to @sarah-m" with @sarah_m saved | look-alike named, nothing staged | Look-alike |
| "send $40 to @sarah_m" with a person named "Sarah M" whose handle differs | look-alike or stranger, never Sarah M by name | Handle read as a name |
| "my friend dana is @dana-k btw" | nothing saved | Mention |
| stranger path, "@dana_k" typed back for "@dana-k" twice | stopped, nothing staged | Read-back |
| "yes" to the read-back question | not a read-back; nothing staged | Yes is not a handle |
| a stranger's handoff staged, no debit yet | not saved | Staged is not sent |
| SAVE with no stranger confirmed | nothing saved | Explicit save needs the read-back |
| "4111111111111111" as a handle | refused, never stored | Identity digits |
| split with the same person twice | asks | Duplicate |

## Results

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Exact handle first, and a handle is only a handle | @marcus resolves by handle; a bare "marcus" shared by two people asks | `S01` in tests/depth-RAIL-1.test.cjs | the handle step runs for every query, so a first name that equals someone's handle resolves silently | proven (also fails S04, S13, S16) |
| S02 | Full name second | "sam" picks the saved Sam, not Sam K | `S02` in tests/depth-RAIL-1.test.cjs | the full-name step is skipped, so a first-name match wins | proven (also fails S01, S03, S04, S05, S06, S07, S09, S10, S11, S12, S13, S15, S16, S17, S19, S22) |
| S03 | First name, after the handle and the nickname | a unique first name goes straight to the card | `S03` in tests/depth-RAIL-1.test.cjs | the first-name step is skipped, so every first name is a stranger | proven (also fails S01, S04, S11, S13, S16, S17, S18, S19, S20, S21, S22) |
| S04 | Two matches ask and stage nothing | "Which Marcus: Marcus L or Marcus T?" with no card and no loop confirmation | `S04` in tests/depth-RAIL-1.test.cjs | an ambiguous first name takes the first match | proven (also fails S01, S13, S16) |
| S05 | A handle look-alike is named | @sarah-m next to a saved @sarah_m is named, never resolved | `S05` in tests/depth-RAIL-1.test.cjs | the look-alike window is zero edits, so a near handle is a stranger with no warning | proven (also fails S13) |
| S06 | A name look-alike is asked about | "sarha" asks "Did you mean Sarah M?" | `S06` in tests/depth-RAIL-1.test.cjs | names are never compared for near misses | proven |
| S07 | Saved goes straight to the card | a saved row with no history gets the PAY-001 card | `S07` in tests/depth-RAIL-1.test.cjs | only payment history counts, so every saved row with no history is sent down the new-recipient path | proven (also fails S01, S02, S03, S04, S05, S06, S11, S15) |
| S08 | A stranger is asked who, and nothing is staged | an unknown name asks for the app and handle; no card exists | `S08` in tests/depth-RAIL-1.test.cjs | an unknown name is staged directly with a guessed handle | proven (also fails S09, S10, S11, S12, S13, S16) |
| S09 | The handle is typed back exactly | @dana_k for @dana-k does not match; two misses stop | `S09` in tests/depth-RAIL-1.test.cjs | any reply counts as the read-back | proven |
| S10 | The stranger's card is the full first-send card | the loop sees PAY-002 (T5) for a confirmed stranger | `S10` in tests/depth-RAIL-1.test.cjs | a confirmed stranger is sent under the saved-recipient capability | proven |
| S11 | Saved only after a completed send | staging saves nobody; the posted debit saves with the transaction as evidence | `S11` in tests/depth-RAIL-1.test.cjs | a staged handoff is saved as a completed send | proven (also fails S10, S12) |
| S12 | Or an explicit SAVE, never a mention | a save without the read-back is refused | `S12` in tests/depth-RAIL-1.test.cjs | any approval counts as a confirmed save, read-back or not | proven |
| S13 | Split resolves through the same layer | split asks the same "Which Marcus" question as pay | `S13` in tests/depth-RAIL-1.test.cjs | split takes the first candidate when a name is ambiguous | proven (also fails S16) |
| S14 | Unreadable recipients are said, not guessed | pay and split say the recipients cannot be read | `S14` in tests/depth-RAIL-1.test.cjs | an unreadable table is treated as an empty one | proven |
| S15 | A handle per app, and the card shows the right one | with no app named, the card shows the handle on the app the money goes by | `S15` in tests/depth-RAIL-1.test.cjs | the card keeps the most recent row's handle whatever app the money goes by | proven |
| S16 | Follow-up replies never reach the model | a handle, YES, SAVE and "marcus t" go to the asking flow with zero model calls | `S16` in tests/depth-RAIL-1.test.cjs | follow-up replies are not routed, so they go to the model and are lost | proven |
| S17 | A group is never a person | split with my roommates asks who they are | `S17` in tests/depth-RAIL-1.test.cjs | group words are read as names, so 'Roommates' is asked for a Venmo handle | proven (also fails S21) |
| S18 | Names after the memo are people | split $90 for dinner with marcus names Marcus | `S18` in tests/depth-RAIL-1.test.cjs | everything after 'for' is the memo, so the names are lost and a bare 'who' is asked | proven (also fails S17) |
| S19 | The person's own share is not a name | split 100 with sarah, i pay 50 requests from Sarah only | `S19` in tests/depth-RAIL-1.test.cjs | the own-share clause stays in the names, so 'I Pay 50' is asked for a Venmo handle (both layers: the clause cut before the names split, and the filter after) | proven (also fails S21) |
| S20 | Splits as people type them | split 90 with sarah thx names Sarah | `S20` in tests/depth-RAIL-1.test.cjs | chat filler at the end stays in the name, so 'Sarah Thx' is a stranger | proven |
| S21 | Splits by percentage | i pay 60% cards your 60% share | `S21` in tests/depth-RAIL-1.test.cjs | a percentage share is still refused as not built | proven |
| S21 | Splits by percentage | i pay 70% of 2400 requests from $2,400.00 | `S21` in tests/depth-RAIL-1.test.cjs | a percentage is read as the amount ("i pay 70% of 2400" splits $70.00) | proven |
| S22 | Itemized splits | sam's salad is all Sam pays; the other $84.00 is split among the rest | `S22` in tests/depth-RAIL-1.test.cjs | an item owner also takes a share of the rest, so the others are under-asked | proven |
| S22 | Itemized splits | sam only had a salad for 12, split 96: the total is 96 | `S22` in tests/depth-RAIL-1.test.cjs | the item's own number is read as the total | proven |
| S22 | Itemized splits | with sarah, she only had a salad: she is Sarah | `S22` in tests/depth-RAIL-1.test.cjs | 'she' is read only at staging, so a name added after makes it unclear | proven |
<!-- results:end -->
