# Actual A producer compatibility — FAIL, no producer substitution

A producer commit: `3a41cd456cbdbe53639275ae83096b9fb91aa33d`.
Canonical schema SHA-256:
`e9d67853dc0476391c49b7d5140031a04e64a5a47f69f9fe073f5f013b93b022`.
The source paths are A-owned `packages/career-contracts/`; B never edits them.

The executable consumer probe reads the actual files through `git show`, checks
A's freeze hashes, loads A's real TypeScript runtime validator, verifies its
embedded schema equals A's JSON schema, and independently applies Ajv 8.17.1
with standard format validation. It executes A's actual 3 positive and 9 negative
examples. All 12 expectations hold, including cross-field negatives that only
A's runtime validator can reject. These are contract checks, not provider quality.

The one A producer context then fails B's unmodified provisional consumer with
`foreign evidence owner/scope`. The fixture is owned correctly under A's schema;
B is expecting a different row representation. No canonical transition has run.
The full report is `evidence/B4-audit/canonical-producer-3a41cd45.json`.

## Concrete DTO differences

| Surface | Actual canonical A v1 | Existing B internal representation |
| --- | --- | --- |
| Item identity and scope | `item_version`, nested `scope.kind/owner_id/thread_id`, logical created/effective stamps, freshness | `version`, row owner/thread fields, scope string, epoch validity |
| Facts | Primitive/string-array values; status and source IDs | Structured target/resume selection objects plus project evidence |
| Capabilities | `capability_id`, `availability`, reason | Internal IDs, `status`, version, optional approved-source metadata |
| Event | Versioned event ID/time/turn digest/binding, closed outer type, bounded payload | Typed domain command, ID/time and command-specific fields |
| State | Versioned envelope with revision and opaque bounded `data` | Versioned flat domain checkpoint with content hashes |
| Reply | Versioned blocks and evidence-linked claim inventory | Internal status/text/ask plan |
| Proposal | `career_action_proposal/v1`, string source IDs, `host_derives_requirement`, closed args | Internal proposal version, versioned refs, `host_derived`, full reasoning/artifact payload |
| Coach args | Answer/question refs and rubric revision | Complete bounded reasoning request and ceilings |
| Draft args | Kind/media/content/versioned dependencies, content limit 32,000 characters | Structured pack, Markdown and manifest |

An explicit B-owned DTO adapter can map field/marker/envelope names. It must
preserve canonical identity/version/scope, original turn/CAS binding and A's
host-derived approval marker. It cannot promote posting text into personal facts,
infer a structured target from untyped prose, silently truncate a reply/file, or
change input-digest semantics when replacing full args with owned references.
The shared runtime additionally bounds JSON depth and total input size; those
limits need real consumer cases before an adapter is registered.

## Host proof and reference-resolution contract needed from A

1. **Selected target/resume projection:** identify explicit canonical fields or
   owned references for selected role/family/level/company/stage and resume
   version/hash. B must retain their actual IDs, never invent a canonical row or
   infer employer/ownership from source text.
2. **Owned reasoning payload resolution:** define where canonical coach refs
   resolve to the complete B reasoning request in the existing owned checkpoint,
   and exactly what `input_digest` covers. No new persistence infrastructure is
   proposed; the checkpoint already retains the request. A owns paired admission,
   authoritative accounting and actual reference lookup.
3. **Versioned candidate/outcome proof profile:** canonical `ReceiptV1` exposes
   action/input IDs and a short `observed_state`; it has no candidate hash,
   reasoning digest, original/current binding pair, generator identity or paired
   settlement details. A must define a trusted typed event/lookup profile carrying
   those proof details and its exact receipt reference. B will not invent a JSON
   encoding inside `observed_state`, trust a model-written success, or treat an
   `authoritative: true` field alone as proof of the supplied candidate.
4. **Source and artifact readback profile:** canonical sources expose content,
   canonical URL/hash/time; artifacts expose retrieval refs and receipt IDs,
   without readable file bytes. Define the host-authorized readback supplying
   actual requested/final source provenance and exact artifact bytes/version,
   target/resume binding and fresh-session open proof. Metadata alone cannot
   complete research or artifact delivery.
5. **Host-approved command payloads:** define the versioned mapping from A's
   closed outer event types to B commands. Advisory candidate text cannot turn
   itself into a correction, approval, provider-outcome settlement or erasure.
   Failure/unknown recovery must preserve the existing shared-budget fence even
   after pause/stop. Genuine producer cases must cover those transitions.

The current A examples demonstrate a generic project fact and a question
transition. They contain no actual journey-event, reasoning-outcome or artifact
readback sequence. Those scenarios remain unexecuted, not implied passing.

Spec B section 15 explicitly stops dependent work on an incompatible A contract.
This is a concrete integration dependency, not a permission denial. Pure-module
audit fixes and CI verification continue independently; A/Muse retains shared
schema, entry, persistence and merge ownership. Real coaching quality is NOT_RUN.
