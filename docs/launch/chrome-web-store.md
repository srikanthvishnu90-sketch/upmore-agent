# Chrome Web Store listing packet: Trainee apply (Upmore)

Built for WO-086 (`docs/architect/work-orders/WO-086-store-package.md`). Everything below can be pasted into the Chrome
Web Store Developer Dashboard. Fields are in the order the dashboard shows them. Anything marked **OWNER** or **MUSE** is
still open.

## Do not list: the Lane C spike zip

**Do not upload Muse's zip of `packages/extension` (the "Lane C spike", v0.2.0).** It is a different package from
trunk's `extension/` and must never be listed:

- its host permissions name `localhost`;
- it exposes a demo fixture, `answer-bank.alex-testcase.json`, as a web-accessible resource that any website can read;
- it signs in with a password grant, which breaks the rule that no password goes through Trainee;
- it has a bug that files one user's proofs under the next user who signs in.

The package to upload is the zip built from trunk's `extension/` by `bash scripts/launch/extension-package.sh`, which
writes `dist/trainee-extension-<version>.zip`. That script refuses any zip with `localhost` or `127.0.0.1` in its
manifest, a `.json` fixture, a `service_role` key, a password grant, a web-accessible resource or a file over 1 MB. The
spike's zip fails three of those checks.

## Package

