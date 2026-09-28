#!/usr/bin/env python3
"""Surgery part 1: HTML structural changes for the 3-tab honest rebuild.
- Delete EXPLORE, SAVE, MONEY sections
- Delete moneyActionSheet
- Replace copy-pasted navs with <nav data-nav> placeholders
- Rebuild Home inner: search + queue + track
- Add ledger + bank-beta to You; move bankSheet to device level
- Extend subSheet with amount/bill-date update controls
"""
import re, pathlib

P = pathlib.Path("/home/hatch/workspace/upmore/src/upmore-app-template.html")
s = P.read_text()
orig_len = len(s)

def kill_section(src, name, next_name):
    start = src.index(f"<!-- ================= {name} ================= -->")
    nxt = src.index(f"<!-- ================= {next_name} ================= -->")
    end = src.rindex("</section>", start, nxt) + len("</section>")
    # swallow following blank lines
    while src[end:end+1] == "\n" and src[end:end+2] == "\n\n":
        end += 1
    return src[:start] + src[end:]

# T1-T3: delete EXPLORE, SAVE, MONEY sections
s = kill_section(s, "EXPLORE", "SAVE")
s = kill_section(s, "SAVE", "MONEY")
s = kill_section(s, "MONEY", "PROFILE")
assert 'id="money"' not in s and 'id="save"' not in s and 'id="explore"' not in s, "section delete failed"

# T4: delete moneyActionSheet (device-level sheet used only by Money alerts)
a = s.index('<div class="sheet" id="moneyActionSheet" hidden>')
b = s.index('<div class="homebar">')
s = s[:a] + s[b:]
assert 'id="moneyActionSheet"' not in s

# T5: replace every copy-pasted 6-tab nav with a JS-generated placeholder
navs = re.findall(r'<nav class="tabs" role="tablist">.*?</nav>', s, re.S)
assert len(navs) == 3, f"expected 3 navs after section deletes, found {len(navs)}"
s = re.sub(r'<nav class="tabs" role="tablist">.*?</nav>',
           '<nav class="tabs" role="tablist" data-nav></nav>', s, flags=re.S)
assert s.count('data-nav') == 3

# ---- T7: rebuild Home inner ----
home_start = s.index('      <article class="hero t-green" id="heroCard">')
home_end = s.index('      <div id="homePromoList"></div>') + len('      <div id="homePromoList"></div>')
home_new = '''      <div class="xsearch">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="xq" type="search" placeholder="Search ways to earn\u2026" autocomplete="off" aria-label="Search offers">
      </div>
      <div class="xlist" id="xlist"></div>
      <button class="ghostbtn" id="xmore" hidden></button>

      <h2 class="sec">Up next</h2>
      <p class="psub" style="margin:-6px 0 10px">One queue. Ranked by dollars \u00d7 confidence \u00d7 urgency \u00f7 effort \u2014 biggest score first.</p>
      <div id="queue"></div>

      <h2 class="sec">Track</h2>
      <div id="saveSignedOut" hidden>
        <div class="next" style="margin-top:4px">
          <h3>Stop the leaks, keep the cash</h3>
          <div class="steps">
            <div class="stepbtn" style="cursor:default"><span class="txt">Track every subscription \u2014 we flag duplicates, price hikes, and renewals from what you enter</span></div>
            <div class="stepbtn" style="cursor:default"><span class="txt">Never miss a renewal, claim deadline, or return window</span></div>
          </div>
          <button class="cta" id="svSignin">Sign in with Google to track</button>
          <p class="fine">Your subscriptions, deadlines, and money log are private to your account.</p>
        </div>
      </div>
      <div id="saveSignedIn" hidden>
        <p class="psub" id="subMonthly" style="margin:8px 0 12px"></p>
        <div class="list" id="subList"></div>
        <details class="svdetails"><summary>Add a subscription</summary>
          <div class="svform">
            <label class="f"><span>Name</span><input id="subMerchant" placeholder="Netflix" autocomplete="off"></label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <label class="f"><span>Amount</span><input id="subAmount" inputmode="decimal" placeholder="15.99" autocomplete="off"></label>
              <label class="f"><span>Bills every</span><div class="sel"><select id="subInterval"><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="weekly">Weekly</option></select></div></label>
            </div>
            <label class="f"><span>Next bill date (optional \u2014 powers renewal reminders)</span><input id="subNextBill" type="date"></label>
            <button class="go" id="subAdd" style="height:50px">Save</button>
          </div>
        </details>
        <h3 class="sec" style="font-size:15px;margin-top:18px">Deadlines &amp; claims</h3>
        <div class="list" id="deadlineList"></div>
        <details class="svdetails"><summary>Add a deadline or claim</summary>
          <div class="svform">
            <label class="f"><span>What</span><input id="dlName" placeholder="Car insurance renewal" autocomplete="off"></label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <label class="f"><span>Date</span><input id="dlDate" type="date"></label>
              <label class="f"><span>Kind</span><div class="sel"><select id="dlKind"><option value="renewal">Bill renewal</option><option value="claim">Claim / rebate</option><option value="return">Return window</option><option value="other">Other</option></select></div></label>
            </div>
            <label class="f"><span>Amount at stake ($) (optional)</span><input id="dlAmount" inputmode="decimal" placeholder="120" autocomplete="off"></label>
            <label class="f"><span>Notes (optional)</span><input id="dlNotes" placeholder="Call to renegotiate" autocomplete="off"></label>
            <button class="go" id="dlAdd" style="height:50px">Save</button>
          </div>
        </details>
      </div>'''
