# Dots independent findings — 2026-10-14 UTC

Dots reviewed the actual-handler campaign and budget implementation without editing code or making paid API calls. This report distinguishes application defects, benchmark defects and missing evidence. The main coding chat and main branch were not changed.

## Application repairs required

- **Nonfinancial intent routing:** “Send my resume to Professor Lee,” “Cancel my interview practice,” and “Cancel that task” enter payment/subscription flows. Reproduction families S24, S25 and S17. Resolve the object and current goal before dispatching a financial verb; retain the secret-data and untrusted-instruction guards. Never claim the résumé or cancellation was executed without delivery evidence.
- **Recipient versus bill ambiguity:** C01632/M32 replaces a pending Greta payment with “send bill 90,” where Bill is a saved recipient. Bill-word filtering prevents resolution. Consult the saved recipient book and require a unique supported match; preserve ordinary bill-payment routing and fresh approval.
- **General conversation memory:** cross-session career facts, corrections, forgetting, references and task progress require model-backed evidence. Deterministic workflow improvements do not prove this broader capability.

## Benchmark repairs required

- Currency assertions reject correctly formatted values such as $1,800.00. The campaign assertion generator now accepts optional thousands separators and escapes decimal points. Preserve original failure transcripts; rerun the corrected benchmark against the same application build.
- Generated “new” recipient Dana can be a typo-near match for saved Hana. The generated fixture now uses Zophir, outside the saved-name set, to test genuinely new recipients.
- Authorized inference POSTs must not count as real delivery/financial writes. The action assertion now excludes explicitly marked paid_model operations.
- Semantic cases currently remain BLOCKED even with a key. Add evidence-backed semantic grading before using their results for memory, awareness or fluency scores. A judge using the same small model is provisional and needs independent review.

## Budget repairs and limitations

Dots identified that n:10 could reserve for only one completion. The budget now rejects n other than absent/1, streaming, audio and nontext message content. Seven budget tests pass. Reservation enforcement also respects a persisted lower budget. Unknown receipts retain their reservation and stop further calls after three incidents.

The ledger uses conservative UTF-8/framing estimates for single text completions; this is not a provider-certified tokenizer bound. A provider-side project spending cap is the strongest additional backstop. Stale locks fail closed after crashes; recover only after confirming the owning process has terminated, preserving the ledger.

## Evidence still missing

Authentication, database persistence and faults are synthetic. Three deterministic trials establish repeatability, not independent samples. Mock or/and filters, real RLS, concurrency, actual delivery and process-crash recovery need separate validation. The endpoint health check reports model_configured:false and $0 charged. No paid model calls have occurred. The secure UPMORE_AUDIT_MODEL_KEY binding remains missing.

The running 3,500-case campaign consists of 100 scenario families with parameterized variants. Its original failure count includes the benchmark defects above and must not be published as a verified general capability score.
