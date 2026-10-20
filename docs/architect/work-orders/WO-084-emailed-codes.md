# WO-084: the code the site emails the person, filled from their own Gmail

Status: ready · Decisions: D-007, D-013(b), D-021, D-029 · Builds the code half of WO-015 · Size cap: 450 changed lines,
tests excluded

## Why
Owner, 2026-10-20: "build the email-code reader, prove Lever and Ashby live, then Workday — in that order".

Application sites stop an applicant with a code sent to their email:
- Greenhouse's spam check asks some applicants for a security code from their email, depending on the employer's
  sensitivity setting and the reCAPTCHA score (REPORTED, Greenhouse support article 115005448066);
- Gusto;
- Workday's account verification;
- iCIMS.

Today the extension sees the prompt (`dom.ts` `observe().email_code_prompt`). `career_apply.ts` then marks the
application `needs_user / email_code`, and the person goes to their inbox, copies the code and pastes it. Tsenta reads
the code from the person's email and types it in (their pricing page: "Automated OTP filling", REPORTED).

Most of the parts already exist in trunk:
- the person's Gmail grant (`google_career`, gmail.readonly, WO-024);
- the 15-minute window (`gmail_code_window.ts`, D-021);
- the prompt detection.

This order joins them. Nothing is bought: no mailbox vendor and no cloud browser. The code goes from the person's Gmail
to the form in the person's own browser.

## The rules (architect, binding)
1. **Only the code, only to the form.**
   - The code is returned to the signed-in person's own extension, with `cache-control: no-store`.
   - It is never written to a table, a log, chrome.storage, the card, chat or the evidence record.
   - The screenshot covers the code field, as it covers identity fields (`maskFields`).
2. **Only the right sender, only fresh mail.**
   - Senders allowed: the site family's own sender domain (`CODE_SENDERS`), or the employer's own domain (taken from the
     posting); a subdomain counts, a look-alike never does.
   - The mail must arrive after the moment the extension saw the prompt (`since`, minus 30 seconds of clock skew).
   - It must be at most 15 minutes old (D-021, `freshForCode`).
   - The newest qualifying mail wins.
3. **Exactly one code, or none.** A mail with two candidate codes, or with no code wording, gives no code. The card
   then says to type the code from the inbox. A guessed code is never typed.
4. **Never a password, never the account.** No password field is ever read or filled (D-013(b)). On an account page,
   only a field whose label asks for an emailed or verification code is filled.
5. **The person still presses Submit.**
   - The code is filled and the card says: "Filled the code <Greenhouse | Acme> emailed you. Press Submit to finish."
   - The extension never clicks Submit or Verify after filling the code. The person's approval covered the application,
     and the code completes that same application. The zero-tap version is the owner's decision (open question 1).
6. **No grant, no reading.** Without the career Gmail grant, nothing is read. The card says: "Connect Gmail in Trainee
   (one tap) and I'll fill these codes for you. For now, type the code from your inbox."

## Files and interfaces
**`supabase/functions/_shared/apply_code.ts` (new).** The pending test is the contract:
`tests/architect/pending/wo-084-emailed-codes.test.ts`.

```ts
export const CODE_SENDERS: Record<string, string[]>; // greenhouse, lever, ashby, workday, icims, smartrecruiters, gusto
export interface CodeMail { id: string; from: string; subject: string; text: string; internalDate: number }
export function senderAllowed(from: string, family: string, employerDomain: string | null): boolean;
export function extractCode(subject: string, text: string): string | null;
export function pickCode(mails: CodeMail[], o: { now: number; since: number; family: string; employerDomain: string | null }): { code: string; from: string } | null;
export interface CodeDeps { token: (userId: string) => Promise<string | null>; fetch: typeof fetch; now: () => number }
export function readEmailedCode(userId: string, req: { family: string; employer_domain: string | null; since: number }, d: CodeDeps):
  Promise<{ ok: true; code: string; from: string } | { ok: false; why: "no_gmail" | "not_yet" | "invalid"; message: string }>;
export function handleApplyCode(req: Request, d: { cors: Record<string, string>; user: (token: string) => Promise<{ id: string } | null>; code: CodeDeps }): Promise<Response>;
```

