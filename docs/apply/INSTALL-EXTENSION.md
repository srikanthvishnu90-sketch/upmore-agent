# Install the Trainee extension in your own Chrome (owner, desktop)

For: Vishnu, on his own desktop Chrome (version 116 or later; Mac, Windows or Linux). Loaded unpacked; it is not in the
Chrome Web Store. Built from branch `wo/first-real-submission` by `scripts/extension/package.sh`.

Two builds, same code; only one line of `config.js` differs. The script picks the line, so you never edit a file:

| Build | `config.js` flags | What sends an application |
|---|---|---|
| `shipped` | personSubmits=false, agentSubmits=false | Nothing until you tap **Approve and submit** on that posting's card; then the extension presses the site's own Submit. |
| `agent` | personSubmits=false, **agentSubmits=true** | Trainee sends a posting itself only after **you approve that batch of exact answers** in the panel **AND** your own switch `CAREER_AGENT_SUBMIT` is `'on'` in the database. With either one missing, nothing is sent. |

Switching `CAREER_AGENT_SUBMIT` on is yours to do; no build, script or panel button sets it. Today it is not set
(off), and the database parts the extension records with are not on the live project yet: see "What does not work yet".

## A. Get the build (one of two ways)

**Way 1: build it from the repository** (Mac or Linux; on Windows use Way 2, or WSL)

1. Install once, if missing: Git, Deno 2 (https://deno.com), Node.js 18 or later. Mac and Linux already have `zip` and `unzip`.
2. Open a terminal and run:
   ```
   git clone https://github.com/srikanthvishnu90-sketch/upmore-agent.git
   cd upmore-agent
   git checkout wo/first-real-submission
   ```
   (Already cloned: `cd upmore-agent`, then `git fetch origin` and `git checkout wo/first-real-submission` and `git pull`.)
3. Build the variant you want into a folder you will keep (Chrome loads from that folder every time it starts):
   ```
   bash scripts/extension/package.sh --variant shipped --out ~/trainee-extension
   bash scripts/extension/package.sh --variant agent   --out ~/trainee-extension
   ```
   It first checks the bundled code is fresh and stops with "refused: ... stale" if not. It never changes the
   repository's own `extension/config.js`.
4. Write down the last lines it prints: `folder (Load unpacked): ...`, `zip: ...`, `sha256: ...`, `commit: ...`.

**Way 2: download the zip** (only if one was published for you)

1. Download `trainee-extension-<version>-<variant>.zip` and the SHA-256 published with it.
2. Check it is the same file. Mac: `shasum -a 256 ~/Downloads/trainee-extension-0.2.0-agent.zip`. Windows (Command
   Prompt): `certutil -hashfile %USERPROFILE%\Downloads\trainee-extension-0.2.0-agent.zip SHA256`. The hex must equal the
   published one; if not, do not load it.
3. Unzip it into a new folder you will keep, e.g. `trainee-extension-0.2.0-agent` in your home folder (double-click on
   Mac; right-click > Extract All on Windows). The folder must directly contain `manifest.json` and `BUILD-INFO.txt`.
   Chrome cannot load the zip itself.

## B. Load it in Chrome

1. Open Chrome. Type `chrome://extensions` in the address bar and press Enter.
2. Top right of that page: switch **Developer mode** on. A row of buttons appears top left.
3. Press **Load unpacked**.
4. In the folder picker, select the folder `trainee-extension-0.2.0-shipped` or `trainee-extension-0.2.0-agent` (the one
   the script printed after "folder (Load unpacked)", or the one you unzipped into). Select the folder itself, the one
   holding `manifest.json`; do not open it and pick a file. Press **Select** (Mac: **Open**).
5. A card "Trainee apply (Upmore)" 0.2.0 appears. If it shows a red **Errors** button, stop and send a screenshot of it.
   Load only one Trainee build at a time: if an older Trainee card is there, press **Remove** on it first.
6. Pin it: press the puzzle-piece icon right of the address bar, then the pin next to "Trainee apply (Upmore)".

## C. Check the right build is loaded

1. On the card in `chrome://extensions`, press **Details**. "Source" shows the folder Chrome loaded from.
2. Open `BUILD-INFO.txt` in that folder (or type `chrome-extension://<ID>/BUILD-INFO.txt` in the address bar, with the
   ID shown on the card). It must say:
   - `commit:` the commit the script printed (or the one published with the zip). With "(with uncommitted changes ...)"
     after it, the build is not from a clean commit: rebuild from a clean checkout.
   - `variant: shipped` and `flags: personSubmits=false agentSubmits=false`, or
   - `variant: agent` and `flags: personSubmits=false agentSubmits=true`.
3. In the panel (step D2), only the agent build shows a box headed **Trainee sends** with a **Stop applying** button,
   after you sign in.

## D. Sign in

1. In a normal tab, open https://upmore-topaz.vercel.app and sign in the way you always do. Leave that tab open.
2. Press the pinned Trainee icon. The side panel opens on the right. (If it does not: right-click the icon > Open side
   panel.)
3. Press **Use my Upmore sign-in**. Your email appears at the top of the panel. The extension keeps only your session,
   in memory, until the browser closes; it never asks for or keeps a password.
   Or: type your email in the panel, press **Email me a link**, open the link from that email in this same Chrome, then
   press **Use my Upmore sign-in**.
   Never type a password or a one-time code into a chat with Trainee.

## E. Resume and confirmed facts

1. Next to "Resume: none yet", press **Choose file** and pick the resume to send (.pdf, .doc, .docx or .txt). Its name
   replaces "none yet".
2. Press **Import facts file** and pick your confirmed-facts `.json`. It is kept only until the browser closes; import it
   again after every restart. The panel then says "N of your facts can be used for this browser session" and how many
   are not used and why. What a fact that is not used would answer is asked of you instead; it is never guessed.

   The file is used only when it names your account and each fact carries its proof (`trustedManifest` in
   `extension/src/apply_core.ts`):
   - top-level `"user_id"`: your Upmore account's user id (Supabase dashboard > Authentication > Users > your row). A
     file naming anyone else is refused whole: "That facts file does not name your account, so none of it is used."
   - every fact, under `"answers"` (or `"saved"`), needs: `"value"` (not empty), `"factId"`, `"confirmed": true`,
     `"provenance"` starting with "owner stated", "owner confirmed", "owner typed", "owner answered", "owner gave",
     "owner provided" or "owner picked", and a non-empty `"confirmation_event_id"`. A fact without them is not used.
   - never used whatever they carry: fact ids F-027 to F-079 and any fact whose provenance says "owner-delegated" or
     "answer-all" (the D-007 quarantine), ids starting `text-answer:`, `approved-local-resume:` or `essay-draft:`, a fact
     with a `"user_id"` other than yours, and a fact `"derived_from"` a fact that is not used.

   Shape (placeholders, not real values):
   ```json
   {
     "user_id": "<your user id>",
     "answers": {
       "first_name": { "value": "<your first name>", "factId": "F-001", "confirmed": true,
         "provenance": "owner stated in chat on <date>", "confirmation_event_id": "<event id>" }
     },
     "saved": {}
   }
   ```

## F. Queue, Prepare, approve, send

1. Open the Queue box in the panel. Paste posting links (Greenhouse, Lever or Ashby), one a line, and press **Add
   links**; or open the postings in tabs and press **Add open tabs**. Never LinkedIn or Indeed.
2. Under "Answer once", press **Prepare**. Trainee reads the next postings in background tabs. Nothing is filled or sent.
   Questions only you can answer are listed there; answer them and press **Save my answers**.
3. Read the batch (agent build, box **Trainee sends**). Per posting: the company, the posting link, every answer exactly
   as it will be sent, what is left blank, and under "Not in the batch" each posting left out and why (it needs you
   first). An answer marked "Trainee picks the employer's own entry for this from their list" is sent as the employer's
   own list entry for your answer; the receipt's proof shows which.
4. Press **Approve these answers for N postings; Trainee sends them**. One tap approves exactly what is shown, nothing else.
5. Press **Start** (Queue box). Trainee opens each approved posting, fills it, and presses the site's own Submit only if
   the page holds exactly the approved answers and no verification is showing; a posting that differs waits for you and
   the queue goes on. Keep the application's tab in front while it sends (the proof screenshots are of the visible tab).
   A receipt line per posting appears under **Receipts**; **Proof** shows what was sent.
6. **Stop applying** stops the queue at once and withdraws the batch approval; nothing more is sent until you approve a
   batch again. (**Stop** in the Queue box stops the queue only.)

Shipped build instead of 3 to 5: open one posting's application, press **Fill this application**, read the card (every
line is what will be sent), then press **Approve and submit** once.

