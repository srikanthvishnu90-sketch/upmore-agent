# WO-086: trunk's extension, ready for the Chrome Web Store

Status: done on `wo/086-store-package` (pushed, no PR, per the order). Builder: Claude. Depends on 031 and 063.

## Why
Muse is creating the Chrome Web Store developer account. The owner (2026-10-20): "Verify Muse's listing package and
have it ready — do not wait on me for anything else here."

The zip Muse had made was the wrong package: `packages/extension` v0.2.0, the "Lane C spike". It must not be listed, for
four reasons:
- its host permissions name `localhost`;
- it exposes a demo fixture, `answer-bank.alex-testcase.json`, as a web-accessible resource that any website can read;
- it signs in with a password grant;
- it has a bug that files one user's proofs under the next user.

The package to list is trunk's `extension/`. This order audits that package against current store policy, builds the
zip by script, keeps the checks in CI, and writes the listing packet.

## What changed
| File | Change |
|---|---|
| `extension/manifest.json` | `version` 0.1.0 → **0.2.0**. `description` now names Workday (125 of 132 characters). `icons` and `action.default_icon` added (16/32/48/128). **`tabs` removed** from `permissions`. Nothing else changed: host permissions, content-script hosts and CSP are as before. |
| `extension/icons/icon-{16,32,48,128}.png` | New icon set: a white check on a blue rounded square. Drawn with PIL in a throwaway script (nothing downloaded). The 128 icon is 96x96 artwork on 16 px of transparent padding. |
| `scripts/launch/extension-package.sh` | Runs `deno run -A extension/build.ts`, then zips the runtime files into `dist/trainee-extension-<version>.zip` with fixed timestamps, so the same sources give the same sha256. It unzips the result and checks it, then prints the file list, size and sha256. A zip that fails a check is deleted and the script exits 1. |
| `scripts/launch/extension-package-check.cjs` | What ships (everything in `extension/` except `src/`, `build.ts`, README, tests, `.map`, `.ts`, `.md` and dotfiles), and the checks. The script and the test share this one file. |
| `tests/extension-package.test.cjs` | 5 tests: extension/'s package passes every check; it holds the runtime files and no sources; the icons are real PNGs at their stated sizes; the permission set is exactly what the code uses; and each check refuses its own failure (see below). |
| `scripts/gate.sh` | The new test joins `shared_tests`, so CI runs it. One line. |
| `.gitignore` | `/dist/`. |
| `docs/launch/chrome-web-store.md` | The listing packet: name, summary, description, category, single purpose, one justification per permission, the data-usage disclosures, the privacy policy text to host, the screenshot list, the Do-not-list note, the shared-computer note, and sources. |

`background.js`, `content.js`, `panel.*`, `config.js` and `src/*.ts` are untouched. WO-084 and WO-076 own those files.
The anon key in `config.js` is public by design, and it stays.

### What the checks refuse
The zip is refused when any of these holds:
- `localhost` or `127.0.0.1` appears in the manifest;
- the text `service_role` appears anywhere, or a JWT whose role is anything but `anon`;
- any `.json` other than `manifest.json` ships;
- any file is over 1 MB;
- a source file, `build.ts`, a README, a test or a source map ships;
- a file the manifest, the panel page or the worker's `importScripts` / `executeScript({files})` names is missing;
- `web_accessible_resources` or `externally_connectable` is set;
- the CSP allows a remote host, `unsafe-eval` or inline script;
- `eval(` or `new Function(` appears in a script;
- an HTML page loads a remote `<script>`;
- `grant_type=password` appears;
- a content script runs on `<all_urls>`, LinkedIn or Indeed;
- the description is over 132 characters, or an icon size is missing.

The test shows that each of the four named checks (localhost, service_role, `.json` fixture, file over 1 MB), and seven
of the others, fails on a copy built to break it.

## The audit
Sources were checked 2026-10-20. developer.chrome.com did not resolve from this session, so the points below were read
from search excerpts of those pages. `docs/launch/chrome-web-store.md` lists the URLs.

