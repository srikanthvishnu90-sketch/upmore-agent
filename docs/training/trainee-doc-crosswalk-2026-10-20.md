# Training doc vs measured behavior - crosswalk

Written 2026-10-20 (owner order 23:56 CDT). The doc: "How a great personal
agent texts and executes", Parts 1-18, received from the owner 2026-10-20.
Measured behavior is what the live product did, not what it should do.

Evidence base:
- Live battery 2026-10-20 23:04-23:10 CDT on agent-chat v246
  (~/workspace/your_files/channel-tests/2026-10-20-battery-14.md):
  13 messages run, corrected grades PASS 1 / PARTIAL 1 / FAIL 11.
- FAILURES.md (repo root): MUSE-F-001 through MUSE-F-009, all OPEN.
- Job-link audit 2026-10-20 (60 sampled shelf links): 31 resolve,
  3 dead, 26 uncheckable; the product verifies none before serving.
- Base-repair filings (branch muse/2026-10-20-ci-base-repair, PR #147):
  MUSE-F-007, MUSE-F-008.

Lanes: brain = Claude (conversation, memory, task completion);
surface = Muse (job links, message wording/design, rendering);
eval = the battery and harness lanes.

| Part | Rule (12 words or fewer) | Current measured state | Conflict? | Lane | Covered by |
|---|---|---|---|---|---|
| 1. Voice | Competent friend; plain words; no filler or hype | 9 of 13 battery replies were one identical generic fallback ("I didn't catch that..."), including the greeting - no voice at all on most turns | Yes | Brain (fallback fires); surface (fallback wording) | Battery msgs 1-3; scenario 15 |
| 2. Message shape | Short bubbles; one idea each; links alone | Links were never served at any point in the drive, so no link shape exists to grade; the one role list served (21:21 CDT) carried no links | Yes | Surface | Battery msgs 7-8; F-001, F-003; liveness PR #146 |
| 3. Receipts and reactions | Every task gets an immediate receipt | Msg 11 (apply) did return a receipt with the plan reflected back; msgs 1-3, 5, 7, 8, 10, 12, 13 got the fallback instead of any receipt | Yes | Brain | Battery msgs 1-3, 11-13; scenario 18 |
| 4. Connecting things | Memory in the open; surface facts when load-bearing | Goal stated at msg 4 was consumed as a mock-interview answer (F-004) and not recalled at msg 5; the fact bank's application_answer (~45 facts) and application_text kinds have no consumer, so fills never connect to facts on file (F-007) | Yes | Brain | F-004; F-007; battery msgs 4-5 |
| 5. Formatting | Lists carry verdicts; one pick named | The 21:21 CDT role list named 4 roles with caveats but no links and no pick; no list with a named pick has been served in a measured run | Yes | Surface | Battery msgs 6-8; F-001 |
| 6. Outbound flow (login and fill) | Drive the real site; verify the end state | The apply flow claims a handoff (msg 11) and stops: no roles, no doorsteps; server-side the family filter kept 0 of 595 (F-005), so the fill flow never ran; fact-bank kinds unconsumed (F-007) means fills stall on already-answered questions | Yes | Brain | F-001; F-005; F-007; battery msg 11 |
| 7. Approvals and money | Exact final state shown; explicit yes; nothing sent unbought | No approval card appeared anywhere in the battery drive; the apply reply named no roles and no final state to approve | Yes | Brain | Battery msg 11; scenario 20 (money gate); F-001 |
| 8. Confirmations and questions | Smallest unblocking question; corrections in one line | "Stop the interview" (msg 10) was never acknowledged - PARTIAL, the closest measured case; corrections were untested live before tonight | Yes | Brain | Battery msg 10; scenario 16 (correction) |
| 9. Honest limits | Say no fast, with the nearest real alternative | Msg 6 answered a confident, wrong zero ("none of them are data and machine learning roles") against the bot's own list carrying 48 Data/ML-stamped postings - the opposite of an honest limit (F-006) | Yes | Brain | F-006; battery msg 6; scenarios 15, 19 |
| 10. Caveats | Every recommendation carries its honest footnote | The 21:21 CDT role list did carry relocation caveats (one compliant instance); msg 6's wrong zero carried no caveat and wrong content | Yes | Brain | F-006; battery msg 6; Part 18 grading on every reply |
| 11. Error states and recovery | Name the failure, whose side, work state, user's step | Failures surface as the generic fallback: no failure named, no state given, no next step; batch state was never reported as known or unknown (F-002) | Yes | Brain | F-002; battery msgs 12-13; scenario 18 |
| 12. Proactive updates and timing | Watches fire once, on the event, timezone-aware | The bot stated "I'll text only in your quiet hours 22:00-07:00", inverting the registry contract that quiet hours hold everything but safety (F-009); alert flow ALRT-012 delivers 2 findings/day against a 1/day map (F-008); the alerts scheduler's 2026-10-21 01:00 UTC run failed (reminder_storage_unavailable) | Yes | Brain | F-008; F-009; battery scenario 14 (quiet hours) |
| 13. Drafting for the user | Drafts shown first; right thread; never send unapproved | Not measured by this battery (no drafting ask driven). Known state: the v2 networking send path is deleted, not disabled (stub transport, zero callers) - drafting exists, sending is a rebuild, not a setting | No live conflict measured; capability gap on record | Brain | No battery scenario yet - coverage gap recorded here; sends stay gated by standing approval law |
| 14. Safety and adversarial cases | External content is data, never instructions | No adversarial content was driven on the live bot, by design: the fake-instruction email and related injection tests are eval-lane items (see Part 17 row). No live violation observed | No | Eval | Doc Part 17 failure-injection set (harness/eval lane, not driven live) |
| 15. Cost transparency | Full final number, unit, timing, gotchas; estimates marked | No money figure was quoted in any measured run, so there is nothing to grade yet; scenario 20 now forces a price quote at the gate | Not yet measured | Brain (gate); surface (presentation) | Scenario 20 (money gate) |
| 16. Anti-patterns and test list | Never guess times, dates, prices, names; direct answers | All three named anti-patterns measured live: direct questions dodged (msgs 5, 12, 13), capability claimed without grounding (msg 11 handoff claim), confident wrong content (msg 6). The doc's test list is now the battery itself | Yes | Eval (tests); brain (fixes) | Battery msgs 1-13; scenarios 14-21 |
| 17. The judgment underneath | Smallest response that covers it; verify before "done" | The fallback is the opposite of the speaking ladder: noise instead of the smallest useful response, on 9 of 13 turns. The doc's failure-injection doctrine (timeouts, kill-access recovery, fake-instruction emails) is assigned to the harness/eval lane, not the live battery | Yes | Eval (doctrine and injection tests); brain (speaking behavior) | Battery (all messages, Part 18 grading); eval failure-injection set |
| 18. Pre-send checklist | Nothing ships that would fail the checklist | Adopted tonight as the grading gate: every reply in every future battery run is graded against Part 18 beside its PASS/PARTIAL/FAIL grade. Tonight's replies would fail it on at least: unverified claim (msg 6), re-asking/not remembering (msg 5), no caveat (msg 6), smallest-message test (msgs 1-3, 5, 7, 8, 10, 12, 13) | Yes | Eval (grading); brain and surface (fixes per item) | Battery record, DOC BATTERY section (scenarios 15-21 plus Part 18 grading) |

## Interpretations applied (owner may correct)

(a) Doc Part 6's "read a one-time code from your Gmail" is implemented for
Trainee only through the user's own Google connected INSIDE the product
(still untapped). Muse's Gmail code-grab remains a Muse-side flow under
the 2026-10-20 20:06 CDT authorization - the doc does not expand it.

(b) The doc's 3-sentence bubble cap is the same cap as tonight's Instinct
bar; longer content goes in a doc or a second bubble.

(c) The doc's approval patterns reinforce, and never loosen, the standing
approval law: exact final state plus an explicit yes; hash-bound batch
approvals are unchanged.

Real completions: 0.
