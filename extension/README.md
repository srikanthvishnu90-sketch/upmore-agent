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
- Never fills an identity number (SSN, SIN, national ID, NI number, passport, driver's license, tax file number, Aadhaar,
  Personnummer, CPF, government-issued ID, bank or card number). The card tells you to type it yourself; its value never
  leaves the page, is covered in the screenshots, and is never in any record. Any answer of 8 or more digits that did not
  come from your confirmed facts is treated the same way.
- Never takes a label that belongs to another field. When two fields share one label, it fills neither and lists them
  under "Still needed".
- Never fills a voluntary self-identification (EEO) answer or a legal statement you have not given.
- The card shows every answer exactly as it will be sent, what is still needed, the resume file name, and any read-only
  field the employer's page set itself. Approve is one tap and approves what the browser will actually send: the option
  values, the checked boxes and the resume file's bytes, not only the text you see. After the tap it reads the form again
  and stops if anything changed since you read it, if a value was set by the page instead of by you or Trainee, if you edit
  the form while it is sending, or if a verification check (captcha) is showing. The last of these checks happens right
  next to the click. It never solves or bypasses a verification: you finish it yourself, then press Approve again.
- When the employer emails you a code after your Approve (Greenhouse's security code), Trainee reads that one code from
  your own Gmail, if you connected Google with reading mail allowed. It reads only mail from the application system's own
  senders that arrived after the click. It fills the code into the page's code box and you press Submit. The code is never shown, kept, or
  in the proof. If Google is not connected, or two different codes arrived, the card says so and you type the code yourself.
- Keep the application's tab in front while it sends: the screenshots are taken of the visible tab.
- Each application is recorded on your account (the same queue as every other application: one per posting, one per
  company per 30 days, your daily limit) before the click, and its outcome after. Once the Submit has been clicked, that
  posting is never sent again, whatever the page showed. If the employer's page does not answer within 30 seconds, the
  application counts as sent ("the employer's answer could not be captured"), never as "not sent". Only an attempt that
  stopped before the click can be approved again.
- Proof of every application stays on this computer (chrome.storage.local) until you clear it: the answers as you
  approved them, the approval time and hash, a screenshot before the click and one after, the employer's confirmation
  text and number, the final page address, and the times. Your account's record keeps the screenshots' hashes, never the
  pictures. Press **Proof** on the card or on a queue item to see it. **Clear proof on this computer** removes it after
  you confirm.
- "Sent; the employer's page confirmed it" is said only when the employer's answer was read and the page after the click was
  photographed. Otherwise the panel says "Sent; the employer's answer could not be captured. Check your email for their
  confirmation."
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
   Person-submits mode (`personSubmits` in config.js, OFF by default; switching it on is the owner's call): after the
   same checks the extension presses nothing. You read the filled page and press the site's own Submit yourself; your
   press is checked against the card you approved first, and a changed form or a verification stops it. No press within
   20 minutes, or leaving the page, closes the application as not sent.
5. The panel shows the employer's answer ("Sent; the employer's page confirmed it", or what is missing; the employer's email makes it confirmed) and the seconds from
   card to answer. Press **Proof** to see what was sent and what the employer's page showed.

## Many postings: the queue

Paste posting links (one a line) and press **Add links**, or **Add open tabs**, or **Add Trainee's matches** (the links in
Trainee's alert texts to you). Press **Start**: each posting opens, fills and shows its card; your Approve submits it and
the next one opens. **Skip this one** moves on without sending. The panel shows how many are done and the average time
from card to the employer's answer.

Agent submits (`agentSubmits` in config.js, OFF by default; switching it on is the owner's call, and the owner's own
CAREER_AGENT_SUBMIT must also be 'on' in the database): after **Prepare**, the panel lists, per posting, every answer
Trainee would send, what it leaves blank, and the postings left out because something needs you first. **Approve these
answers** approves that batch once; press **Start** and Trainee sends each posting itself with the site's own Submit,
only when the page holds exactly the approved answers. A posting that differs waits for you and the queue goes on. A
receipt line after each. **Stop applying** stops the queue and withdraws the approval at once (WO-101).

## For developers

- `deno run -A extension/build.ts` rebuilds `lib/trainee-core.js` (the planner and the form reader, bundled from their
  one source); `--check` fails when the checked-in bundle is stale.
- Tests: `deno test -A --no-check tests/architect/wo-031-extension.test.ts` (decisions and wiring),
  `node --test tests/career-extension-browser.test.cjs` (the extension in Chromium against the captured forms, all hosts
  served locally: nothing reaches a real employer), `tests/db/career_apply_extension.test.sql` (the record).
- The Supabase project and app URL are fixed in `config.js` (the app's own public values). Nothing in storage can change
  where your session is sent; to point a build at another project, edit `config.js` and reload the extension.
