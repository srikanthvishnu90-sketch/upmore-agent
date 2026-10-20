# CHANNEL-DOC-1 — document delivery over the channels (LANE B record, 2026-10-20)

Branch `work/channel-doc-1`, base `75ccf5f5` (= live agent-chat v238). **Not deployed.**
Feature Depth Program v2, Lane B. Bug law: BUG-PENDING-ALLOCATION (channel-doc-1) +
FR-PENDING-ALLOCATION (channel-doc-1) — numbers requested from Crew A per MI-093.

## What a user now gets (tier 2 — harness proof; the live deploy is the owner's tap)

One honest caveat, detailed in §5 below: this journey runs on the composition in
which the core renders (the repo's harness standard). On today's deployed Deno
composition the renderer itself refuses (no-`require` bundle posture — a pinned
invariant owned by the bundle/renderer owners), so a live tailor turn currently
produces no bytes for the contract to carry; the contract stays honest there
(nothing claimed, nothing sent) and delivers unchanged the moment the renderer
lights on the edge.

**Telegram** — the user sends: *"tailor my resume for the New Grad Software Engineer
role at Northwind Ledger (fictional) and send me the PDF as a file in this chat"*
(battery execution CB-0495, verbatim). They receive the tailor reply as text, then the
file itself: a `sendDocument` multipart upload, `Alex_Testcase_Resume.pdf`, 1,708 bytes,
sha256 `7a143136805ccea5da8809992d51114c803fd1f631710fdf1d7b26e60bf7cf93`. A follow-up
*"send me the PDF as a file in this chat"* re-delivers the byte-identical file
(intent `career_document_delivery`).

**WhatsApp** — the same ask returns the reply text, then a media message whose MediaUrl
is a signed, expiring URL on `whatsapp-inbound` itself
(`?artifact=<id>&u=<user>&exp=<+600s>&sig=<HMAC-SHA256>`). When Twilio fetches it, the
function verifies the signature and serves the same 1,708 bytes
(`application/pdf`, `Content-Disposition: attachment`) — same sha256 as Telegram's file.

**No document yet** — *"send me the PDF in this chat"* on a fresh thread answers:
"There is no document file on this conversation yet to send you. … Name the role (or
paste the posting) and I will tailor your resume and send the PDF here." — zero file
sends, no attachment claimed, no outreach-wave language.

Before this lane (battery, 2026-10-19, both surfaces), the CB-0495 ask got:
"Nothing was sent — here is exactly where it stands. Nothing is built in this
conversation to send: no list, no draft, no approved plan — so there is no wave that
could go out…" and no file could ever arrive on any channel.

## What was built

1. **Routing repair (142-career-router.js, document-delivery regions only).**
   `isDocumentDeliveryAsk` + `handleDocumentDelivery`, dispatched immediately before
   `handleSendAttempt` in the drafting block; `handleSendAttempt` stands down for
   document-delivery asks. Combined tailor+deliver asks reach the tailor branch;
   pure asks serve the thread's latest byte-carrying tailored artifact as the result's
   `documents[]`; third-party sends are never claimed; the campaign wave gate is
   unchanged (guard-pinned).
