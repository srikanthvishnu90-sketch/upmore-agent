# Trainee apply (browser extension, v1)

Fills Greenhouse, Lever and Ashby job applications from your confirmed answers. You read every answer on a card and
press Approve once; only then does the extension press the site's own Submit. Workday is recognized but not claimed:
it says "Workday needs you signed in on the employer's site; I fill the fields I can." and fills only your name, email,
phone and links.

Not in the Chrome Web Store. You load it unpacked, as below. It is a test build for the first people (WO-031).

## What it does and never does

- Reads every field on the form (label, type, options, required) the same way the desktop runner does
  (`scripts/career/page-functions.cjs`, `scripts/career/form-bind.ts`) and answers with the same planner
  (`supabase/functions/_shared/career_apply.ts`). It fills only what the planner answered from your confirmed facts and
  the answers you gave Trainee by text.
- Never fills an identity number (SSN, passport, license, tax id, bank or card number). The card tells you to type it
  yourself; its value never leaves the page, is covered in the screenshot, and is never in any record.
- Never fills a voluntary self-identification (EEO) answer or a legal statement you have not given.
- The card shows every answer exactly as it will be sent, what is still needed, and the resume file name. Approve is one
  tap. After the tap it reads the form again and stops if anything changed since you read it, if a value was set by the
  page instead of by you or Trainee, or if a verification check (captcha) is showing. It never solves or bypasses a
  verification: you finish it yourself, then press Approve again.
- Each application is recorded on your account (the same queue as every other application: one per posting, one per
  company per 30 days, your daily limit) before the click, and its outcome after. A screenshot of the filled form, the
  answers, the employer's confirmation text and the times are kept on this computer (chrome.storage.local).
- Questions only you can answer go to Trainee, which asks you once by text. Your answer then fills on every later form.
- Never runs on LinkedIn or Indeed.

## Load it tonight (Chrome or Chromium, desktop)

1. Get the code: `git clone` this repository (or download it) and check out the branch with the extension.
2. Open `chrome://extensions`, switch on **Developer mode** (top right), press **Load unpacked**, pick the `extension`
   folder of the repository. "Trainee apply (Upmore)" appears. Pin it from the puzzle-piece menu.
3. Sign in to Upmore in a normal tab, the way you always do: https://upmore-topaz.vercel.app
   (Or, in the panel, type your email and press "Email me a link", open the link in that email on this computer.)
4. Click the extension's icon. The side panel opens. Press **Use my Upmore sign-in**. The extension keeps only your
   session, in memory, until the browser closes. It never asks for or keeps a password.
5. In the panel, press **Choose file** next to Resume and pick the resume you want sent. Optionally, **Import facts file**
   loads the same confirmed-facts file the desktop runner reads (kept only until the browser closes).

## Run a real test on one posting

1. Open a Greenhouse, Lever or Ashby posting you would genuinely apply to (its application form; for Lever and Ashby the
   extension opens the form page from a posting link in the queue).
2. In the panel press **Fill this application**. Watch the form fill. Read the card: every line is what will be sent.
3. Anything under "Still needed" you answer on the form yourself (or text Trainee, then press Fill again). Anything under
   "Type this yourself" (an identity number) you type on the form; it is never kept.
4. Press **Approve and submit** once. The extension checks the form is unchanged and presses the site's own Submit. If a
   verification appears, finish it yourself on the page and press Approve again.
5. The panel shows the employer's answer ("Sent and confirmed by the employer", or what is missing) and the seconds from
   card to answer.

## Many postings: the queue

Paste posting links (one a line) and press **Add links**, or **Add open tabs**, or **Add Trainee's matches** (the links in
Trainee's alert texts to you). Press **Start**: each posting opens, fills and shows its card; your Approve submits it and
the next one opens. **Skip this one** moves on without sending. The panel shows how many are done and the average time
from card to the employer's answer.

## For developers

- `deno run -A extension/build.ts` rebuilds `lib/trainee-core.js` (the planner and the form reader, bundled from their
  one source); `--check` fails when the checked-in bundle is stale.
- Tests: `deno test -A --no-check tests/architect/wo-031-extension.test.ts` (decisions and wiring),
  `node --test tests/career-extension-browser.test.cjs` (the extension in Chromium against the captured forms, all hosts
  served locally: nothing reaches a real employer), `tests/db/career_apply_extension.test.sql` (the record).
- The Supabase project and app URL default to the app's own public values (`config.js`).
