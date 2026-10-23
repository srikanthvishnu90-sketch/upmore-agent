#!/usr/bin/env bash
# Router before/after: the spend ledger and the runs, fail-closed (2026-10-23, after the parent's cap review).
#
#   bash scripts/eval/rba-ledger.sh run
#
# The ledger is the branch $LEDGER_REF on origin: every result file of every run this comparison ever made, plus
# INFLIGHT-<label> markers and the DONE marker. A paid call happens only when every one of these holds:
#   1. `git ls-remote` answers. The ref is either present, or absent with LEDGER_FLOOR_USD at 0 (no spend recorded yet).
#      An error, or an absent ref when spend was recorded, refuses.
#   2. A present ref fetches, and the fetched commit is the one ls-remote named. A fetch failure refuses: it never skips
#      the checks below.
#   3. There is no DONE marker and no INFLIGHT marker (an INFLIGHT marker is a run whose spend was never recorded).
#   4. Every result file carries a numeric cost with no unpriced call, and the total is at least LEDGER_FLOOR_USD.
#   5. remaining = AUTHORIZED_TOTAL_USD - recorded total, and the run's proven worst case (`run.ts --plan-only`: every
#      judge call at its byte bound and output cap at listed prices, no estimate) is at most remaining.
#   6. The INFLIGHT marker for the run, carrying that worst case, is pushed to the ledger before the run (write-ahead),
#      without force.
# The run gets --run-budget-usd <remaining>, never the full cap; run.ts refuses it again if its worst case is over that,
# and holds every call's bound in flight. After it, its result file replaces the marker. A run
# that leaves no priced result file keeps its marker, so its spend counts as unknown and every later run refuses.
# A refusal writes nothing to the ledger. Nothing here ever force-pushes.
set -uo pipefail

: "${LEDGER_REF:?}" "${AUTHORIZED_TOTAL_USD:?}" "${LEDGER_FLOOR_USD:?}"
RUNS="${RUNS:-v248-r1 cand-r1 v248-r2 cand-r2}"
RUN_ID="${RUN_ID:-local}"
LEDGER_DIR="${LEDGER_DIR:-${RUNNER_TEMP:-/tmp}/rba-ledger}"
RESULTS_DIR="${RESULTS_DIR:-evals/career/results}"
# The paid command. Tests replace it with a fake that records each call.
RBA_RUNNER="${RBA_RUNNER:-deno run -A evals/career/run.ts}"

refuse() { echo "REFUSED: $*"; exit 4; }
num() { python3 -c 'import sys; from decimal import Decimal; d = Decimal(sys.argv[1]); sys.exit(0 if d.is_finite() and d >= 0 else 1)' "$1" >/dev/null 2>&1; }
calc() { python3 -c "from decimal import Decimal as D; import sys; print($1)" "${@:2}"; }

# Prints the total of the given result files (or of every *.json in the given directories), or UNKNOWN when any of
# them has no numeric cost or an unpriced call.
tally() {
  python3 - "$@" <<'PY'
import json, math, os, sys
from decimal import Decimal
files = []
for a in sys.argv[1:]:
    files += [os.path.join(a, n) for n in sorted(os.listdir(a)) if n.endswith(".json")] if os.path.isdir(a) else [a]
total, bad = Decimal(0), 0
for path in files:
    try:
        r = json.load(open(path))
        # unmetered_bound: calls that failed or had no usage, charged at their whole bound (run.ts, 2026-10-23).
        c = r["cost_usd"]; parts = [c["brain"], c["judge"]] + ([c["unmetered_bound"]] if "unmetered_bound" in c else [])
        ok = all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and x >= 0 for x in parts)
        if not ok or (r.get("unpriced_calls") or 0) != 0:
            bad += 1
        else:
            total += sum(Decimal(repr(x)) for x in parts)
    except Exception:
        bad += 1
print("UNKNOWN" if bad else f"{total:.6f}")
PY
}

ledger_commit_push() {  # $1 = message. Non-force; a rejected push is a refusal.
  git -C "$LEDGER_DIR" add -A evals/career && git -C "$LEDGER_DIR" commit -qm "$1" || return 1
  git -C "$LEDGER_DIR" push -q origin "HEAD:refs/heads/$LEDGER_REF"
}