2. **The contract (agent-chat).** `documentsOf(result)` (delivery documents +
   the tailor artifact's PDF, deduped by hash) is materialized by handler-career.ts
   into the new owner-scoped **`channel_artifacts`** store (migration
   `20261020000000_channel_artifacts.sql`, RLS on, no policies, service-role only,
   7-day row expiry — **not applied; operator step, like the other channel
   migrations**). The reply gains `artifacts: [{kind:"document", ref, filename, mime}]`
   — a bytes-ref, never the bytes, never a URL. A document that fails to store is
   dropped from the contract and said so on the reply.
3. **Shared seam (`_shared/channel_artifacts.ts`).** Materialize / owner-scoped fetch
   (user always, thread where known, expiry always) / HMAC-signed expiring media URLs
   (secret: `CHANNEL_ARTIFACT_SECRET`, fallback the function's Twilio auth token;
   timing-safe verify, fail-closed).
4. **Senders live.** Telegram: ref → owner+thread fetch → multipart `sendDocument`
   with the exact bytes; legacy URL artifacts keep the exact baseline path.
   WhatsApp: ref → signed function URL as MediaUrl; a new GET route on
   whatsapp-inbound (before the Twilio signature gate — a media fetch is not an
   inbound message) verifies and serves: tampered/swapped/expired 403, validly-signed
   unknown ref 404. A ref that resolves to nothing sends nothing and speaks
   `VOICE.docAttachFailed` on both channels.
5. **The renderer finding (deeper layer — recorded as a product defect, NOT fixed
   in this lane).** Probing the deployed composition under Deno showed the tailor
   artifact's `pdf` is **null on the edge runtime**: module 148 captures
   `require("zlib")` at eval time and `require` does not exist in the ESM bundle, so
   every live tailor turn renders text-only while the reply says "attached for your
   review" (the renderer's own refusal: "zlib is unavailable in this runtime; PDF
   rendering needs Node"). This lane attempted the narrow fix (a builtins-only
   `require` shim ahead of the bundle in handler-career) and **reverted it**: the
   repo's staged-entry guards (tests/career-bundle-reachability.test.cjs et al.)
   pin, as deliberate product law, that the handler graph links and executes with
   **no `require` at all** — the shim broke that invariant's letter (a static
   `node:` import cannot link in their ESM-only realm) and its async variant made
   bundle evaluation order racy under Deno. The no-require posture is the bundle
   owners' invariant to change, not a channel lane's. What this lane guarantees in
   its presence: the contract is honest — `documentsOf` drops byte-less artifacts,
   so on today's edge composition a tailor turn carries **no** artifacts[] entry
   and no channel claims or sends a file; the moment the renderer lights on the
   edge (or in any composition where the core renders, as in the harness below),
   the same turn delivers the file with no further change. The defect, its probe
   evidence, and this analysis are the hand-off to the renderer/bundle owners.

## Proof (fail-first throughout; baselines on pristine 75ccf5f5)

- `tests/career-document-delivery.test.cjs` — 6/6 (was 3 red on the base: CB-0495
  reproduced the battery's outreach reply byte-for-byte; controls green before and
  after, plus the named-recipient control added when the sweep caught the C23
  shape). Router runs through the real CareerHost.
- `tests/edge/channel-artifacts.test.ts` — 5/5. `tests/edge/telegram-documents.test.ts`
  — 3/3. `tests/edge/whatsapp-documents.test.ts` — 2/2.
- `tests/edge/channel-documents-e2e.test.ts` — 1/1: the full CB-0495 journey over both
  real bridges against the real host + the real domain chain (packages/domain — the
  bundle's own sources, composed as every repo harness composes them; bundle
  equivalence is pinned by tests/router-bundle.test.cjs --check); both channels'
  files byte-identical and hash-bound to the stored artifact row; the follow-up ask
  re-delivers the identical bytes.