s = s[:home_start] + home_new + s[home_end:]
# default homeSub text (queue overwrites with the live top card)
s = s.replace('<p class="sub" id="homeSub">Your next step: open the state&apos;s official search.</p>',
              '<p class="sub" id="homeSub">Your money queue \u2014 biggest score first.</p>')

# ---- T8: You tab — ledger + bank beta ----
pcard_end = s.index('      <div class="pcard">')
pcard_end = s.index('      </div>', pcard_end) + len('      </div>')
ledger_html = '''
      <h2 class="sec">Money log</h2>
      <p class="psub" style="margin:-6px 0 10px">Only real results. Nothing counts on intent \u2014 every dollar below has a date and a note.</p>
      <div id="ledgerTotals" class="ledgertots"></div>
      <div class="list" id="ledgerList"></div>
      <button class="ghostbtn" id="ledgerAdd" style="margin:8px 0 4px">+ Log a result</button>
      <div id="ledgerForm" hidden>
        <div class="svform">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label class="f"><span>Type</span><div class="sel"><select id="lgType"><option>Received</option><option>Avoided</option><option>Reduced</option><option>Found</option><option>Cash flow</option></select></div></label>
            <label class="f"><span>Amount ($)</span><input id="lgAmount" inputmode="decimal" placeholder="25.00" autocomplete="off"></label>
          </div>
          <label class="f"><span>What happened</span><input id="lgTitle" placeholder="Cancelled Netflix" autocomplete="off"></label>
          <label class="f"><span>Date</span><input id="lgDate" type="date"></label>
          <div class="row" style="gap:8px">
            <button class="btn" id="lgCancel" style="flex:1">Cancel</button>
            <button class="btn" id="lgSave" style="flex:1;background:#1d5c3f;color:#fff;border:none;padding:12px;border-radius:8px;font-size:16px;font-weight:600;">Log it</button>
          </div>
        </div>
      </div>
      <button class="prow" id="bankBetaRow" style="margin-top:16px"><span class="pl">Bank sync \u2014 private beta</span><span class="pv">\u203a</span></button>'''
s = s[:pcard_end] + ledger_html + s[pcard_end:]

