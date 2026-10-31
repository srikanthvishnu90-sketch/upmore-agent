# Architect-owned Deno 2.1.4 compatibility handoff

VERIFIED: the published Supabase Edge Runtime v1.76.2 manifest pins Deno 2.1.4. Its immutable source provenance is being recorded in the environment pin. Hosted runtime metadata remains NOT_VERIFIABLE here.

VERIFIED: 20 architect test files use text import attributes unavailable in Deno 2.1.4; the attached raw log shows the loader failure. The proposed patch replaces only those text imports with Deno.readTextFileSync(new URL(path, import.meta.url)); assertions are unchanged. It passes git apply --check on trunk eb57e812. NOT_RUN: those 20 files after applying the patch.

The root AGENTS.md says **“Never edit an architect test.”** Accordingly this patch has NOT been applied. The architect needs to review/apply it to its own test files and return the SHA; the full architect gate under Deno 2.1.4 remains blocked on that ownership handoff. The branch contains the proposed diff so it is accessible outside this machine.

Other pin blockers: confirm the recent hosted runtime_version metadata and populate the remaining production SDK graph integrity entries from a network that can fetch deno.land and esm.sh (this environment receives CONNECT 403). The checked-in Edge-only graph does pass 895/0 with --frozen in the working pin, but it does not establish the entire function graph is locked. No fabricated checksums or assertion relaxation is proposed.

Ledger: $0 new; $8.573843 recorded, UNRECONCILED. No deploy, live migration, submit path, flags or enrollments changed.