- Baselines held: edge suite **764 passed / 0 failed** (base: 753 passed / 0 failed —
  the delta is exactly this lane's 11 new fixtures); node sweep **4,450 tests /
  4,396 pass / 13 fail / 41 skipped** (base: 4,444 / 4,390 / 13 / 41 — the delta is
  exactly this lane's 6 guard tests; the failing set is the baseline's own 13:
  D11×5/D12/D13/D14×2 Chromium-env, C37×2 stale pins, fact-bank coverage ×2).
  The sweep earned its keep on the way: its first full run on this tree caught
  three real flips the targeted fixtures had missed — "send Alex my resume"
  (gauntlet C23/NW13, a NAMED-recipient outreach draft) matched the delivery
  predicate's "send … my resume" branch. The predicate now excludes named
  recipients structurally (a non-filler word between verb and determiner, or a
  "to <anyone but me/this chat>" destination), the guard carries both shapes as
  permanent controls, and the re-run is the zero-flip result above.

## Transcript (tier 2, harness — transports doubled, every product piece real)

```
=== TELEGRAM ===
user: tailor my resume for the New Grad Software Engineer role at Northwind Ledger (fictional) and send me the PDF as a file in this chat
  [agent-chat] intent=career_tailor documents=1 artifacts[]=[{kind:"document", ref:"b8948d14…", filename:"Alex_Testcase_Resume.pdf", mime:"application/pdf"}]
  [agent-chat reply] "Your resume is tailored for New Grad Software Engineer at Northwind Ledger.\nIt leads with your proven skills for this role: Python, JavaScript, PostgreSQL, React, and every line traces to a fact already on your profile. Skill gap, named plainly: Git is required by the posting and not on your profile, so it was not added to the resume. Eligibility verdict: this record meets the posting's hard requirements, but some required skills the posting names are not evidenced in the record — they are named in the gap list that travels with this packet.\nSaved as PDF and DOCX files, attached for your review — parse check PASS. Grounded in your own profile record and the posting's own text, as of October 2026. Review the artifact, and I can prepare the Northwind Ledger application packet next."
telegram sendMessage: "Your resume is tailored for New Grad Software Engineer at Northwind Ledger.\nIt leads with your proven skills f"…
telegram sendDocument (multipart upload): filename=Alex_Testcase_Resume.pdf bytes=1708 sha256=7a143136805ccea5da8809992d51114c803fd1f631710fdf1d7b26e60bf7cf93

user (same thread, follow-up): send me the PDF as a file in this chat
  [agent-chat] intent=career_document_delivery documents=1 artifacts[]=[{kind:"document", ref:"db41cbce…", filename:"Alex_Testcase_Resume.pdf", mime:"application/pdf"}]
  [agent-chat reply] "Your tailored resume for Northwind Ledger — the PDF is attached to this message.\nDocument: Alex_Testcase_Resume.pdf — the tailored cut for Northwind Ledger, rendered from your confirmed facts. Want a different cut for another role, or the packet prepared next?"
telegram sendMessage: "Your tailored resume for Northwind Ledger — the PDF is attached to this message.\nDocument: Alex_Testcase_Resum"…
telegram sendDocument (multipart upload): filename=Alex_Testcase_Resume.pdf bytes=1708 sha256=7a143136805ccea5da8809992d51114c803fd1f631710fdf1d7b26e60bf7cf93

=== WHATSAPP ===
user: tailor my resume for the New Grad Software Engineer role at Northwind Ledger (fictional) and send me the PDF as a file in this chat
  [agent-chat] intent=career_tailor documents=1 artifacts[]=[{kind:"document", ref:"2308a002…", filename:"Alex_Testcase_Resume.pdf", mime:"application/pdf"}]
  [agent-chat reply] (same tailor text as the Telegram leg)
twilio send (text part): "Your resume is tailored for New Grad Software Engineer at Northwind Ledger.\nIt leads with your proven skills f"…
twilio send: Body="Alex_Testcase_Resume.pdf"
twilio send: MediaUrl=https://fixture.supabase.co/functions/v1/whatsapp-inbound?artifact=2308a002-e957-4eec-afb1-50f4c4e3353a&u=2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3&exp=1792475990&sig=c7af7386483026204d260d94a0447ccc3a02396138afab50eaa9e3b5bff59a54

[twilio fetches the MediaUrl]
GET -> HTTP 200 content-type=application/pdf content-disposition=attachment; filename="Alex_Testcase_Resume.pdf" bytes=1708 sha256=7a143136805ccea5da8809992d51114c803fd1f631710fdf1d7b26e60bf7cf93

=== NO-DOCUMENT ASK (fresh thread, nothing tailored yet) ===
user: send me the PDF in this chat
  [agent-chat] intent=career_document_delivery documents=0
  [agent-chat reply] "There is no document file on this conversation yet to send you.\nA file exists here only once a resume has been tailored in this chat — tailoring renders the PDF from your confirmed facts, and the file then rides with my reply. Name the role (or paste the posting) and I will tailor your resume and send the PDF here."
telegram sendMessage: (same text)
sendDocument calls on that turn: 0
```

(Fixture hostnames/user ids are the repo's own channel-test fixtures — the test user
and the TEST persona "Alex Testcase"; Northwind Ledger is the battery's fictional
company. Reproduce: the permanent guard is the e2e fixture above.)

## Operator steps before this can go live (not done by this lane)

1. Apply migration `20261020000000_channel_artifacts.sql` to the upmore project.
   (Not exercised against a live Postgres by this lane: tests/db/run.sh needs
   Postgres binaries and a non-root user, neither present on this VM; the migration
   mirrors 20261019000000/20261019010000 clause for clause.)
2. Optionally set `CHANNEL_ARTIFACT_SECRET` on whatsapp-inbound (else the Twilio
   auth token already on the function signs the media URLs).
3. Deploy on the owner's word, on the exact commit, per standing law.
