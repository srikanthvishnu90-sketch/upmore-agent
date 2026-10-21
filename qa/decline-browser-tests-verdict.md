# QA VERDICT — the 14 SKIPPED browser tests from the decline-vocab lane (Task 2)

- **Pinned SHA:** `04e24fde260a4e43c81a9aab65fd373a766879af` (module 149 decline-vocab fix, branch `muse/2026-10-21-decline-vocab`) — tested exactly at this SHA.
- **QA worktree/branch:** `~/workspace/qa-decline-browser-wt`, branch `qa/decline-browser-tests` @ 04e24fde. No product code, no `package.json`, no test file modified anywhere. The entire fix is two environment variables (below).
- **CAREER_AGENT_SUBMIT:** unset in the shell env and explicitly stripped from every run (`env -u CAREER_AGENT_SUBMIT`). Zero real-world submits. The only submit clicks that occurred are the suite's own designed clicks against `localhost` fixture pages (confirmation-capture and D3-arming tests), which is what those tests exist to prove.
- **Tier:** Tier 2/3 — test suites driven by QA on this VM. No product-chat-path or live-board claim is made.

## Verdict

**RUNNING — 11 pass / 3 fail / 0 skipped, duration_ms 127,018 (wall ~127s) on 04e24fde.**
The decline lane's "14 SKIPPED / NOT_RUN" is closed: the suite runs end-to-end in real Chromium on this VM with no install and no code change. The one directly decline-relevant browser test, **D8, PASSES**. The 3 failures are **pre-existing on base `cea914fe` with the identical failing name set** (QA re-ran the whole suite there: 11 pass / 3 fail, duration_ms 107,121) — the decline fix introduces **zero** browser-suite regressions. The failures were previously *hidden by the skip*, and are filed below as bugs BUG-QA-2026-10-21-02/-03, returned to the build lane (QA does not fix forward).

---

## 1. Which tests, and what they prove

The 14 are the whole of **`tests/career-portal-browser.test.cjs`** ("CA-03 real-board browser seam"), the suite the decline doc (`docs/career/decline-vocab-2026-10-21.md`, Results section) reported as: *"career-portal-browser: 14/14 SKIPPED in this environment (Playwright not resolvable) — same posture as base; NOT_RUN, not a pass."*

