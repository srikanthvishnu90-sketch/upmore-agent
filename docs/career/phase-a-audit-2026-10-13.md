# Phase A — Baseline & Claim Audit (Reply-Quality Program, 2026-10-13)

Governing document: owner's Diagnosis/Repair Brief (Oct 13), which refines the brutal analysis.
Everything below was verified against the repo, the deployed project, or the evidence files on
2026-10-13. Coordinator spot-reproduced three worker claims independently (marked ✓).

## 1. Version map

- **Repo:** `srikanthvishnu90-sketch/upmore-agent` · worktree `~/workspace/upmore-career` ·
  branch `pivot/career` · audited base **`be88881`** (verified: finisher tip) · tip at audit
  close **`cd7bb69`** after this program's verified merges (reply composer `0434b45`, board
  registry `b8de356`, reply oracle `cd7bb69`) and the DOCX reverts (`17e2307`, `c262ecb`).
  Working tree clean.
- **Deployed backend** (Supabase `mrwngntwmnaqrqhupvlt`, read live via sb.py, 2026-10-13):
  agent-chat **v219** ACTIVE · gmail-oauth v14 · imessage-inbound v25 · agent-exec v65 ·
  exec-vault-store v35 · broker-oauth-start/callback v11 · agent-proactive v8 ·
  model-health v8 · manual-connect v1 · plus the finance rails (plaid v30, simplefin v31/26,
  stripe v26/26/27, cancel-watcher v27, news-feed v29, delete-account v30).
