# Full model-backed conversation campaign

The supplied key authenticated successfully against the actual handler. The first conversation cost $0.000502. It is used only in process environment variables, not repository files or reports.

Target: 3,500 scenario variants across 100 families, one paid trial each. Seven dimensions: capability, awareness, response fluency, memory, multi-step planning, tool-result grounding, recovery/approval safety. Four isolated workers use one shared $5 reservation/usage ledger. No actual outbound messages or financial rail is connected; authentication and persistence are synthetic. The main coding chat is untouched.

Before scaling, Dots independently reviewed scoring, partitioning and budget enforcement. Paid graders use the same cheap gpt-5-nano model in a separate context, so grades are provisional rather than independent ground truth. Evidence references must resolve to real response text; required dimensions cannot abstain and count as passes. Honest inability to recall is not successful memory. Unavailable, malformed and truncated grades are blocked. Root causes need transcript review rather than trusting automated percentages.

Each completed turn is appended to turn-events.jsonl; each complete scenario is appended to completed.jsonl before grouped transcripts are written. Workers write separate directories, source commit and bundle hashes. The supervisor records process status and coverage in launch.json and runs aggregation when all workers finish. Aggregation checks all 3,500 unique case IDs, exact partition coverage, source identity, mode and transcript SHA256 before reporting scores. Spending includes response calls, pilot calls and judge calls. Cases denied by the budget stay unrun/blocked; budget reservations are never reset to hide previous spending.

The original unpaid full-handler campaign is archived in campaign-before-transcripts.tar.gz (all 3,500 cases, three repeatability trials, both JSONL and readable Markdown). It recorded 2,319 PASS, 241 FAIL and 940 BLOCKED. Those original failures include known currency/name fixture defects, so this is not a verified general memory score. The corrected benchmark is used for the paid run; original evidence remains intact.

Verified harness checks: Deno typecheck, seven budget tests, four grade-evidence tests, successful actual-handler paid request, successful structured grading request. The pilot exposed low-quality same-model judgments as well as application behavior; all automated scores must remain provisional and Dots should review failure families.

Run, with UPMORE_AUDIT_MODEL_KEY available only in process environment:

    source /workspace/.upmore-tools/env.sh
    cd /workspace/upmore-agent
    python3 tests/memory-audit/supervise.py --out /workspace/upmore-audit/paid-full-3500 --workers 4

Results: /workspace/upmore-audit/paid-full-3500/launch.json during execution; report.json and README.md after successful aggregation. No complete seven-dimension result is claimed until those artifacts exist and coverage checks pass.