check_ledger() {  # Steps 1-5. Sets SPENT and REMAINING.
  for v in AUTHORIZED_TOTAL_USD LEDGER_FLOOR_USD; do num "${!v}" || refuse "$v is not a number: '${!v}'"; done
  local ls rc sha
  ls=$(git ls-remote --exit-code origin "refs/heads/$LEDGER_REF" 2>&1); rc=$?
  git worktree remove --force "$LEDGER_DIR" >/dev/null 2>&1; rm -rf "$LEDGER_DIR"; git worktree prune
  if [ "$rc" -eq 2 ]; then
    [ "$(calc 'D(sys.argv[1]) > 0' "$LEDGER_FLOOR_USD")" = False ] || refuse "the ledger $LEDGER_REF is missing, but \$$LEDGER_FLOOR_USD was recorded: spend unknown"
    git worktree add -q --detach "$LEDGER_DIR" HEAD || refuse "cannot create the ledger worktree"
    git -C "$LEDGER_DIR" checkout -q --orphan "rba-ledger-$RUN_ID" && git -C "$LEDGER_DIR" rm -rqf . >/dev/null 2>&1
    mkdir -p "$LEDGER_DIR/evals/career/results" "$LEDGER_DIR/evals/career/router-before-after"
  elif [ "$rc" -eq 0 ]; then
    sha=$(printf '%s\n' "$ls" | awk -v want="refs/heads/$LEDGER_REF" '$2 == want {print $1}')
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || refuse "ls-remote did not name exactly one commit for refs/heads/$LEDGER_REF: the ledger state is unknown"
    git fetch -q origin "+refs/heads/$LEDGER_REF:refs/remotes/origin/$LEDGER_REF" || refuse "the ledger $LEDGER_REF exists ($sha) but could not be fetched: spend unknown"
    [ "$(git rev-parse "refs/remotes/origin/$LEDGER_REF" 2>/dev/null)" = "$sha" ] || refuse "the fetched ledger is not the commit ls-remote named ($sha)"
    git worktree add -q --detach "$LEDGER_DIR" "$sha" || refuse "cannot check out the ledger $sha"
  else
    refuse "git ls-remote failed (exit $rc): the ledger state is unknown"
  fi
  [ -e "$LEDGER_DIR/evals/career/router-before-after/DONE" ] && refuse "this comparison already ran (DONE on $LEDGER_REF)"
  ls "$LEDGER_DIR/evals/career/router-before-after"/INFLIGHT-* >/dev/null 2>&1 && refuse "a run's spend was never recorded: $(cd "$LEDGER_DIR/evals/career/router-before-after" && ls INFLIGHT-* | tr '\n' ' ')"
  SPENT=$(tally "$LEDGER_DIR/evals/career/results")
  [ "$SPENT" = UNKNOWN ] && refuse "a result file on the ledger has no numeric cost or an unpriced call: the recorded total is unknown"
  [ "$(calc 'D(sys.argv[1]) >= D(sys.argv[2])' "$SPENT" "$LEDGER_FLOOR_USD")" = True ] || refuse "the ledger records \$$SPENT, below the known \$$LEDGER_FLOOR_USD: spend unknown"
  REMAINING=$(calc '(D(sys.argv[1]) - D(sys.argv[2])).quantize(D("0.000001"))' "$AUTHORIZED_TOTAL_USD" "$SPENT")
  [ "$(calc 'D(sys.argv[1]) > 0' "$REMAINING")" = True ] || refuse "\$$SPENT spent of \$$AUTHORIZED_TOTAL_USD authorized leaves \$$REMAINING: nothing authorized remains"
  return 0
}

one_run() {  # $1 = run name. Step 6, the run, then the settle.
  local run="$1" label="rba-$1-$RUN_ID" root commit status
  check_ledger
  root="${RUNNER_TEMP:-/tmp}/${run%%-*}"; commit=$( [ "${run%%-*}" = v248 ] && echo cea914fe || echo 373453f3 )
  local args=(--brain router --set heldout --exclude-file evals/career/heldout-burned.json --brain-root "$root" --brain-commit "$commit" --label "$label")
  # The proven worst case, before anything is written or called (--plan-only makes no provider call).
  local plan exposure
  plan=$($RBA_RUNNER "${args[@]}" --plan-only) || refuse "the runner could not state $label's worst case: no paid call"
  exposure=$(printf '%s\n' "$plan" | awk '$1 == "EXPOSURE_USD" {print $2}')
  num "$exposure" || refuse "the runner's worst case for $label is not a number ('$exposure'): no paid call"
  [ "$(calc 'D(sys.argv[1]) <= D(sys.argv[2])' "$exposure" "$REMAINING")" = True ] || refuse "$label's proven worst case \$$exposure is over the \$$REMAINING that remains authorized"
  local f="$RESULTS_DIR/$label.json"
  rm -f "$f" && [ ! -e "$f" ] || refuse "a stale $f is in the way and cannot be removed: no paid call"
  mkdir -p "$LEDGER_DIR/evals/career/router-before-after" "$LEDGER_DIR/evals/career/results"
  printf 'run %s\nrun_budget_usd %s\nworst_case_usd %s\nspent_before_usd %s\nstarted %s\n' "$label" "$REMAINING" "$exposure" "$SPENT" "$(date -u +%FT%TZ)" \
    > "$LEDGER_DIR/evals/career/router-before-after/INFLIGHT-$label"
  ledger_commit_push "router before/after: $label starting, run budget \$$REMAINING" || refuse "could not record $label on the ledger before the run: no paid call"
  echo "== $run (router from $commit) · spent \$$SPENT · run budget \$$REMAINING (the remaining authorized total) · worst case \$$exposure"
  $RBA_RUNNER "${args[@]}" --run-budget-usd "$REMAINING"
  status=$?
  if [ ! -f "$f" ] || [ "$(tally "$f")" = UNKNOWN ]; then
    echo "STOP: $label exited $status with no priced result file; its marker stays on the ledger and every later run refuses"
    exit 5
  fi
  cp "$f" "$LEDGER_DIR/evals/career/results/" && rm "$LEDGER_DIR/evals/career/router-before-after/INFLIGHT-$label"
  ledger_commit_push "router before/after: $label recorded (exit $status)" || { echo "STOP: $label ran but its result could not be pushed; the marker on the ledger keeps every later run refused"; exit 5; }
  [ "$status" -eq 0 ] || echo "$label did not finish as a score (exit $status); its spend is recorded"
}

case "${1:-}" in
  check) check_ledger; echo "OK: spent \$$SPENT of \$$AUTHORIZED_TOTAL_USD authorized; remaining \$$REMAINING" ;;
  run)
    for run in $RUNS; do one_run "$run"; done
    printf '%s\n' "$(date -u)" > "$LEDGER_DIR/evals/career/router-before-after/DONE"
    ledger_commit_push "router before/after: DONE (run $RUN_ID)" || { echo "STOP: the DONE marker could not be pushed"; exit 5; }
    echo "TOTAL recorded: \$$(tally "$LEDGER_DIR/evals/career/results")" ;;
  *) echo "usage: $0 check|run"; exit 64 ;;
esac