| Field | Value |
|---|---|
| File | `dist/trainee-extension-0.2.0.zip`, built by `bash scripts/launch/extension-package.sh` (prints the sha256; compare it with WO-086's record before upload) |
| Name (from the manifest) | Trainee apply (Upmore) |
| Version | 0.2.0 |
| Visibility | **OWNER** decides. Suggested for the first cohort: **Unlisted** (only people with the link can install), then Public. |

## Store listing tab

**Name:** Trainee apply (Upmore)

**Summary (the manifest description; 125 of the 132 characters allowed):**

> Fills Greenhouse, Lever, Ashby and Workday job applications from answers you confirmed. Nothing is sent until you approve it.

**Description (detailed):**

> Trainee apply fills job applications for you, using only the answers you confirmed in your Upmore account. It never
> sends anything you have not approved.
>
> How it works
> • Open an application on Greenhouse, Lever, Ashby or Workday and press "Fill this application" in the Trainee side panel.
> • Trainee fills the fields it can answer from your confirmed facts and the answers you gave Trainee. It never makes up an
>   answer. A question only you can answer is listed under "Still needed", and Trainee asks you once.
> • A review card shows every answer exactly as it will be sent, plus the resume file name and anything still missing.
> • Press "Approve and submit" once. Trainee checks that the form has not changed since you read it. Then it presses the
>   employer's own Submit button. If anything changed, it stops.
> • On Workday, you sign in to the employer's site yourself. Trainee then fills the application one page at a time, and
>   each page that is saved to the employer is shown to you and approved first.
>
> What it never does
> • It never fills an identity number (SSN, national ID, passport, driver's license, bank or card number). You type
>   those yourself, and they are covered in screenshots and never recorded.
> • It never asks for, stores or types a password or a one-time code.
> • It never solves or bypasses a captcha or other verification. You finish it yourself.
> • It never fills a voluntary self-identification (EEO) answer or a legal statement you have not given.
> • It never runs on LinkedIn or Indeed.
>
> Proof of every application
> For every application, Trainee keeps proof on your computer: the answers you approved, the time you approved them, a
> screenshot before the click and one after, and the employer's confirmation. Your Upmore account keeps a record of each
> application, with the screenshots' fingerprints but not the pictures. You can see the proof at any time, and you can
> clear it.
>
> Many applications
> Paste posting links, add your open tabs, or add the jobs Trainee found for you. Each application opens and fills, and
> you approve each one before it is sent. It applies at most once per posting and once per company every 30 days, and
> never more than your daily limit.
>
> You need an Upmore account (https://upmore-topaz.vercel.app). Sign in there as usual. The extension keeps only your
> sign-in session, in memory, until the browser closes.
>
> Sharing a computer? Give each person their own Chrome profile (see "Privacy on a shared computer" below).

**Category:** Productivity. If the dashboard shows subcategories, choose **Workflow & Planning**; otherwise choose
**Tools**. **MUSE** confirms the exact label in the dashboard.

**Language:** English.

**Graphic assets:**

| Asset | Status |
|---|---|
| Store icon 128x128 PNG | Done: `extension/icons/icon-128.png` (a 96x96 mark on 16 px of transparent padding, as Chrome's image guidance asks) |
| Screenshots, 1280x800 PNG or JPEG, 1 to 5 | **MUSE** captures them; see the list below |
| Small promo tile 440x280 PNG or JPEG | **MUSE** makes it (the icon mark and the name "Trainee apply" on a plain background) |
| Marquee 1400x560 | Optional; skip |

**Screenshots for Muse to capture (1280x800, a TEST persona only, never a real person's data):**

1. The side panel next to a filled Greenhouse application, with the review card showing the answers and the
   "Approve and submit" button.
2. The card's "Still needed" and "Type this yourself" sections, with an identity-number field covered on the page.
3. The result after submitting: "Sent; the employer's page confirmed it" and the time from card to answer.
4. The Proof view: the approved answers, the before and after screenshots, and the confirmation text.
5. The queue: several posting links added, with the done count and the average time.

Capture them at a 1280x800 window with the panel open. Use a TEST persona, a posting you do not submit, or the local
test world in `tests/fixtures/extension/world.cjs`. Before upload, check that no real name, email or phone number is in
the picture.

**Official URL / Homepage:** https://upmore-topaz.vercel.app
**Support URL:** **OWNER** chooses: a mailto link or the app's help page.

## Privacy practices tab

**Single purpose (paste as is):**

> Trainee apply fills job application forms on Greenhouse, Lever, Ashby and Workday with answers the user has confirmed
> in their Upmore account, and submits each application only after the user reviews and approves its exact answers.

**Permission justifications (one per field):**

| Permission | Justification (paste) |
|---|---|
| `storage` | Keeps the user's sign-in session in session storage (memory only, cleared when the browser closes). Keeps the resume file the user chose, the review cards, the application queue, and the proof of each application in local storage on the user's computer. |
| `unlimitedStorage` | Each application's proof is kept on the user's computer: a screenshot before submitting and one after (PNG), plus the resume file the user chose. Up to 300 proofs are kept until the user clears them. Chrome's default 10 MB local storage would fill after a few dozen applications, and later proofs would be lost. |
| `scripting` | After the user's approved submit moves the tab to the employer's confirmation page, the extension injects its own bundled script (`lib/trainee-core.js`, packaged with the extension) into that tab. It reads the employer's answer and covers identity-number fields before the proof screenshot. The content script may not run on that page because it can be on the employer's own domain. When the user presses "Use my Upmore sign-in", it also reads the user's own Upmore session from the user's open Upmore tab. |
| `sidePanel` | The review card, where the user reads every answer and approves the application, is the extension's side panel. It opens when the user clicks the toolbar icon. |
| Host permission `<all_urls>` | Chrome's `tabs.captureVisibleTab` needs `<all_urls>` or `activeTab` to take the proof screenshots before and after each submit. `activeTab` is granted only by a click on the toolbar icon, and it does not survive the submit's navigation to the employer's confirmation page, which can be on any domain. The same access lets the extension read that confirmation page, send the user's own requests to Upmore's backend (Supabase), and read the user's Upmore tab when they choose to sign in from it. Content scripts run only on the Greenhouse, Lever, Ashby and Workday application hosts listed in the manifest. |
| Content scripts (Greenhouse, Lever, Ashby, Workday hosts) | Read the application form's fields and fill the answers the user confirmed. They run only on `boards.greenhouse.io`, `job-boards.greenhouse.io` (and their `.eu.` hosts), `jobs.lever.co`, `jobs.eu.lever.co`, `jobs.ashbyhq.com`, `*.myworkdayjobs.com`, `*.myworkdaysite.com` and `*.myworkday.com`. |

**Remote code:** "No, I am not using remote code." Every script is in the package. The extension pages' CSP is
`script-src 'self'; object-src 'self'`. Nothing calls `eval` or `new Function`. The service worker's `importScripts` and
`scripting.executeScript` load only packaged files (`config.js`, `lib/trainee-core.js`). Network calls return data (JSON),
never code.

**Data usage: what the extension collects (tick these):**

| Dashboard category | Collected? | What and why |
|---|---|---|
| Personally identifiable information | **Yes** | Name, email, phone, postal address, links, work history and the other answers the user confirmed. They are filled into the application the user opened, sent to that employer only when the user approves, and recorded on the user's own Upmore account as the application's record. |
| Health information | **Yes, only if the user gave it** | A voluntary disability or self-identification answer is filled only when the user stated it themselves, and it is part of the approved application. It is never a default. |
| Financial and payment information | No | Bank, card and identity numbers are never filled, kept or recorded. |
| Authentication information | **Yes** | The user's Upmore sign-in session (access and refresh token), taken from their own Upmore tab or from a sign-in link they opened. It is kept in memory until the browser closes and used only to call Upmore's backend as that user. No password and no one-time code is ever asked for or kept. |
| Personal communications | **Yes** | Only Trainee's own job-alert texts to the user, and only when the user presses "Add Trainee's matches". They are read from the user's Upmore account to take the posting links in them. |
| Location | **Yes, as an answer** | The postal address and city the user confirmed, filled into the applications that ask for them. The extension does not track location. |
| Web history | **Yes, on the user's press** | The addresses of the user's open tabs are read only when they press "Add open tabs", and only job-posting links are kept in the queue. The posting address of each application is recorded with it. |
| User activity | No | The extension notices the user's edits to a form only to stop a submit that no longer matches what they approved. Nothing is recorded or sent. |
| Website content | **Yes** | The application form's fields, the employer's confirmation text and number, the page address after submit, and the before and after screenshots. Screenshots stay on the user's computer; their SHA-256 fingerprints and the confirmation are recorded on the user's account. |

**Certifications (tick all three):**

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Who receives the data:** The employer's application system receives the application the user approved. Upmore's
backend (Supabase) holds the user's account and the record of each application. OpenAI receives an essay question, the
posting and the form's labels when the user asks Trainee to draft an answer; it goes through Upmore's server, which reads
the user's confirmed facts itself. Nobody else receives anything. Nothing is sold, and nothing is used for advertising.

**Privacy policy URL:** **OWNER, before submit.** The app already serves `privacy.html` at
`https://upmore-topaz.vercel.app/privacy`. That policy covers Upmore's finance app only. It does not mention the
extension, job applications, form answers or screenshots, and it has no Limited Use statement. The Web Store needs a
policy that covers what this extension does. Host the text below, either as its own page (suggested:
`https://upmore-topaz.vercel.app/trainee-extension-privacy`) or as a section added to `/privacy`, then paste that URL.
Hosting it is a deploy, so the owner does it. This session could not reach the live site through its network, so check
`/privacy` in a browser too.

## Privacy policy text (to host)

> **Trainee apply (Upmore) — browser extension privacy policy**
> Last updated: 2026-10-20 · Contact: vishnusrikanth8@gmail.com (**OWNER** confirms the contact address)
>
> Trainee apply is a Chrome extension made by Upmore. It fills job applications on Greenhouse, Lever, Ashby and Workday
> with answers you confirmed in your Upmore account. It submits each application only after you approve its exact
> answers. This policy covers the extension. Your Upmore account is also covered by Upmore's privacy policy at /privacy.
>
> **What the extension handles, and why**
> - *Your sign-in session.* This is the session you already have in the Upmore app, or one from a sign-in link you open.
>   It is kept in your browser's memory until the browser closes and is used only to act as you on Upmore's backend.
>   The extension never asks for, stores or sends a password or a one-time code.
> - *Your confirmed answers.* Your name, contact details, address, links, work history and the answers you gave Trainee
>   are read from your Upmore account and filled into the application you opened. They are sent to the employer only
>   when you approve that application.
> - *The application form and the employer's answer.* The extension reads the form's questions, the employer's
>   confirmation text and number, the page address after you submit, and a screenshot before and after the submit.
>   These are your proof of the application.
> - *Your resume file.* This is the file you choose in the panel. It is kept on your computer and attached to the
>   applications you approve.
> - *Links you add.* The posting links you paste. The addresses of your open tabs, read only when you press "Add open
>   tabs" (only job-posting links are kept). The links in Trainee's job-alert texts to you, read only when you press
>   "Add Trainee's matches".
>
> **Where it is kept**
> - *On your computer* (Chrome's extension storage): the proof of each application (answers, times, screenshots,
>   confirmation), the resume you chose, and the queue. You can clear the proof in the panel ("Clear proof on this
>   computer"). Removing the extension deletes all of it.
> - *On your Upmore account:* the record of each application (the answers you approved, the approval time and
>   fingerprint, the outcome, the employer's confirmation, the screenshots' SHA-256 fingerprints, never the pictures)
>   and the questions you answered once for later applications. You can see, export or delete it as Upmore's privacy
>   policy says.
>
> **Who receives it**
> - The employer's application system receives the application you approved, and nothing else.
> - Upmore's backend (Supabase, United States) holds your account and the records above.
> - OpenAI receives the question, the posting and the form's labels when you ask Trainee to draft an answer. The
>   request goes through Upmore's server. Under OpenAI's API terms, data sent through the API is not used to train its
>   models by default.
> - Nobody else. We do not sell your data, we do not use it for advertising, and we do not use it for credit or lending
>   decisions.
>
> **What it never does.** It never fills or records an identity number (SSN, national ID, passport, driver's license,
> bank or card number); those are covered in screenshots. It never solves a captcha. It never runs on LinkedIn or Indeed.
>
> **Limited Use.** The use of information received from Chrome extension APIs follows the Chrome Web Store User Data
> Policy, including the Limited Use requirements. Data is used only to provide the extension's single purpose (filling
> and submitting, with your approval, the job applications you choose, and keeping proof of them). It is not transferred
> except as described above, and it is not used for any other purpose.
>
> **Shared computers.** Chrome extension storage belongs to the Chrome profile, not to the person. If more than one
> person uses this computer, give each person their own Chrome profile.
>
> **Changes.** If this policy changes, we update the date above. A material change is announced in the extension's panel.

## Privacy on a shared computer (for users and for Muse's testers)

Use a **separate Chrome profile for each person** on a shared computer. The proofs, the chosen resume and the queue are
stored in the Chrome profile's extension storage, and anyone who uses the same profile can see them.

The fix that sets each person's data aside when they sign out is **WO-082 / PR #99** ("one browser, two people"). It
was **open, not merged** when this packet was written (2026-10-20). Until it is merged and a new zip is built from trunk,
a second person in the same profile could see the first person's proofs. Even after it lands, separate profiles are
still the advice.

## Sources (checked 2026-10-20)

- Program Policies, including the narrowest-permissions rule ("If more than one permission could be used to implement a
  feature, you must request those with the least access"), Limited Use and the privacy-policy requirement:
  https://developer.chrome.com/docs/webstore/program-policies/policies
- Troubleshooting violations (excessive permissions; remotely hosted code such as `eval` of fetched strings or external
  `<script>`): https://developer.chrome.com/docs/webstore/troubleshooting
- `tabs.captureVisibleTab` needs `<all_urls>` or `activeTab`:
  https://developer.chrome.com/docs/extensions/reference/api/tabs and the Chromium docs change
  https://chromium.googlesource.com/chromium/src/+/e3abe63770aeb692fab5f1f00f76464af0eeb451%5E%21/
- `Tab.url` / `title` are present with the `tabs` permission **or** host permissions for the page:
  https://developer.chrome.com/docs/extensions/reference/api/tabs
- `storage.local` is limited to 10 MB unless `unlimitedStorage` is requested:
  https://developer.chrome.com/docs/extensions/reference/api/storage
- The manifest `description` is plain text, at most 132 characters:
  https://developer.chrome.com/docs/extensions/reference/manifest/description
- Images (128x128 icon, 96x96 artwork with padding; 440x280 small promo tile) and listing (1280x800 screenshots):
  https://developer.chrome.com/docs/webstore/images and https://developer.chrome.com/docs/webstore/best-listing
- Single-purpose policy origin: https://blog.chromium.org/2013/12/keeping-chrome-extensions-simple.html

Note: developer.chrome.com did not resolve from this session's network, so these points were confirmed through search
excerpts of those pages. Muse should check them once more in the dashboard; the dashboard's own field limits are final.
