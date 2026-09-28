# The Engineering Loop

*Status: designed when Vishnu says "ready". Below is the shape of it so the plan is visible now.*

When the loop starts, Claude Code engineers the program in `BUILD_PLAN.md` wave by wave, task by task, without waiting for new instructions between tasks. Muse (this chat) owns mainline, verification, and the long unattended work; Claude Code owns the build loop on the Mac.

## What the loop design will specify

1. **Task queue.** Every wave in `BUILD_PLAN.md` broken into GitHub issues: one capability or one infrastructure piece per issue, each with acceptance criteria, the spec section it implements, and its tier/rail/license exposure.
2. **Iteration protocol.** For each issue: implement → run the relevant tests (Agent100 dry for behavior, prod verification for UI) → commit → push → report. No new task starts until the previous one's definition of done is met.
3. **Definition of done.** Tests pass, production-verified at 390px where UI is involved, numbers trace to source rows, no new never-list violations, ledger entry written where an action capability shipped.
4. **Human gates.** The loop stops and waits at: credentials/keys (Browserbase, partner API keys), partner applications, any T3 autonomy going live, securities-lawyer review before Layer 2, and Vishnu's explicit approval per cancellation (standing rule).
5. **Escalation rules.** Blocked on a partner → build the UX against a mocked rail and move to the next unblocked task; never idle on a gate. Site changed under a playbook → fall back a method, log it, continue.
6. **Concurrency rules.** Module ownership (from Wave 0's extraction) decides who touches what; the single-file template is never edited by both agents at once.
7. **The 10x test** runs as a loop milestone after Wave 3, not as an afterthought.

## The one line that matters

The loop's throughput is bounded by review bandwidth and external gates, not by code generation. The design optimizes for never being blocked: there is always an unblocked task at the front of the queue.