# bankSheet -> device level, right after PROFILE section closes
bank_sheet = '''    <div class="sheet" id="bankSheet" hidden>
      <div class="sheetcard">
        <div class="row"><b style="font-size:18px">Connect your bank</b><button class="iconbtn" id="bankClose" aria-label="Close">\u2715</button></div>
        <p class="psub" style="margin-top:8px">Real bank connections are in private beta. We use read-only access \u2014 we can see balances and transactions, but we can never move money or log in as you.</p>
        <label class="fine" for="bankEmail" style="display:block;margin-top:10px">Email for your invite</label>
        <input id="bankEmail" type="email" placeholder="you@example.com" autocomplete="email" style="width:100%;padding:12px;margin-top:4px;border:1px solid #ddd;border-radius:8px;font-size:16px;">
        <div class="row" style="margin-top:12px;gap:8px;">
          <button class="btn" id="bankNotify" style="flex:1;background:#1d5c3f;color:#fff;border:none;padding:12px;border-radius:8px;font-size:16px;font-weight:600;">Notify me</button>
        </div>
        <p class="psub" id="bankStatus" style="margin-top:8px;min-height:20px;"></p>
      </div>
    </div>
'''
prof_sec = s.index("<!-- ================= PROFILE ================= -->")
prof_close = s.index("</section>", s.index('id="profile"')) + len("</section>")
s = s[:prof_close] + "\n" + bank_sheet + s[prof_close:]
assert s.count('id="bankSheet"') == 1

# ---- subSheet: add amount + next-bill update controls ----
anchor = '<p class="psub" id="subCancelSteps" style="margin:10px 0 0;text-align:center"></p>'
assert anchor in s
sub_update = anchor + '''
        <div class="svform" style="margin-top:12px;text-align:left">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label class="f"><span>Amount</span><input id="subEditAmount" inputmode="decimal" autocomplete="off"></label>
            <label class="f"><span>Next bill</span><input id="subEditBill" type="date"></label>
          </div>
          <button class="go" id="subUpdateBtn" style="height:44px">Update</button>
        </div>'''
s = s.replace(anchor, sub_update)

# ---- T9: Guide canned answer — Save tab is gone ----
s = s.replace(
    "Open the Save tab and add your subscriptions (tap \u201cAdd a subscription\u201d).",
    "On Home, scroll to Track and tap \u201cAdd a subscription\u201d.")
assert "Open the Save tab" not in s

# ---- CSS additions ----
css = '''
  /* Queue (the CFO): one ranked list */
  .qcard { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px; margin:0 0 10px; }
  .qcard.top { border:2px solid #1d5c3f; }
  .qcard h4 { margin:0 0 4px; font-size:16px; }
  .qm { margin:0 0 6px; color:var(--dim); font-size:13.5px; }
  .qwhy { margin:0 0 10px; font-size:12.5px; color:var(--dim); font-style:italic; }
  .qtop { margin:0 0 6px; font-size:11.5px; font-weight:700; color:#1d5c3f; text-transform:uppercase; letter-spacing:.06em; }
  .qcta { width:100%; padding:12px; border-radius:10px; border:none; background:#1d5c3f; color:#fff; font-size:15px; font-weight:600; }
  .qcta:active { transform:scale(.99); }
  /* Ledger totals */
  .ledgertots { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin:0 0 12px; }
  .ledgertot { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:8px 2px; text-align:center; }
  .ledgertot b { display:block; font-size:13.5px; }
  .ledgertot span { font-size:10px; color:var(--dim); }
  .lrev { opacity:.55; text-decoration:line-through; }
'''
assert "</style>" in s
s = s.replace("</style>", css + "</style>", 1)

# ---- delete-sheet copy: mention the money log ----
s = s.replace(
    "This erases your profile, plan progress, subscriptions, claims, reminders, and Guide chat history. This cannot be undone.",
    "This erases your profile, plan progress, subscriptions, money log, renewals, claims, reminders, and Guide chat history. This cannot be undone.")

P.write_text(s)
print(f"part 1 done: {orig_len} -> {len(s)} bytes")
print("money refs left:", s.count('id="money"'), "| save refs:", s.count('id="save"'), "| explore refs:", s.count('id="explore"'))
