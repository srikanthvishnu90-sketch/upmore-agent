# Codex Prompt: Upmore Launch-Readiness Verification (Full Run)

## Mission

Verify Upmore is launch-ready. You will do this in three phases: first
LEARN the system read-only, then GENERATE a broad set of real-world test
scenarios, then EXECUTE every scenario and report honestly. This is a long
run. Do not shortcut it.

## Phase 0 — Learn the system (read-only, no changes)

1. Read `docs/trading-capabilities.md` — the 5 trading capabilities, what is
   built vs missing, and the honest limits (no Alpaca keys yet, IPO Access is
   app-only, disclosure data is stale).
2. Read `docs/upmore-200-capabilities.md` — the 50 broad capabilities. These
   define the product surface.
3. Read `docs/upmore-test-scenarios.md` — 200 deep test variations. Useful
   reference for edge cases.
4. List `supabase/migrations/` and read the latest ones so you know exactly
   which tables exist.
5. Skim `supabase/functions/agent-chat/_shared/agent.ts` (system prompt) and
   `supabase/functions/imessage-inbound/index.ts` (the iMessage bridge).

Then query the live database (Upmore project only, via sb.py) and record
what is ACTUALLY connected right now:
- `brokerage_accounts` — any rows? paper or live?
- `copy_leaders` — which leaders exist?
- `ipo_offerings` — which offerings exist, with what status?
- `settlements` (or equivalent) — how many rows, with deadlines?
- `subscriptions` — real or synthetic test data?
- `imessage-inbound` deployed version and bridge health.

Write this inventory down. Every scenario you generate in Phase 1 must be
testable against what is actually connected. Do NOT write scenarios for
integrations that do not exist. If Alpaca keys are not installed, you test
the propose/approve/receipt path on paper, not live orders.

NEVER touch the Sporv Supabase project (`aveqjeafghmwafkbbnor`) for any
reason. Never move real money. Never send a real iMessage.

## Phase 1 — Generate the scenarios (before executing anything)

Generate 40-60 scenarios. Rules:

1. Each scenario tests ONE singular capability. One scenario, one feature.
2. No two scenarios may test the same capability. Each must be essentially
   different from the others.
3. Spread them across ALL tracks: investing via iMessage, stock trading,
   copy trading, IPO/pre-IPO, auto-invest, subscriptions, bills, class
   actions, portfolio reports, approvals/safety, tone parity.
4. Every scenario goes hand in hand with what is connected (from your Phase
   0 inventory). A scenario for a missing integration is marked BLOCKED, not
   silently skipped.
5. Include real-world situations, not just happy paths:
   - "What stocks am I connected to? What can I actually trade right now?"
   - "What class action lawsuits do I fit?"
   - "I have $500. What should I do with it?"
   - An order placed when the market is closed.
   - The same buy request sent twice by accident.
   - Two copy-trading leaders disagreeing on the same stock.
   - A Pelosi disclosure that is 8 weeks old.
   - "Someone is selling me OpenAI pre-IPO tokens, is it legit?"
   - An approval that expires before the user answers.
   - "Cancel my Netflix" (verify it guides, never fake-completes).
   - "Am I eligible for the pork settlement?" (verify honest likely/not-likely).
   - A settlement whose deadline already passed.
6. Include iMessage-specific scenarios through the Ruwe bridge:
   - Invest via iMessage: "buy $50 of VOO" through the bridge, dry-run only.
   - A numbered-reply approval ("1") over iMessage.
   - A long answer that must arrive as readable bubbles, not one wall of text.
   - Verify the bridge and the app run the same brain (no prompt override).

Save the full scenario list to `docs/launch-readiness-scenarios.md` BEFORE
executing anything. Then proceed.

## Phase 2 — Execute every scenario

For each scenario, in order:

1. Run it for real: dry-run turns via the imessage-inbound endpoint with
   `dry_run=1` for iMessage paths, direct agent-chat invocations for app
   paths, and sb.py queries to verify database state before and after.
2. Record PASS or FAIL with evidence: the actual agent output, row counts,
   order states, receipts. A PASS needs proof, not a vibe.
3. If the scenario cannot run because the integration is not built, mark it
   BLOCKED and note exactly what is missing.
4. Clean up every test row you create (delete dry-run threads/messages you
   inserted). Leave the database as you found it.
5. Grade tone on every conversational scenario: direct, warm, practical, no
   filler openers ("Great question", "I'd be happy to help"), answer first,
   one blocking question max. Flag any turn that reads corporate or evasive.

## Phase 3 — Report

Write `docs/launch-readiness-report.md` with:

1. **Connected-systems inventory** — what is actually wired right now:
   brokerage accounts, iMessage bridge version and health, data feeds,
   settlement directory state, subscription data state (real vs synthetic).
2. **Scenario results table** — every scenario, PASS/FAIL/BLOCKED, with
   one line of evidence each.
3. **Failure analysis** — for each FAIL: what broke, where (bridge, brain,
   database, data), and the fix needed.
4. **Gap list** — everything a real user would expect that is not built yet.
5. **Verdict** — LAUNCH READY or NOT READY, with numbered blockers in
   priority order. If not ready, say exactly what the next build sprint must
   contain. Do not soften the verdict.

Rules for the whole run: report failures as failures; never invent data to
make a scenario pass; never present a dry-run as a live result; paper/test
paths only; keep every approval-gated action gated.