- **Reading.** Gmail `messages.list` with `q = from:(<sender domains>) newer_than:1d`, at most 5 messages. Then
  `messages.get?format=full` for those 5 only. Take the text/plain part, or the HTML with tags removed.
- **Auth.** The person's JWT only (`role: authenticated`, the `career-essay-draft` pattern). `service_role` gets 403;
  no token gets 401; an unknown family gets 400.
- **The token.** `careerToken` from `career_mail_gmail.ts` (readonly scope). Do not write a new OAuth path.

**`supabase/functions/apply-code/index.ts` (new).** It wires `handleApplyCode` with Supabase auth and `careerToken`'s
deps, the `career-essay-draft/index.ts` pattern. Also:
- `supabase/config.toml`: `[functions.apply-code] verify_jwt = true`;
- `scripts/launch/trainee-go-live.sh`: add the function to the deploy list. Deploying it still needs the owner's word on
  a commit.

**`extension/background.js`.** New message `email-code`: `{ family, employerDomain, since }`.
- It posts to `/functions/v1/apply-code` with the person's session.
- On `not_yet` it polls every 5 seconds, for up to 2 minutes.
- It returns `{ ok, code }` to the content script only, and keeps nothing.

**`extension/content.js` + `extension/src/dom.ts`.** When `observe()` shows `email_code_prompt` (after the person's
Submit, or on a page that opens with one):
- find the code input(s): a single field labelled code / verification / security, or split one-character boxes;
- ask the background for the code;
- fill it with the native value setter plus input/change events (as the planner's fills do);
- mask it in the proof screenshot;
- show the card line from rule 5;
- on `no_gmail`, show rule 6's line;
- after 2 minutes with no code, show "No code arrived yet. Check your inbox and type it here."

`extension/src/apply_core.ts` and `career_apply.ts`: an application that met a code and was then sent is recorded as
sent, not `needs_user`. The outcome logic is unchanged otherwise.

Rebuild `extension/lib/trainee-core.js` (`deno run -A extension/build.ts`).

## Acceptance
1. `tests/architect/pending/wo-084-emailed-codes.test.ts`, unedited. Move it to `tests/architect/` and it passes,
   5 tests.
2. Browser test in `tests/career-extension-browser.test.cjs`. Add a Greenhouse-shaped fixture to
   `tests/fixtures/extension/world.cjs`: after Submit, the page answers in place with "Enter the 8-character security
   code we sent to your email" and one input; a second variant has 8 one-character boxes. The test stubs `apply-code`.
   It proves:
   - the code lands in the field(s);
   - the extension never clicks Submit or Verify afterwards;
   - the card says rule 5's line;
   - the code is not in chrome.storage (local or session), the evidence record or the page text the card shows;
   - the proof screenshot was taken with the field masked;
   - a password field on the same page is untouched;
   - with the stub answering `no_gmail`, the card says rule 6's line and nothing is filled.
3. The gate passes (`bash scripts/gate.sh`). The browser suite stays fully green.

## Demo the owner can run
1. With the extension loaded and the career Gmail connected, open the WO-084 fixture page from the browser test
   (`node tests/fixtures/extension/serve.cjs` if present, else the test's own server). Approve; the fixture "emails" a
   code by the test stub.
2. The card shows "Filled the code … emailed you. Press Submit to finish."
3. Live, GATED on the owner or Muse: one real Greenhouse or Gusto application that asks for a code. The record is the
   card, the employer's confirmation mail and the absence of the code in every stored record. Label it VERIFIED-LIVE
   only from that.

## Out of scope
- Magic-link sign-ins (a link, not a code).
- SMS codes.
- Creating accounts.
- Any password.
- Zero-tap submit.
- The cloud worker (WO-039) using codes. That is a follow-up after this lands, through the same `readEmailedCode`.

## Open questions for the owner
1. **Zero taps after the code.** Rule 5 keeps the person's Submit press after the code is filled. Tsenta's "fully
   automatic" mode presses it. Say "yes, press Submit after filling the emailed code" in writing to change rule 5.
2. **Google's review of gmail.readonly.** It is a restricted scope. Past 100 users, Google requires app verification and
   a yearly third-party security assessment (CASA). Its cost and timing are to be confirmed in the research report. Until
   then, Gmail-connected users are capped at the 100 test users the OAuth app allows.

## Addendum 1 (architect, 2026-10-20, from research)
Today an emailed-code prompt after the person's Submit ended the attempt `needs_user`, and the card said "Finish it
yourself on the page"; even when the person typed the code and the employer confirmed, the receipt never showed confirmed.
Whatever the code's source (filled from Gmail, or typed by the person after `no_gmail` or `not_yet`), the content script
keeps observing the same tab: `observe()` every 1 s for up to 10 minutes. As soon as the confirmation shows (the form and
the prompt are gone, or the employer's thanks appear), the outcome is recorded exactly as the normal post-click path
does: the proof screenshot with masking, then `outcome`. Only after 10 minutes with no confirmation does it end
`needs_user` / `email_code`, with today's text. Card text while waiting:
- filled: "Filled the code <X> emailed you. Press Submit to finish; I'll record it when <X> confirms."
- not filled: "<X> emailed you a code. Type it here and press Submit; I'll record it when <X> confirms." (after
  `no_gmail` it follows rule 6's line; after `not_yet` it follows "No code arrived yet. Check your inbox and type it here.")

Browser test: the stub answers `no_gmail`, the test types the code into the field and clicks the fixture's Submit, the
fixture shows the thank-you, and the recorded outcome is sent (confirmed, not `needs_user`), with no code anywhere in the
stored records.

## Evidence (builder, 2026-10-20)
Counts are from this branch on a root container (Chromium refuses its sandbox as root, so the browser ran with
`UPMORE_CHROMIUM_SANDBOX=off`).
- `tests/architect/wo-084-emailed-codes.test.ts`: 5/5. Moved out of `pending/`; the only change is its import path, one
  level shallower after the move (`../../supabase/...`), as earlier orders' moves did.
- Architect tests (`deno test -A --no-check --ignore=tests/architect/pending tests/architect/`): 634 passed, 0 failed.
- Browser suite (`node --test tests/career-extension-browser.test.cjs`): 56/56 (54 before, plus the two WO-084 cases).
  - Filled, for one security-code field and for eight one-character boxes: the code lands in the field(s); the card says
    "Filled the code Greenhouse emailed you. Press Submit to finish; …"; 1.5 s later neither Submit nor Verify was
    pressed and nothing was recorded; every code box was covered by a mask while it held the code when the proof picture
    was taken; the account password box has no value and saw no event; the code is in neither chrome.storage area, the
    record, its evidence nor the panel's text. The person's own Submit sends the code, and the outcome is confirmed.
  - `no_gmail` (addendum 1): the card says rule 6's line and then "Greenhouse emailed you a code. Type it here …";
    nothing is filled and nothing is recorded while the page waits; the person types the code and presses Submit; the
    outcome is confirmed (not `needs_user`), and the code is nowhere in the stored records.
- `deno run -A extension/build.ts --check`: fresh. `python3 scripts/build-router-core.py --career-only --check`: verified.
- Gate (`bash scripts/gate.sh`): cannot pass on this machine. Its browser check launches Chromium with the sandbox, which
  root refuses. With a local shim that launches without the sandbox: test-paths, browser-runtime, architect-tests and
  apply-cli-typecheck OK. Career and shared node tests: 1908 passed, 56 failed, 20 skipped. The same 56 fail on the
  unchanged base commit here: the apply engine refuses a browser without its sandbox (`BROWSER_SANDBOX_REQUIRED`).
  Edge tests: 135/0. Pay importers: OK. Career bundle: verified. The career typecheck cannot fetch deno.land here; with
  those two remote imports stubbed, `apply-code/index.ts` and `career-essay-draft/index.ts` type-check.

What stays NOT_RUN: everything live.
- `apply-code` is not deployed. It is in the go-live deploy list (JWT on) and deploys only on the owner's word.
- No real Gmail was read. The reader is proven against a fake Gmail (WO-084/4) and the extension against a TEST stub.
- No real Greenhouse or Gusto code step was met. The live demo (one real application that asks for a code) is GATED on
  the owner or Muse; label it VERIFIED-LIVE only from the card, the employer's confirmation mail and the code being absent
  from every stored record.
- A navigating submit whose next page asks for a code (the content script there takes the step; `code-step`) has no
  browser test: no fixture page navigates into a code step.
