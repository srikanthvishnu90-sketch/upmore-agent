# Doc 3: Budget — stored from Vishnu's paste, 2026-09-24 22:05 CDT. Full text below.

Upmore — Budget: Feature Spec
Sep 24, 2026
Budgeting is the most attempted and least successful feature in consumer finance. YNAB works because it sells a method and a community, not software. Mint's budgets were ignored by most of its users. The category is twenty years old and the failure rate has not moved.
The reason is simple and worth stating before any spec: a budget is a behaviour change dressed as a screen. Most apps ship the screen and assume the behaviour. This spec assumes the opposite — that the user will not maintain anything, will not categorise anything, and will not open a budget tab — and builds around that.
So Budget here is not a screen with envelopes. It is one number on Home, a set of monitors, and a plan the agent produces.
This document assumes the shared architecture in Upmore — Feature Specs.

## What budgeting actually has to do
Conventional approaches fail (user categorises -> nobody categorises; user sets limits -> targets abandoned; user checks app -> nobody checks; charts and guilt -> guilt doesn't work; user compares months -> requires effort). Upmore's approach: derived from transactions; derived from the user's own history; monitors push, user doesn't pull; a sequence of specific actions; ledger, automatically. Every row removes work from the user.

## The ceiling, stated honestly
Budgeting help is bounded by the user's actual slack. If someone has $200 of discretionary spend, a perfect plan finds at most $200. No amount of reasoning creates money that isn't there. Applied to trimming spending, returns cap fast and cap low. Applied to sequencing — what to do first, against which deadline, using money the user didn't know they had — returns are much larger. The plan engine is weighted accordingly.

## Setup: zero data entry
The user never builds a budget. It is derived, shown for confirmation, and adjustable. One screen, about forty seconds.

Derivation, in order:
1. Detect income — inflows matching a recurring pattern -> pay cadence, typical amount; irregular inflows -> flag as variable income, use trailing 3-month median.
2. Classify outflows into three tiers: FIXED (recurrence_id set, amount stable within 5% — rent, subscriptions, insurance, loan payments); COMMITTED (recurring but variable amount — utilities, phone, groceries); FLEXIBLE (everything else).
3. Compute the baseline: fixed_total = sum of FIXED per month; committed_est = 3-month median of COMMITTED; flexible_actual = 3-month median of FLEXIBLE.
4. Derive slack: slack = income - fixed_total - committed_est - flexible_actual.
5. Present: every number from the user's own history. Nothing is a benchmark, a percentage rule, or a recommendation.

The confirmation screen — one screen, four lines, three taps:
Money in: about $2,400 a month, every other Friday. Fixed: $1,180 — rent, 6 subscriptions, car payment. Usually varies: $420 — utilities, groceries, gas. Everything else: $610. That leaves about $190 a month.
[Looks right] [Something's off] [I have income you can't see]
"Something's off" opens the tier assignment, not a spreadsheet. The user moves items between Fixed, Varies and Flexible. That is the only editing surface, ever.
"I have income you can't see" handles cash work, support from family, irregular gig income — a single amount and cadence, stored and labelled as user-supplied so no monitor treats it as observed fact.

Variable income: when income variance exceeds roughly 25%, the product switches from a monthly budget to a floor model. Instead of "you have $190 left this month," it computes the lowest month in the trailing six and budgets fixed costs against that: "Your income swings between $1,600 and $3,100. Your fixed costs are $1,180, so a bad month is tight but survivable. In a good month, anything above $1,900 is genuinely spare."

What setup deliberately omits: no envelopes, no per-category limits, no zero-based allocation, no target-setting. Each requires ongoing maintenance, and maintenance kills budgets. If a user wants envelope budgeting, YNAB exists.

## The plan engine
The feature nobody else has, and the only place in Budget where a model genuinely earns its cost. Every competitor stops at a chart. The gap: no tool converts the whole picture into a sequence.

Why a model, not more code: the monitors each see one pattern. A model reading all their outputs at once, plus transaction history, plus the deadline queue, can see things no single monitor can: the $34 overdraft fee two days before every payday; three overlapping subscriptions; an expired promotional rate; a claim window closing before a bill is due; moving one billing date ending a recurring fee. Holding all of that simultaneously and reasoning about order is what a model is good at and code is bad at. It is not a calculation — which is why it belongs to the model without violating the compute rule.

Architecture:
1. Code assembles the fact pack: income pattern, tiers, slack, free cash; every open card in the queue with dollars and deadline; recurring charges with dates and amounts; fee events in the last 90 days with proximate cause; goals with current and target.
2. Model reads the whole pack at once, identifies interactions no single monitor can see, proposes candidate actions in a specific order.
3. Model calls functions to test each candidate: projectBalance(changes[], through_date); projectGoal(goal_id, monthly_delta); feeImpact(change). NEVER estimates these itself.
4. Model writes the plan in plain words.
5. Ledger records what actually happened.
Step 3 is the tool-use pattern: the model decides what to compute, a function computes it, the model explains the result. Every figure in a plan is traceable to a function call.

Example plan: "Cancel these two, move one billing date, and the overdrafts stop." 1. Cancel Paramount+ and Peacock — paying for three streaming services, used one last month. $22/mo. 2. Move Spotify billing to the 20th — hits on the 12th, two days before payday, triggered a $34 overdraft fee three times since June. 3. That's $22 + $34 = $56 a month. At $56 a month on top of current $190, hit the $1,000 emergency fund in 11 weeks instead of 26. Every number from a function.

The scenario tool: same engine, user-initiated. "What if I cancel these three?" "What if I move rent to the 5th?" "When do I hit $1,000 if I add $50?" The model translates the question into function calls, runs them, explains the result.

Rules the plan engine obeys:
- Maximum three actions. A plan with nine steps is a to-do list.
- Every step names its evidence. "You've been charged this fee three times since June" is checkable.
- No plan without an action the user can take today.
- Plans expire. Regenerate rather than persist.
- Never a behavioural judgement. Reports what numbers show and what changing them would produce. No guilt.

## Safe to spend
One number, on Home, computed continuously. The entire visible surface of Budget.
safe_to_spend = current_balance - fixed_remaining_this_cycle - committed_estimate_remaining - buffer.
Displayed as total and daily: "$190 left, or about $13 a day until the 27th." The daily framing matters: "$190 left this month" invites spending $190 today. "$13 a day" is a pace.
Four rules: (1) never negative-shame — if negative, say so plainly and the queue surfaces actions, not commentary; (2) recompute on every new transaction, never on a schedule; (3) show the buffer as a separate line, so the user knows it exists and can change it; (4) state the cycle end date every time.

## Goals
Goals exist to give the plan engine something to optimise toward. Fields: name (user's words); target_amount (user-set); current_amount (computed from a designated account, not user-entered); created_at (for pace); status (active, reached, abandoned).
Progress is computed, not reported. The user never updates a goal. If tied to a savings account, balance is progress. If not tied to anything, tracks Received plus Avoided from the ledger since creation.
Projection is a function call, always. projectGoal(goal_id, monthly_delta) returns weeks to target at current rate. The model explains it. The model never estimates it.
One active goal by default. Multiple goals split attention. A second goal is possible but not encouraged.
Goals are never suggested. Upmore does not tell a user they should be saving for an emergency fund.

## When the plan fails
Most plans fail. A step wasn't done: no reminder, no nag, no streak, no guilt. The step stays in the queue at its computed rank; if genuinely valuable it surfaces again on merit. Explicitly forbidden: streaks, badges, "you're falling behind," red indicators for inaction, any notification whose purpose is to create obligation rather than deliver information.
A step was done and didn't work: the honest response — "You cancelled Paramount+ on the 3rd but they charged you again on the 14th. That's on them, not you. Want to dispute it? It's a duplicate-charge claim and you're inside the window." Converts a failure into a claim. Explicitly assigns fault away from the user.
The user spent it anyway: nothing happens. The safe-to-spend number moves and the next plan accounts for it. No comment, no comparison, no "you were doing so well."
Income dropped: a detected income drop triggers a rebuild, not an overspending alert: "Your last two paychecks were smaller. I've rebuilt the numbers around $1,900 instead of $2,400. Your fixed costs are $1,180, so it's tight but it works. Here's what's most worth doing this week." Never "you're over budget" when the real event is that the income assumption changed.

## Wellbeing constraints
No guilt mechanics. No streaks, no badges, no red for inaction, no "you were doing so well."
No comparison to other users. "People like you spend less on dining" is a shame mechanic wearing a data costume.
No lifestyle judgement. Someone's spending is their business. The app's job is to make consequences visible, not rank choices.
Escalate, don't optimise. If free cash is persistently negative, the product stops suggesting trims and says the real thing: hardship programs, utility assistance, income-driven repayment. A user in genuine distress being shown a plan to cancel Netflix is being failed.
Never a financial product recommendation. No loans, no consolidation, no earned-wage access, no credit cards, no matter how well they would fit.

## Hard nevers
1. Never require the user to categorise anything
2. Never require the user to update a goal
3. Never let the model compute a figure — functions compute, model explains
4. Never show a plan with more than three actions
5. Never show a plan whose first step is not concretely actionable today
6. Never use guilt, streaks, or shame mechanics
7. Never compare a user to other users
8. Never suggest a goal the user didn't set
9. Never recommend a financial product
10. Never say "you're over budget" when the real change is that income dropped
11. Never build an envelope or zero-based budgeting system
12. Never give a safe-to-spend figure without its cycle end date

## Build order
Days 1-3: income detection from inflows — everything downstream needs the pay cadence.
Days 4-7: three-tier outflow classification — reuses the recurrence detector from Cancel.
Days 8-10: slack derivation and the confirmation screen.
Days 11-13: safe-to-spend on Home, total and daily — first visible output.
Days 14-17: variable-income floor model.
Days 18-22: the function layer: projectBalance, projectGoal, feeImpact — must exist before the model can plan anything.
Days 23-26: goals, with computed progress.
Days 27-34: the plan engine, with tool use — the differentiator; last because it depends on all of the above.
Days 35-38: the scenario tool — same engine, user-initiated.
Days 39-42: failure handling: income drop, failed step, spent-it-anyway.
The function layer before the plan engine, always. A model that can plan but cannot compute will estimate, and an estimated projection presented as a result is the exact failure mode this whole product exists to avoid.

## Honest limits
Budgeting is bounded by slack. A perfect plan for someone with $200 of discretionary spend finds at most $200. Where returns are is sequencing and recovery, not trimming.
Most people will not follow a plan. Assume single-digit completion rates. The product must be useful to someone who reads a plan and does nothing — safe-to-spend is the visible surface, the plan secondary.
You cannot beat YNAB at method. Upmore competes on requiring nothing, not on being a better envelope system.
Variable income breaks monthly budgets. The floor model is the answer; expect it to take longer than estimated.
Budget alone does not retain. Retention comes from the monitors pushing something worth seeing — Budget's value is downstream of Track's monitor layer being real.
