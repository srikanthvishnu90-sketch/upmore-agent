# CATEGORY-RULES: "recategorize Target as groceries" in chat (capability list item 8; megadoc L07)

`packages/domain/95-category-rules.js` (`CategoryRules`) reads a person's rule from their words ("recategorize Target as
groceries", "count Costco as shopping", "Target isn't shopping, it's groceries", "stop counting Target as groceries",
"show my category rules", "delete all my category rules"), restates it exactly and keeps it in
`agent_proactive_settings.category_rules` (migration `20261012040000_category_rules.sql`: at most 40, only the chat's
categories, no run of 9 or more digits; tested in `tests/db/category_rules.test.sql`). The matching lives with the
classifier, `MoneyAnswers.classify(raw, rules)` (`80-money-answers.js`): the rule's whole words in the bank's descriptor,
the longest term wins, a known merchant more specific than the term keeps its own category (a Costco rule leaves Costco
Gas as gas, and the reply says so), and a stored rule naming no category the chat counts is ignored. Every spending answer
("how much did I spend on groceries"), the month comparison and spending by card (`94-spending-views.js`), "how am I
doing", category budgets and their 80%/100% alerts (`93-budgets.js`) count by the rules, and an answer a rule changed
says so with its amount ("By your category rule: "Target" as groceries $165.50."). A rule changes how Upmore counts,
never anything at the bank or card, and never moves money.

Where it runs: the settings command in `supabase/functions/_shared/proactive.ts` (`parseCommand`, saved by
`settingsMessage`; "what are my alerts" lists the rules); agent-chat reads the person's settings row once per turn
(`select("*")`, so a project without the column yet reads no rules) and passes the rules to `moneyReply` and
`budgetReply`; the hourly proactive run passes them to the budget alerts. Edge tests:
`tests/edge/category-rules.test.ts`. Not yet applied to the ledger's own categories (`57-agent-ledger.js`, used by the
unusual-spending and large-charge alerts), which use a different category list.
Check: `node --test tests/depth-CATEGORY-RULES.test.cjs && node evals/depth/run.cjs CATEGORY-RULES`.

Noted, not changed (for the owner): the spending answer adds up charges and leaves refunds out without saying so, while a
budget and the month comparison take refunds off and say "Refunds taken off". The same groceries question can therefore
give $245.50 in one answer and $225.50 in a budget (S17, S18).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The rule is restated exactly | the reply names the old category it leaves | `S01` in tests/depth-CATEGORY-RULES.test.cjs | the reply drops what the merchant counted as before | proven |
| S02 | The ways people say it | 'target isn't shopping, it's groceries' is a rule for groceries | `S02` in tests/depth-CATEGORY-RULES.test.cjs | the isn't-it's form is not read, so the first category named wins | proven |
| S03 | A money move is not a rule | 'categorize target under my budget' goes on | `S03` in tests/depth-CATEGORY-RULES.test.cjs | the savings, account and budget words are no longer kept out, so a budget is answered as an unknown category | proven |
| S03 | A statement is not a rule | 'my biggest expense is groceries' goes on | `S03` in tests/depth-CATEGORY-RULES.test.cjs | any subject of 'is' is taken as a merchant | proven |
| S03 | Subscriptions stay with the cancel flow | 'remove netflix from my subscriptions' goes on | `S03` in tests/depth-CATEGORY-RULES.test.cjs | the subscriptions exclusion is dropped, so a likely cancel is answered as a category rule | proven |
| S04 | No pronoun as a merchant | 'recategorize that as groceries' saves nothing | `S04` in tests/depth-CATEGORY-RULES.test.cjs | the pronoun check is dropped, so a rule for the word "that" is saved | proven |
| S05 | Food is asked, never guessed | 'count Target as food' asks which | `S05` in tests/depth-CATEGORY-RULES.test.cjs | food is taken as groceries | proven |
| S06 | No rule for a bank word | 'count payment as shopping' saves nothing | `S06` in tests/depth-CATEGORY-RULES.test.cjs | the generic-word check is dropped | proven |
| S07 | Already there is said, not saved | 'count Kroger as groceries' saves nothing | `S07` in tests/depth-CATEGORY-RULES.test.cjs | a rule repeating the default is saved | proven |
| S08 | One rule per merchant | a second Target rule replaces the first | `S08` in tests/depth-CATEGORY-RULES.test.cjs | the old rule stays beside the new one | proven (also fails S12) |
| S09 | Stop removes only the matching rule | 'stop counting Target as restaurants' changes nothing | `S09` in tests/depth-CATEGORY-RULES.test.cjs | the category in a stop is not checked | proven |
| S09 | Out of a category is a stop | 'take target out of groceries' removes the rule | `S09` in tests/depth-CATEGORY-RULES.test.cjs | the out-of form is not read | proven |
| S10 | Someone else's rule goes on | 'delete my autosave rule' is not ours | `S10` in tests/depth-CATEGORY-RULES.test.cjs | a rule we don't have is answered as ours | proven |
| S11 | Clear all clears all | delete all my category rules leaves none | `S11` in tests/depth-CATEGORY-RULES.test.cjs | only the first rule is removed | proven |
| S12 | At most 40 | a 41st rule is refused | `S12` in tests/depth-CATEGORY-RULES.test.cjs | the limit is not checked | proven |
| S13 | Storable: no long digit runs | the id is base 36 | `S13` in tests/depth-CATEGORY-RULES.test.cjs | the id carries the raw millisecond time | proven |
| S13 | No number for a name | a 5-digit run is refused | `S13` in tests/depth-CATEGORY-RULES.test.cjs | the digits check is dropped | proven (also fails S06) |
| S14 | Whole words only | a Target rule leaves TARGETED ADS alone | `S14` in tests/depth-CATEGORY-RULES.test.cjs | the term matches inside another word | proven |
| S15 | The longest rule wins | joes corner store beats joes | `S15` in tests/depth-CATEGORY-RULES.test.cjs | the first matching rule wins | proven |
| S16 | A more specific merchant keeps its category | a Costco rule leaves Costco Gas as gas | `S16` in tests/depth-CATEGORY-RULES.test.cjs | the rule wins over a more specific known merchant | proven |
| S17 | The spending answer counts by the rules | groceries is $245.50 with the Target rule | `S17` in tests/depth-CATEGORY-RULES.test.cjs | the spending answer ignores the rules | proven |
| S17 | The answer says a rule moved money | 'By your category rule: "Target" as groceries $165.50.' | `S17` in tests/depth-CATEGORY-RULES.test.cjs | the rule line is never said | proven |
| S18 | Budgets count by the rules | the groceries budget is at $225.50 | `S18` in tests/depth-CATEGORY-RULES.test.cjs | the budget ignores the rules | proven |
| S19 | A bad stored rule is ignored | a rule for 'pets' changes nothing | `S19` in tests/depth-CATEGORY-RULES.test.cjs | any stored group is trusted | proven |
| S20 | The comparison counts by the rules | groceries is $225.50 with the rule and $80.00 without | `S20` in tests/depth-CATEGORY-RULES.test.cjs | the comparison ignores the rules it is given | proven |
<!-- results:end -->
