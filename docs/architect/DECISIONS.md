# Decisions

Owner rulings and architect rulings, one line each, newest last. A pending decision blocks only the
work orders that name it. Codex never decides anything listed here; it asks the architect.

| ID | Decision | Status | By | Date |
|---|---|---|---|---|
| D-001 | One trunk: `trunk`, cut from `integration/v229-candidate` @ ad534539. Every change lands as a PR from `wo/<id>-<slug>` into `trunk`, reviewed by the architect. The other 186 branches are frozen; nothing is merged from them except through a work order that names the exact commits. | settled | owner (relayed Codex's request to publish trunk), architect | 2026-10-18 |
| D-002 | Model for the brain: OpenAI only (owner rule: no Anthropic API credits). `gpt-5-nano` is too weak to run the brain. Proposal: `gpt-5-mini` for the brain, nano only for cheap classification; set by env `CAREER_MODEL`. Budget per active user per month to be set by the owner. | **pending owner** | — | — |
| D-003 | Paid services: a hosted browser for applying (Browserbase or a VM-based worker) and optionally one job-data API for breadth. No spend without the owner's written yes. | **pending owner** | — | — |
| D-004 | First cohort: (a) college students recruiting for finance/consulting/tech (what the data is tuned to), or (b) job seekers in general. The architecture serves both; this only orders the data and the evals. | **pending owner** | — | — |
| D-005 | Name: the product is Trainee. User-facing copy, app shell and policies are renamed in a work order (M6); code identifiers are not renamed. | settled | owner | 2026-10-18 |
| D-006 | Governance archive: bug ledger, forbidden-rules register, BUILD-STATUS, MI/FR/BUG numbering, crew/lane records and merge records are frozen. No new entries. Rules that matter become tests. | settled | architect | 2026-10-18 |
| D-007 | Never invent a user's answer. Application answers, profile facts and legal attestations come only from what the user stated and confirmed. The 47 agent-invented "confirmed" facts (F-027..F-079, `mi-038-r3-delegated-answers.md`) must be deleted from the owner's fact bank before any real application runs. | settled (cleanup is the owner's, on his machine) | architect | 2026-10-18 |
| D-008 | The live chat keeps the current router until the agent brain beats it on the eval set; the switch is the env flag `CAREER_BRAIN=agent`, flipped by the owner at deploy. | settled | architect | 2026-10-18 |
| D-009 | Texting provider: LoopMessage (owner). The real channel is built LAST (WO-013); until then every capability is built and tested through the conversation interface and the text simulator (WO-004), which run the same code path LoopMessage will. SMS/RCS for Android follows LoopMessage (WO-014). | settled | owner | 2026-10-18 |