## G. Update to a newer build

1. Way 1: in `upmore-agent`, run `git pull`, then the same `package.sh` command with the same `--out` folder (it replaces
   the folder in place). Way 2: unzip the new zip over the same folder's contents (delete the old files first).
2. In `chrome://extensions`, press the circular **Reload** arrow on the Trainee card.
3. Close and reopen the side panel. Sign in again if asked, pick the resume and import the facts file again.
4. Check `BUILD-INFO.txt` again (section C): the new commit and the variant you meant.

## H. Remove it

1. In `chrome://extensions`, press **Remove** on the Trainee card and confirm. This also deletes the proof the extension
   kept on this computer; press **Proof** on anything you want to keep first.
2. Delete the build folder (and the zip) if you no longer want them.
3. Optional: switch **Developer mode** off.

## What does not work yet (until the owner applies the live apply schema)

The extension's account RPCs (`career_apply_account_own`, `career_apply_answers_own`, `career_apply_extension_begin_own`,
`career_apply_extension_begin_agent_own`, `career_apply_batch_approve_own`, `career_apply_questions_put_own`,
`career_apply_finish_own` and the rest) do not exist on the live project (https://mrwngntwmnaqrqhupvlt.supabase.co) yet.
Until you apply that schema:

- Works: loading, signing in, picking the resume, importing the facts file, adding links, **Prepare** (it reads the forms
  and shows what each posting asks), **Fill this application** and reading the card.
- Does not work: anything recorded on your account. **Save my answers** does not store your answers; **Approve these
  answers** says "Your approval could not be recorded, so Trainee will not send these."; every application's start
  ("begin") is refused, so **nothing can be sent** by either build, and no receipt is written. **Add Trainee's picks**
  reads the apply queue table that comes with the same schema and may fail; paste the links instead.
- Even after the schema is applied, the agent build sends nothing while `CAREER_AGENT_SUBMIT` is not `'on'`
  ("Trainee sending is switched off for your account."). Turning it on, and each real submission, is your word alone.
