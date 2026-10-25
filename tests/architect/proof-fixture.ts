// G6 (D-024): the proof the real engine returns with a click (scripts/apply.ts), for tests whose engine is a stand-in:
// bound at capture to the application the queue passed (--application-id) and the approval it ran under (--approved).
// runApproved records "confirmed" only with such a proof (tests/architect/proof-g6.test.ts drives the real engine).
export function proofFor(args: string[]) {
  const arg = (k: string) => args[args.indexOf(k) + 1];
  const id = arg("--application-id"), run = "run-" + id;
  const shot = (kind: string, seq: number) => ({ kind, file: `proof-${seq}-${kind}.png`, sha256: String(seq).repeat(64).slice(0, 64), seq, at: seq, run_id: run, application_id: id });
  return { run_id: run, application_id: id, approval_hash: arg("--approved"), payload_hash: "d".repeat(64),
    before_click: shot("before-click", 1), click: { seq: 2, at: 2 }, after_submit: shot("after-submit", 3) };
}
