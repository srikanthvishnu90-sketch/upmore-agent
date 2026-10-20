# WO-082: one browser, two people — each person's things stay theirs (cross-user defect)

## Defect entry (bug law: entry + a guard that stays in the suite)
The archive's ledger is frozen (D-006), so this entry lives here, in the order that fixes it.

| Field | Value |
|---|---|
| Defect | Cross-user leak in the extension (`extension/background.js`) |
| Found | 2026-10-20, auditing the extension before the Chrome Web Store listing (owner: "fix the cross user bug") |
| Severity | Critical: one person's resume could be attached to another person's applications |
| Cause | Sign-out removed only the session token and imported facts. These stayed on the device for whoever signed in next: the resume file, application proofs, Workday drafts, timings (local storage), and this session's cards, queue, essay drafts, answer-once state and asked questions. |
| Effect | Person B signs in after person A on the same browser: the panel shows A's resume, and every application B prepares carries A's resume (`facts()` adds the stored resume to the answers). A's proofs show in B's panel. |
| Guard | `tests/career-extension-browser.test.cjs` "cross-user: after a sign-out another person sees none of the first person's resume, proofs or cards; the first gets theirs back". It failed before the fix (the resume was still shown after sign-out). It stays in the suite. |

The Lane C spike (`packages/extension`, the zip uploaded 2026-10-20) has a sibling defect. Sign-out there keeps the
application proofs, and `flushReports` reports every local proof under whoever is signed in. Person A's applications
would land in person B's tracker. The spike is not the extension to list (WO-063); this is recorded so it is never
published as it is.

## Fix
- Each person's things have one owner: `owner` in local storage, the signed-in person's id.
- **On sign-out:**
  - the owner's local things (resume, proofs, timings, Workday drafts) are set aside under `aside:<owner>`;
  - every per-person session key is cleared;
  - the owner mark is removed.
- **When a person signs in** (`keepSession`, every path: app session, magic link, refresh):
  - if the stored owner is someone else, that owner's things are set aside first;
  - the person's own set-aside things come back;
  - the same person signing in again changes nothing.
- Things kept before an owner was recorded (installs before this change) go aside as `aside:unowned`, never handed to
  whoever signs in. Such a person picks their resume again once. No real installs exist yet.
- A resume can be set only while signed in, so it always has an owner.

## Evidence
- The guard failed first, then passed.
- The extension browser suite: 55/55. The Workday browser suite: 17/17.
- `extension/build.ts --check`: fresh. `background.js` is not bundled.

## Not covered
Two people sharing one OS account and one Chrome profile can still read each other's set-aside files with developer
tools; the extension never shows them. Separate Chrome profiles are the real isolation, and the store listing should
say so.
