# Typed context and reviewed readback repairs

Owner-review code only; no production application or deployment. B runtime
b414b042 and modules 127/130/155 remain unchanged. No provider call occurred.

The actual default-off interview entry now accepts narrowly typed `save_fact`
and `save_resume` commands. Identity, scope, provenance, permissions, logical
stamps, current binding and source SHA come from the host. The caller must
explicitly declare an actual statement; evidence stays **user-reported**, not
independently verified. A resume remains untrusted source text and is never
parsed into personal qualifications automatically. New item versions start at
zero; corrections require the exact current version. No source text is cut.
Facts have the canonical 2,000-character limit and resumes retain the existing
4,000-character entry limit. Invalid/oversized input is refused.

Context, typed invalidation, dependent B state and ordinary turn receipt commit
atomically. Resume replacement preserves its source identity, updates the exact
source/fact version, marks dependent attempts/feedback stale, retains original
answer text and updates the explicit selection. Scope of this first writer is
the owned interview context. It does not import arbitrary legacy history or
claim to implement every context-v3/legacy memory writer.

Independent review confirmed that browsers could not read the required receipt
header, and acknowledgement caused a verified pack to return 404. Artifact
responses now expose only that header for the unchanged approved origins.
Artifact routes advertise GET/OPTIONS; ordinary chat stays POST/OPTIONS.
GET is CORS-safelisted: the first test's Allow-Methods-only failure was an oracle
misdiagnosis, retained separately. The corrected frozen test reproduces missing
header exposure. These HTTP protocol tests model browser enforcement; Chromium
itself remains NOT_RUN because its normal sandbox cannot launch here.

Acknowledged artifacts retain a separate current delivery binding and require
the owned original readback proof. Verified bytes remain downloadable after
restart; reopening creates a distinct retrieval receipt that cannot be used as
a new acknowledgement. Foreign ownership, changed journey/evidence and erase
still revoke the old pack. Bytes and original creation proof remain unchanged.

The privacy sweep's reported digit substring inside the complete commit SHA
315158f5314360417266270ec6e6e9e71aad0af8 is repaired by recognizing complete
40-character lowercase hexadecimal values only in explicit JSON provenance
fields. Malformed JSON, prose, partial hashes, financial fields and neighbouring
sensitive numbers are still scanned. The evidence SHA and all swept paths stay
unchanged. Positive account/card/routing/SSN controls and full sweep pass.

Frozen native writer tests: initially 0/3, then 2/3 (future logical-stamp planning
error), then 3/3. The added replay oracle found stale writer response reuse;
all 4 pass after repair. Readback tests: corrected 0/2 before repair; all 3
including typed-context revocation now pass. Existing 10 entry cases passed the
readback SQL repair. Combined targeted source: 209 checks passed; native Deno
checks and the existing 2 CORS tests passed. All earlier failed logs are retained.

Assessed generation/checker execution and unknown-settlement/retry remain the
next integration work. Actual model quality and all 15 live browser tasks remain
NOT_RUN. No paid call, shared allowance seed or production mutation is permitted.