Relevance to the decline fix, stated honestly: this suite is the browser-tier regression surface for the 149 pipeline the decline gate lives in (every test drives `Portal.runApply` from module 149 through the real Playwright driver, module 150 + `scripts/career/portal-browser-helper.cjs`, against localhost fixture pages). Only one test exercises decline wording directly through the browser; the decline meaning class itself (`EEO_DECLINE_MEANING` / `eeoDeclineMatch` / `isEeoDeclineText`, module 149) is proven by the separate unit suite `tests/career-decline-vocab.test.cjs`, which QA re-ran here: **12/12 pass, duration_ms 487** (confirms the lane's claim).

| # | Test (file line) | What it proves |
|---|---|---|
| 1 | §6.3 driver refuses non-allowlisted hosts (93) | Module 150 throws `DRIVER_HOST_REFUSED` before any navigation for LinkedIn/random/example hosts |
| 2 | §6.3 captcha at open (102) | Run stops `CAPTCHA_HANDOFF` with screenshot_ref to a real PNG, zero submits, `captcha_stop` on the step log |
| 3 | §6.3 captcha at review (121) | Fills happen, review-stage challenge stops the run `CAPTCHA_HANDOFF`, zero submits — **FAILS, pre-existing (§4)** |
| 4 | §6.3 isolation (138) | Two browser boards = two contexts; A's fills/storage never appear in B — **FAILS, pre-existing (§4)** |
| 5 | Doorstep: attestation discipline (156) | Attestation is never auto-answered; with explicit confirmation the run reaches final review, payload exact + sha-bound, submit leg throws `REAL_SUBMIT_DISABLED` — **FAILS on its first half only, pre-existing (§4)** |
| 6 | Integrity: resume sha mismatch (190) | A resume file whose bytes ≠ profile sha is refused (`RESUME_SHA_MISMATCH`), never uploaded |
| 7 | Confirmation capture: armed submit, confirmation page (209) | Armed localhost submit returns employer ID `TEST-APP-12345` + text + screenshot; second submit refused `ALREADY_SUBMITTED`; exactly one click |
| 8 | Confirmation capture: ambiguous landing (233) | Ambiguous landing = `unknown_outcome`, never "submitted"; reconcile keeps it unknown and the reconcile lock stays on |
| 9 | D1 redirect gate (253) | Off-allowlist redirect stops the run `HOST_REDIRECT_REFUSED`, zero fills, zero submits, no doorstep |
| 10 | D3 arming wire (268) | An owner `approvalRef` in the run arms an unarmed board and submits exactly once with confirmation captured; approval without a ref never transmits |
| 11 | D4 through the driver (301) | Education + country fields fill from the profile and land in the doorstep payload |
| 12 | **D8 EEO decline default (319)** | **The decline-relevant test:** the §6.1 EEO decline default is selected on a board that words it only "Prefer not to answer" (the on-page decline-class matcher, helper D8/BUG-067 — the same vocabulary module 149's new `EEO_DECLINE_MEANING` class is pinned identical to by the unit alignment test); payload carries the board's own wording, no fill failure recorded |
| 13 | D9 Lever custom card (333) | The ask record quotes the human card question ("Are you willing to relocate to New York?"), not the machine field name |
| 14 | Submit stays unplugged unless armed (346) | 149 approval alone does not enable a browser-board submit (`REAL_SUBMIT_DISABLED`, zero clicks) |

### The skip mechanism (quoted, file lines 21–30)

```js
// ---------- playwright resolution (skip-with-reason if genuinely absent) ----------
function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const PW = resolvePlaywright();
const SKIP = PW ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";
```

Every test is declared `{ skip: SKIP, timeout: … }`. Baseline reproduced by QA in the original lane worktree with no env set: **14 tests / 0 pass / 0 fail / 14 skipped, duration_ms 283**, each carrying exactly that reason string.

---

## 2. Environment diagnosis — evidence per hypothesis

**The blocker is two-part, and neither part is a missing browser or a missing package on this VM:**

**(a) Test-gate resolution divergence (the "unresolvable" mechanism).** The test file tries only `UPMORE_PLAYWRIGHT_PATH` (unset) and the bare name `"playwright"`. Bare resolution walks `node_modules/` upward from `tests/` — and there is nothing to find:

- The repo has **no root `package.json`** (its own AGENTS.md: "no root package.json, no pnpm"; the only manifest is `tests/agent100/package.json`, which lists no dependencies) and **no `node_modules/`** in the main clone or any worktree. Playwright is not a pinned dependency of this repo anywhere.
- `node -e "require.resolve('playwright')"` in the lane worktree → `MODULE_NOT_FOUND: Cannot find module 'playwright'`.
- Global npm root (`/root/.nvm/versions/node/v24.14.0/lib/node_modules`) contains no Playwright either.

But the package **and** the browser are both already installed on this VM, three times over, all at **Playwright 1.63.0**:

- `~/workspace/sporve-agent-clone/node_modules/playwright` (+ `playwright-core`) — `require()` of it succeeds (`chromium.launch` is a function);
- `~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` (npx cache);
- the Python Playwright 1.63.0 driver package under `~/.local/lib/python3.12/site-packages/playwright/`.

And the matching browser binary is present and runnable: `~/.cache/ms-playwright/chromium-1243/` (+ `chromium_headless_shell-1243`, `ffmpeg-1011`); the binary reports **Google Chrome for Testing 153.0.8010.12**, and revision **1243 is exactly the revision `playwright-core@1.63.0`'s `browsers.json` pins** for chromium and chromium-headless-shell. The three `~/.cache/ms-playwright/.links/*` files point at precisely the three installs above. So: *package present but not on the test file's resolution path* — a resolution-path issue, not an absence, not a download problem. (An `npm view playwright@1.63.0` probe returned no data in 27s, so the registry route is at best unreliable here — but no install is needed, so this does not block anything.)

Decisively, **the system under test could already resolve Playwright — only the test gate could not.** The helper process the tests drive, `scripts/career/portal-browser-helper.cjs` (lines 24–36), tries env → `"playwright"` → a third fallback the test file lacks:

```js
tries.push(path.join(__dirname, "..", "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
```

i.e. `~/workspace/sporve-agent-clone/node_modules/playwright` from any worktree of this repo (the comment there says this fallback was "restored at the v224 combine" precisely because its loss "stranded every browser-tier test whose own resolution uses it"). `scripts/career/widget-canary.cjs` uses the same Sporv path as its default. The gate was stricter than the driver it gates.

**(b) Root Chromium sandbox (the second, necessary condition).** This host's shell runs as `uid=0(root)`. Direct launch probes with the Sporv Playwright install:

- `chromium.launch({ headless: true, chromiumSandbox: true })` → **FAIL**: "Chromium sandboxing failed!"
- `chromium.launch({ headless: true, args: ["--no-sandbox"] })` → **LAUNCH_OK + PAGE_OK** (`about:blank`).

The helper honours `UPMORE_CHROMIUM_SANDBOX=off` (records the opt-out in `ready.json`, never silently), and module 150 spawns the helper with `{ ...process.env }`, so the variable propagates. The portal-browser test file sets neither variable itself, so both must come from the operator env.

**Named blocker, in one line:** *the suite skips because no one sets `UPMORE_PLAYWRIGHT_PATH` and the test file's resolver lacks the helper's Sporv-clone sibling fallback; and once resolved, Chromium additionally needs `UPMORE_CHROMIUM_SANDBOX=off` because the host runs as root.* Fix owner: whoever runs the suite (operator env) — permanently, the build lane (align the test resolver with the helper's, filed as BUG-QA-2026-10-21-04). No owner purchase, install, or network action is required.

---

## 3. The run on 04e24fde

Exact command (QA worktree, flag stripped):

```bash
env -u CAREER_AGENT_SUBMIT \
  UPMORE_PLAYWRIGHT_PATH=/home/hatch/workspace/sporve-agent-clone/node_modules/playwright \
  UPMORE_CHROMIUM_SANDBOX=off \
  node --test tests/career-portal-browser.test.cjs
```

| Test | Result | Duration |
|---|---|---|
| §6.3 host refusal | ✔ pass | 313ms |
| §6.3 captcha at open | ✔ pass | 7,442ms |
| §6.3 captcha at review | ✖ **fail** — got code `EMPTY_FORM`, expected `CAPTCHA_HANDOFF` (test line 127) | 5,363ms |
| §6.3 isolation | ✖ **fail** — "B's fresh context shows none of A's values" (line 149) | 15,343ms |
| Doorstep: attestation | ✖ **fail** — `board.answers().certify_true` is `false`, test expects `undefined` (line 164) | 10,148ms |
| Integrity: resume sha | ✔ pass | 7,419ms |
| Confirmation capture: confirmation page | ✔ pass | 10,097ms |
| Confirmation capture: ambiguous landing | ✔ pass | 10,876ms |
| D1 redirect gate | ✔ pass | 3,354ms |
| D3 arming wire | ✔ pass | 16,379ms |
| D4 education + country | ✔ pass | 11,904ms |
| **D8 EEO decline default** | ✔ **pass** | 9,395ms |
| D9 Lever custom card | ✔ pass | 4,037ms |
| Submit stays unplugged unless armed | ✔ pass | 11,310ms |
| **Total** | **11 pass / 3 fail / 0 skipped** | **duration_ms 127,018** |

**Regression attribution:** QA created a detached worktree at parent base `cea914fe` and ran the identical command: **11 pass / 3 fail / 0 skipped, duration_ms 107,121, failing name set identical** (captcha-at-review, isolation, doorstep-attestation). The 3 failures therefore pre-date the decline fix; `04e24fde` changes none of them in either direction. QA also re-ran each failing test **individually** on 04e24fde (`--test-name-pattern`): all three fail identically alone — deterministic, not order- or load-dependent flakes.

---

## 4. Bug-law entries (found by QA, returned as bugs — NOT fixed by QA)

### BUG-QA-2026-10-21-02 — helper readback reports empty fields as values (`" "` / `false`), breaking readback-absence semantics

- **Repro:** `tests/career-portal-browser.test.cjs` isolation and doorstep tests, running per §3, on both 04e24fde and cea914fe.
- **QA probe evidence** (standalone drive of the `/gh-form` fixture, same profile as the suite): a *fresh, never-filled* board B returns `answers() = {"full_name":" ","certify_true":false}`. Board A's answers likewise carry `"certify_true":false` for a checkbox that was never ticked. Nothing of A's actual data leaks into B (contextIds differ, `bb-1` vs `bb-2`) — the isolation failure is **not** a data leak; it is the truthy string `" "` failing the test's `!bAnswers.full_name` check.
- **Mechanism (fits all evidence):** in `scripts/career/portal-browser-helper.cjs`, `readbackBinding` returns `isChecked()` (`false`) for an unchecked checkbox and `first + " " + last` (`" "` when both are empty) for a `name_pair`; the trailing filter drops only `null` / `undefined` / `""` / `/^select/i`, so `false` and `" "` survive into `cmdReadback`'s answers. The substantive product claims still hold (an unticked checkbox *is* `false`; B holds none of A's values) — what is broken is the "absent ⇔ undefined" contract `answers()` consumers and these tests are written against.
- **Proposed permanent guard:** a readback unit probe asserting empty checkbox → absent and empty name-pair → absent, plus these two suite tests running in CI (see -04). **Owner: build lane** (helper is the worker lane's file).

### BUG-QA-2026-10-21-03 — captcha at review ends `EMPTY_FORM`, not `CAPTCHA_HANDOFF`

- **Repro:** the captcha-at-review test, deterministic, both SHAs: `resultStatus` is blocked but `code` is `EMPTY_FORM` where `CAPTCHA_HANDOFF` is expected (first assertion, line 127).
- **Evidence fitting:** the fixture's review page (fixture server, `CAPTCHA_REVIEW_STEP1` after Next) contains a visible `.h-captcha`, a submit button, and **zero fillable fields**; module 149 mints `EMPTY_FORM` for "the board exposed zero fillable fields" (149, ~line 676) and for "no attempted answer was observed" (~line 725). A zero-fillable-fields classification taken on the review page before/regardless of the review-stage captcha check fits all evidence; QA did not isolate which of the three `EMPTY_FORM` sites fires — that step is the build lane's RCA.
- **Proposed permanent guard:** this very test, running (see -04); a captcha present on any step must outrank `EMPTY_FORM`. **Owner: build lane.**

### BUG-QA-2026-10-21-04 — browser test gates' Playwright resolvers diverge from the helper's, so suites silently skip while the driver works

- **Repro:** §1–§2 above — 14/14 skipped on a VM where the helper's own fallback resolves Playwright and Chromium runs; the same gate shape exists in `tests/career-portal-lever-radio.test.cjs` and `tests/career-portal-submit-integrity.test.cjs` (identical two-try resolver), so those suites are exposed to the same silent NOT_RUN.
- **Proposed permanent guard:** give the test resolvers the helper's third (Sporv sibling) fallback — or have CI set `UPMORE_PLAYWRIGHT_PATH` explicitly — and treat any browser-suite run reporting skipped > 0 as a failed run in the evidence ledger, never a pass. **Owner: build lane** (test files are product-repo files; QA did not edit them).

---

## 5. Cross-check — the same capability elsewhere on this VM

- **`tests/career-portal-lever-radio.test.cjs`** (same two-try resolver shape): with the §3 env it runs **2 pass / 0 fail / 0 skipped, duration_ms 19,451** on 04e24fde — the env fix generalises; it is not specific to the portal-browser file.
- **Worker-recovery QA (Task 1, @076712eb):** real-Chromium module-150 tests ran successfully on this same VM (shipped suite 7/7; QA fault-injection suite 6/6 including serial real-Chromium boards; live Tier-2 re-run 27 sessions, 1 helper PID). Difference: those suites set `UPMORE_CHROMIUM_SANDBOX=off` *themselves* when unset, and they never gate on the test-process resolver — module 150's helper resolves Playwright via its Sporv sibling fallback. That is exactly why they ran while this suite skipped.
- **`tests/career-owned-worker-browser.test.cjs`** differs again: even *with* `UPMORE_PLAYWRIGHT_PATH` set, QA ran it here and it still skipped (1 skipped) with `BROWSER_SANDBOX_UNAVAILABLE` — its `before()` probe hardcodes `chromiumSandbox: true` and ignores `UPMORE_CHROMIUM_SANDBOX=off`, so as root it can never launch. Same VM, third distinct gate behaviour; worth the build lane's attention under -04, but out of this task's 14.
- **`tests/execution/live-local/run-live-local.js`** uses yet another resolver (`"playwright"` → `PLAYWRIGHT_MODULE` → global npm root) and exits 2 when unresolvable; not run by QA here (different product surface).

## 6. The unblock step (for any future runner)

```bash
UPMORE_PLAYWRIGHT_PATH=$HOME/workspace/sporve-agent-clone/node_modules/playwright \
UPMORE_CHROMIUM_SANDBOX=off \
node --test tests/career-portal-browser.test.cjs
```

No `npm install`, no browser download, no `package.json` change. If the Sporv clone ever moves, any Playwright 1.63.0 install works with the already-cached chromium-1243; another version would need its matching browser revision under `~/.cache/ms-playwright/`.

## Files

- This verdict: `~/workspace/qa-lane/decline-browser-tests-verdict.md` (copy committed on branch `qa/decline-browser-tests` as `qa/decline-browser-tests-verdict.md`).
- Run logs (ephemeral /tmp, numbers transcribed above): `/tmp/qa-decline/run1.log` (04e24fde full suite), `/tmp/qa-decline/base-run.log` (cea914fe full suite), `/tmp/qa-decline/probe-isolation.cjs` (BUG-QA-2026-10-21-02 probe).
- QA worktrees: `~/workspace/qa-decline-browser-wt` (qa branch, clean except the verdict copy); the detached base worktree `~/workspace/qa-decline-base-wt` was removed after its run.