- **Deployed vs branch — the headline:** `grep -i career` over the production chat sources
  (`agent-chat/handler.ts` 1,710 lines, `agent-chat/agent_core.js`, `_shared/flow_router.ts`)
  returns **zero matches**. Career modules exist only as unused exports inside
  `router_core.js`. **There is no deployed career agent.** agent-chat v219 is the finance
  product (v216 @ f2ffce9 + three finance-run deploys). Everything the owner has "seen" of the
  career product is harness transcripts — a staging surface. Career code, including the new
  composer, has never been deployed (deploys are the owner's, Phase F).
- **gmail-oauth nuance:** a function with that slug IS deployed (v14) — it predates the career
  branch (the founder's existing Google OAuth client). The *career* grant flow from
  `pivot/career` has never been deployed. The overnight report's "not deployed" is true of the
  career flow, imprecise about the slug.
- **Frontend:** no production domain/alias in repo config; Vercel git previews only. No live
  frontend stamp exists to compare — the owner's hands-on surface was the transcripts.
- **Resume formats (conflict resolved):** current tree `123-career-tailor.js render()` =
  text + markdown, `pdf: null` (honest — no PDF renderer). DOCX was built 2026-10-13 under the
  superseded critique brief (`de0f634`), merged, then **reverted** (`17e2307`, `c262ecb`) when
  brief §6.3 arrived; code preserved on branch `career/rq-docx`. **DOCX = open owner decision.
  PDF = not built.**

## 2. Message-path trace

**Production path:** app → `agent-chat/handler.ts` (guards → deterministic flows via
`flow_router.ts`/`agent_core.js` over `router_core.js` domain modules → flow `{reply, action}`
→ finance-scoped post-guards `guardMoneyClaim`/`guardSecretAsk` → reply string returned
verbatim → client renders). iMessage: LoopMessage → `imessage-inbound` → message-turn/worker.
**Serialization risk points:** flow `.reply` strings are trusted verbatim; an object landing in
a string slot stringifies raw (`${ctx.note} ${body.reply}`, handler.ts:133; drop-note concat
:473). **No composer on this path, no career route on this path, no false-completion guard for
career claims** (the money-claim guard is finance-only).

**Harness path (what all 300 scenarios / 405 transcripts actually exercised):** scenario script
→ domain modules directly → script authors `s.agent(text)` / `s.card(payload)` → harness
`renderCardHtml` flattening → `.md`/`.png` evidence. The harness **bypasses** intake, parsing,
routing, production composition, transport, and the real display layer.

**Failing boundaries:**
- **B1** scenario-script text authoring — JSON, IDs, jargon typed straight into bubbles.
- **B2** harness card renderer — flattening strips keys matching `/id|uuid/` but renders
  `fact_ids` values, and some card shapes fall back to raw JSON in the PNG.
- **B3** harness `finish()` — verified from rail state only. **REPAIRED this program**
  (oracle merge `cd7bb69`): reply assertions + typed `result_status` now recorded; a claimed
  COMPLETE with a hard-fail reply is written as FAIL.
- **B4** production handler — no composer, no career route, verbatim reply trust.
- **B5** list parser — date ranges misread as quantities (D-09).

## 3. Thirty-transcript audit (20 stratified + 10 deterministic-random; .md + .png read)

Full record: `docs/career/phase-a-audit-30.md` (this folder; raw outputs also in
`~/workspace/upmore-rq-runs/`). Defects per 30, scored on user-visible bubbles:

| Defect | Count | | Defect | Count |
|---|---|---|---|---|
| Internal jargon | 21 | | Missing next step | 7 |
| Machine payload in bubble | 18 | | False/inflated completion | 3 |
| Raw-ID leak | 11 | | Empty reply | 0 |
| First bubble >6 sentences | 7 | | Finance leak / tool marker in rendered bubble | 0 / 0 |

Severity: **P0 15 · P1 10 · P2 3 · P3 2**. Tone: human 3, stiff 15, log-like 12.
Cards: of 17 card-carrying first bubbles, **10 render as raw JSON in the PNG**; formatted cards
still leak (`TEST-msg-interview-datadog`, `ref-87900ada`, `draft_on_card`, `start_career`, raw
scope URLs). Tool blocks never render into bubbles (the .md evidence blocks are not
user-visible — the parent lint's tool-marker count measured the evidence format, not the chat).
Finisher-canonical sample (n=2, both prep): zero payload/ID/P0 — leakage repaired — but both
still over-length and jargon-bearing (`scoreCaseResponse` ×7, `[label: community-reported;
official: false]`, `(grounded in the company file: true)`, a source string truncated mid-word).

## 4. Defect table

### CONFIRMED (reproduced, evidence in hand)
| ID | Sev | Defect | Boundary | Evidence | Repair / status |
|---|---|---|---|---|---|
| D-01 | P0 | Card renders fact IDs to the user ("Fact Ids: F-010; F-013; …") | B2 | SC-097; ✓ coordinator reproduced under new oracle 2026-10-13 (FAIL `fact-id` @seq 3) | Renderer strip of `*_id(s)` values = Phase B; oracle hard-fail DONE |
| D-02 | P0 | Cards render as raw JSON in the chat PNG (10/17 sampled) | B2 | SC-008 (4,241-char card), SC-146 (`person_id` for 7 people) | Phase B renderer fix |
| D-03 | P0 | False completion — queued stated as sent; fixtures stated as "proven" | B1 | SC-037 ✓ ("queued" in outcome vs "sent" in reply); SC-286 | Oracle `false-completion` rule DONE; content re-proof Phase E |
| D-04 | P0 | Machine payload inside prose bubbles (18/30) | B1 | SC-285 inline `by stage {"Offer":1,…}` mid-sentence ✓ | Composer routing DONE in harness; scenario re-runs Phase E |
| D-05 | P0 | Internal instruction text printed to the user, twice | B1 | SC-285 ✓ "behind — adjust the plan with the user, don't quietly lower the target" | Phase B content fix + oracle jargon coverage |
| D-06 | P1 | Walls of text (SC-221 first bubble 11,547 chars / 54 sentences; SC-222: 79) | B1 | audit counts | Composer doc-offload; Phase E re-proof |
| D-07 | P1 | Internal jargon as user language (21/30) | B1 | SC-185 finisher (`scoreCaseResponse` ×7) | Phase B |
| D-08 | P1 | Dead-end turns: closing user message unanswered; no next step (7/30) | B1/B3 | SC-097 ✓ (FAIL `empty-reply` @seq 4, coordinator repro) | Oracle catches; content Phase B/E |
| D-09 | P1 | List parser misread: "2023–25 analysts" → `"count": 2023` | B5 | SC-008 card payload ✓ | Phase B replay test + parser fix |
| D-10 | P1 | Production path has no career route and no composer | B4 | §2 grep evidence | Phase B wiring design; deploy = owner (Phase F) |
| D-11 | P2 | Overlapping module sources (132 apply/apply3, 135 graph/138 graphcore, vendored 126–129 per BUG-101) | — | tree listing | Dedupe to single sources, Phase B |
| D-12 | P2 | Dead job boards | — | **REPAIRED this program** (`b8de356`): Ramp→Ashby live (200, 165 postings, coordinator re-curled ✓); Goldman/Netflix/Square/Visa marked dead with curl evidence (404s ✓) | done |
| D-13 | P2 | One collapsed scoreboard swung 231→276→298 under shifting definitions | — | report history | Method repaired: proof axes separated from Phase E on; old totals relabeled "engine completion" |

### SUSPECTED (code path exists, no live instance captured)
- Production `[object Object]`/raw-JSON interpolation via handler.ts:133/473 — staging-only
  evidence; no deployed career surface exists to reproduce against.
- Latency: unmeasured everywhere. Harness timestamps measure script time, not product latency.

### HISTORICAL — ALREADY REPAIRED (not re-counted)
- Finisher prose pass (`604f5ee`): 127 output strings de-jargoned; PRECANON renames (80 files)
  stopped stale evidence posing as canonical; SC-121–140 / SC-281–285 evidence gaps closed.
- B3 oracle boundary (above). Board registry (D-12).

## 5. Existing presentation path — inventory (brief: consolidate, never duplicate)

1. Harness `renderCardHtml`/`humanValue` — de-facto card formatter; inconsistent (D-02).
2. `scripts/career/prose-lint.cjs` — finisher's plain-words lint over renders (a checker).
3. Domain modules' own output strings — the raw material every script re-wraps by hand (B1).
4. **`140-career-reply.js` CareerReply (NEW, this program)** — typed composer; harness `agent()`
   already routes through it (oracle merge). **Phase B consolidation:** CareerReply is the ONE
   composer; harness card flattening routes through the same sanitizer; prose-lint demoted to a
   check over composer output; production wiring designed against the same module. No second
   formatter will be built.

## 6. Plan from here (per brief; gates untouched throughout)

- **Phase B** — response/state repair: card-renderer sanitization (D-01/D-02), parser fix
  (D-09), universal fallback wrapper for handlers (human message + logged failure + replay
  test), typed `result_status` adopted across scenario outcomes, module dedupe (D-11).
- **Phase C** — multi-turn/recovery: the brief §8 fifteen conversation tests + probes
  (why / second one / correction / reply-to-older / topic switch / burst / stale approval /
  cancel), against module state, not scripted text.
- **Phase D** — three deep end-to-end workflows on the repaired path.
- **Phase E** — release validation under thresholds frozen BEFORE the run: 300 canonical
  re-runs + 5 meaning-preserving variants each (1,500 inputs, held-out subset the fixes never
  see), judge = 6 dimensions × 0–4 with safety auto-fail, distributions BY FAMILY; publish in
  the overnight report with separated proof axes and 20 random raw transcripts named.
- **Phase F** — owner's pilot call (incl. DOCX decision and any deploy). Not ours.