| Item | Verdict | Evidence |
|---|---|---|
| Single purpose | **Pass.** One purpose: fill job applications on four ATS families from confirmed answers, and submit each only on the person's approval. The queue, the proofs and "answer once" all serve that purpose. | Program Policies; Chromium blog 2013-12 "Keeping Chrome extensions simple". |
| `host_permissions: <all_urls>` | **Keep, justified.** `chrome.tabs.captureVisibleTab` needs `<all_urls>` or `activeTab` (background.js `capture()`, the before and after proof screenshots). `activeTab` is granted only by a toolbar-icon click and is lost on the submit's navigation, which can go to any employer domain. The same access covers `executeScript` on that confirmation page (`readAfterNavigation`), reading the Upmore tab's session (`signInFromApp`) and the Supabase calls. WO-063 measured it: narrowing failed 18 of 70 browser tests, all at the screenshot, and architect test WO-063/1 pins it. | tabs API reference; Chromium docs change e3abe637. |
| `tabs` | **Removed.** No call needs it. `tabs.create`, `update`, `remove`, `get`, `sendMessage` and `captureVisibleTab` work without it. `tab.url` (read by `signInFromApp` and "Add open tabs") is exposed by host permissions, and `<all_urls>` covers every http(s) page. Verified two ways: the full browser suite passes (its `tabIdOf` helper and `signin-app` read `tab.url`), and a throwaway Playwright run of "Add open tabs" with the new manifest saw the open posting's URL and queued it (`TABS-CHECK PASS`). | `Tab.url`: "present if the extension has the "tabs" permission or has host permissions for the page"; Program Policies: "request those with the least access". |
| `scripting` | **Keep.** `executeScript` in `signInFromApp` (the app tab's own session), `readAfterNavigation` (packaged `lib/trainee-core.js` on the confirmation page; masking identity fields before the picture) and the "clicked" check. | background.js lines 72, 367-380, 639. |
| `unlimitedStorage` | **Keep.** `chrome.storage.local` holds up to 300 proofs, each with two PNG data-URL screenshots, plus the chosen resume as base64 (`keepEvidence`, `set-resume`). The default 10 MB would fill after a few dozen applications. | storage API reference (10 MB unless `unlimitedStorage`). |
| `sidePanel` | **Keep.** `side_panel.default_path` is the review card, and `chrome.sidePanel.setPanelBehavior` opens it on the icon click. | background.js line 21. |
| `storage` | **Keep.** Session storage holds the sign-in session, cards and queue. Local storage holds proofs, resume and timing. | throughout background.js. |
| Remote code | **Pass.** CSP `script-src 'self'; object-src 'self'`. No `eval` or `new Function` in any shipped script; the bundle was checked too. `importScripts("config.js", "lib/trainee-core.js")` and `executeScript({files: ["lib/trainee-core.js"]})` load only packaged files. `panel.html` loads only `config.js` and `panel.js`. Network responses are JSON data. The package check enforces all of this. | Troubleshooting page (remote code: external `<script>`, `eval` of fetched strings). |
| Description | **Fixed.** It now names Workday and says nothing is sent without approval (125 characters, at most 132 allowed). | manifest `description` reference. |
| Icons | **Added.** 16/32/48/128 PNGs in `icons` and `action.default_icon`. | Supplying images (128 icon, 96 artwork + padding). |
| Version | **0.2.0** (the package changed). The spike's zip also says 0.2.0, but it is a different package; the sha256 below tells them apart. | — |
| Content scripts | **Pass.** They run only on the Greenhouse, Lever, Ashby and Workday hosts, never on LinkedIn or Indeed (WO-031/12). | manifest. |

One note, not a blocker: the shipped bundle `lib/trainee-core.js` names `localhost` / `127.0.0.1` in its verification
(captcha) detector. There it marks the local test world's "captcha-provider" frame as a verification. That only makes it
stop more often, and only on a localhost page, which the extension never runs on in the store build. The manifest has no
localhost.

Left as is, by choice: the WO-031 note suggests moving `<all_urls>` to `optional_host_permissions` with a one-time grant.
That needs a permission request in the panel and the worker (background.js, panel.js), which another builder is editing.
It is a later order, not a store blocker, because the justification stands.

## Evidence
- `node --test tests/extension-package.test.cjs`: 5/5 pass.
- `deno run -A extension/build.ts --check`: "extension/lib/trainee-core.js is fresh."
- `UPMORE_CHROMIUM_SANDBOX=off node --test tests/career-extension-browser.test.cjs`: 54/54 before the change and
  54/54 after it (without `tabs`, with icons and 0.2.0).
- `deno test -A --no-check tests/architect/wo-031-extension.test.ts`: still green (WO-031/12 and WO-063/1 included).
- `bash scripts/launch/extension-package.sh` → `dist/trainee-extension-0.2.0.zip`, 12 files, **108,240 bytes, sha256
  `0b71f25ba1a047b6d10d735e18cdd50f266133168e835786ea4771aba18fdbb0`**. Two builds gave the same sha256.

## Demo (the owner or Muse)
1. `git checkout wo/086-store-package` (or trunk once merged), then `bash scripts/launch/extension-package.sh`.
2. Compare the printed sha256 with the one above. It changes only if a shipped file changes.
3. Optional: in `chrome://extensions`, load the unzipped folder unpacked. The new icon shows, and the install prompt
   lists one warning: read and change all your data on all websites.

## What remains (owner or Muse; nothing here waits on the builder)
1. **Developer account:** the one-time Chrome Web Store registration fee (USD 5 at the time of writing; check it on the
   sign-up page), paid by the owner or Muse with the owner's yes.
2. **Privacy policy hosting (owner, a deploy):** `/privacy` exists but covers only the finance app. Host the extension
   policy text from `docs/launch/chrome-web-store.md`, either as its own page or as a section of `/privacy`, and paste the
   URL in the dashboard. Confirm the contact address in it.
3. **Screenshots (Muse):** 1 to 5 at 1280x800, using a TEST persona only, plus the 440x280 small promo tile. The list is
   in the packet.
4. **Dashboard (Muse):** paste the listing, the single purpose, the permission justifications and the data disclosures;
   tick the three certifications; answer "No" to remote code; set the support URL and visibility (Unlisted suggested
   first).
5. **Upload** `dist/trainee-extension-0.2.0.zip` built from this branch or trunk (never the Lane C spike zip), check its
   sha256, and press **Submit for review**.
6. **WO-082 / PR #99** (each person's data set aside on sign-out) is still open. Once it merges, build a new zip from
   trunk and bump the version (0.2.1) before or after the first review. Until then the listing tells users on a shared
   computer to use one Chrome profile per person.
7. After the listing is live: the architect updates `extension/README.md` ("Not in the Chrome Web Store", which
   WO-031/12 currently asserts) and the queue table. This order did not add a queue row; only the architect edits that
   table.
