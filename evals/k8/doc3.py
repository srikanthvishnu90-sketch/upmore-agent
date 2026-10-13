import json, pathlib, re
doc_path = pathlib.Path.home()/"workspace/your_files/upmore-cluster-k8.md"
doc = doc_path.read_text()
S = {s["id"]: s for s in json.loads(pathlib.Path("/tmp/k8-surfaces.json").read_text())}
D = {s["id"]: s for s in json.loads(pathlib.Path("/tmp/k8-doorsteps.json").read_text())}
FACTS = None

# 1) per-item state + doorstep lines, inserted after each item's Status line
def add_lines(m):
    block, cid = m.group(0), m.group(1)
    if cid in D:
        conv = f"~/workspace/your_files/upmore-conversations/{S[cid]['base']}"
        block += (f"\n- State: COMPLETE (sandbox rail, with the proof above). Live completion is ASK — see \"What I need from you\"."
                  f"\n- Doorstep (sandbox/local surface on the guided manual-connect lane; live session pending the owner's browser lane): reached the doorstep, action ready, not executed — [sign-in screen]({conv}-doorstep-login.png) · [ready action screen]({conv}-doorstep-ready.png)")
    else:
        block += (f"\n- State: COMPLETE (sandbox rail, read-only, with the proof above). Live completion is ASK — see \"What I need from you\"."
                  f"\n- Doorstep: not applicable — this item is read-only and has no executing tap to stop before.")
    return block
doc = re.sub(r"### (C\d+) — [^\n]+\n(?:.*\n)*?- Status: FINISHED[^\n]*", lambda m: add_lines(m) if False else m.group(0), doc)  # placeholder, replaced below

# simpler: line-based pass
lines = doc.split("\n")
out, cur = [], None
for ln in lines:
    m = re.match(r"### (C\d+) —", ln)
    if m: cur = m.group(1)
    out.append(ln)
    if ln.startswith("- Status: FINISHED") and cur:
        if cur in D:
            conv = f"~/workspace/your_files/upmore-conversations/{S[cur]['base']}"
            out.append("- State: COMPLETE (sandbox rail, with the proof above). Live completion is ASK — see \"What I need from you\".")
            out.append(f"- Doorstep (sandbox/local surface on the guided manual-connect lane; live session pending the owner's browser lane): reached the doorstep, action ready, not executed — [sign-in screen]({conv}-doorstep-login.png) · [ready action screen]({conv}-doorstep-ready.png)")
        else:
            out.append("- State: COMPLETE (sandbox rail, read-only, with the proof above). Live completion is ASK — see \"What I need from you\".")
            out.append("- Doorstep: not applicable — this item is read-only and has no executing tap to stop before.")
doc = "\n".join(out)

# 2) doorstep + learn sections after the Data rule section (insert before "## Bugs fixed")
door = """## Doorstep proofs (owner addendum)

For the 40 items whose flow runs through a logged-in service (every execute and packet item), the flow is built
to the doorstep: PortalCases.doorstep (packages/domain/118-portal-cases.js) drives the guided manual-connect
session — the product's READ-ONLY session lane (packages/domain/78-manual-connect.js): the owner signs in
himself in the provider's own window, only the encrypted session persists, and the lane never executes — to the
provider's filled review screen, and stops before the executing tap. Each item's sign-in screen and ready
action screen are photographed from the sandbox/local surfaces built from that production output and indexed
under the item above (`-doorstep-login.png`, `-doorstep-ready.png`). Environment, labeled honestly:
**sandbox/local surfaces on the built session machinery; every live session is pending the owner's browser
lane** — no live login is claimed or faked anywhere. Where a provider asks for a verification code, the design
reads it from the owner's own connected Gmail by the standing pattern; no code appears in any transcript, log,
doc or screenshot (the doorstep spec is test-asserted to carry no code). The 3 read-only items (C185, C192,
C194) have no executing tap, so they have no doorstep.

## What I learned (LEARN)

- Every one of the 43 items' live rails is NOT_WIRED in packages/capabilities/realworld.json — learned from the
  audit data before building, which is why the whole cluster is built on the sandbox rail with the boundary
  stated in each conversation.
- C74, C93 and C95 already had production answers (SubscriptionList, PriceDrop, RewardsMath) — found in the
  codebase and reused inside those items' conversations instead of rebuilt.
- The airline module (83-airline-refunds.js) covers US DOT refunds only; EU261 is not in the offer book — so
  C92 is a prepared packet, not a computed claim.
- A new domain module makes docs/depth/MUTATION-COVERAGE.md stale — learned when the suite caught it; the
  report was regenerated in the same session.
- The local-Chromium cancel test cannot run in this shell (Playwright driver/browser revision mismatch) — the
  C73 proof was re-routed to the sandbox provider rail rather than left undone.

"""
doc = doc.replace("## Bugs fixed", door + "## Bugs fixed", 1)

# 3) What I need from you — one line per item: action — place — unlocks
import subprocess
sys_path = str(pathlib.Path.home()/"workspace/upmore-k8")
asks = {
 "C73":"Sign in to Netflix once — guided connect session in Upmore — unlocks the live C73 cancel proof",
 "C74":"Sign in to each provider you pick from the inventory — guided connect session — unlocks live C74 cancellations",
 "C75":"Forward the trial's signup receipt from your inbox — Gmail — unlocks the real conversion date for C75",
 "C76":"Sign in to your internet provider — guided connect session — unlocks the live C76 negotiation",
 "C78":"Sign in to Amazon and point to the returned order — guided connect session — unlocks the live C78 refund case",
 "C80":"Name your gym and sign in to its portal — guided connect session — unlocks the live C80 membership cancel",
 "C81":"Sign in to your Apple ID / Google account — guided connect session — unlocks the live C81 store purge",
 "C82":"Upload the itemized ER bill — Upmore chat attachment — unlocks the live C82 bill fight on the real charges",
 "C84":"Sign in to your internet provider — guided connect session — unlocks the live C84 outage credit",
 "C85":"Name the annual subscription and sign in to it — guided connect session — unlocks the live C85 pre-renewal cancel",
 "C86":"Share the product's purchase receipt — Upmore chat attachment — unlocks the real warranty window for C86",
 "C87":"Share the order and the cheaper listing — Upmore chat — unlocks the live C87 price-match on the real purchase",
 "C88":"Share the hotel/rental folio — Upmore chat attachment — unlocks the live C88 fee dispute on the real charges",
 "C89":"Share the storage contract — Upmore chat attachment — unlocks the real exit clause and notice for C89",
 "C92":"Share the flight receipt (airline, flight number, delay) — Gmail or chat attachment — unlocks the real EU261 packet for C92",
 "C93":"Nothing new — your linked card rows already feed it — a live retailer session unlocks the filed C93 claim",
 "C95":"Sign in to each card issuer — guided connect session — unlocks live C95 category activations",
 "C100":"Name the services with pending referral bonuses — Upmore chat — unlocks the live C100 chase list",
 "C109":"Share the tire purchase receipt — Upmore chat attachment — unlocks the real C109 rebate packet",
 "C112":"Share the lease renewal letter — Upmore chat attachment — unlocks the live C112 counter on the real ask",
 "C113":"Sign in to each utility and set your warning threshold — guided connect session — unlocks live C113 autopay enrollment",
 "C117":"Share your servicer name, loan balance and a current home value — Upmore chat — unlocks the real C117 PMI math (no mortgage is on file today)",
 "C121":"Share the water bill and a normal month's bill — Upmore chat attachment — unlocks the live C121 leak dispute",
 "C122":"Name the prior landlord and the deposit amount — Upmore chat — unlocks the real C122 demand packet",
 "C123":"Pick the rent-reporting service and share your lease — Upmore chat — unlocks live C123 enrollment",
 "C124":"Name your HOA and share any violation notice — Upmore chat — unlocks live C124 dues/violation handling",
 "C143":"Name your auto insurer and share the accident details — Upmore chat — unlocks the real C143 claim packet",
 "C144":"Name the stolen/damaged item and share its receipt — Upmore chat (policy LP491F6A784 is already on file) — unlocks the real C144 claim packet",
 "C145":"Name the cards that were in the wallet — Upmore chat — unlocks the live C145 lock list on your real issuers",
 "C147":"Confirm the name/address details the brokers list — Upmore chat — unlocks live C147 opt-outs on the real listings",
 "C148":"Name the travel insurer and the cancelled trip's cost — Upmore chat — unlocks the real C148 claim packet",
 "C149":"Name the card, the item and its purchase date — Upmore chat — unlocks the real C149 protection packet",
 "C150":"Name your carrier and sign in to it — guided connect session — unlocks the live C150 port lock",
 "C152":"Name the virtual-card service and set the limit — Upmore chat — unlocks the live C152 card issue",
 "C171":"Share your servicer, balances, rates and income — Upmore chat — unlocks the real C171 plan math (no loans are on file today)",
 "C183":"Name your pet insurer and share the vet invoice — Upmore chat attachment — unlocks the real C183 claim packet (no pet is on file today)",
 "C185":"Name the accounts to audit — Upmore chat — unlocks the live C185 beneficiary audit on your real accounts",
 "C188":"Sign in to I-PASS — guided connect session — unlocks live C188 toll verification and disputes",
 "C192":"Share the airline credit emails — Gmail — unlocks the live C192 ledger on your real credits",
 "C194":"Name the destination and rough spend — Upmore chat — unlocks the live C194 comparison on the day's real rates",
 "C195":"Give the beneficiary's exact legal name — secure vault link, never chat — unlocks live C195 updates",
 "C200":"Name every institution to update — Upmore chat (both addresses are already on file) — unlocks live C200 updates",
 "C206":"Share the form that needs the stamp — Upmore chat attachment — unlocks the real C206 medallion packet",
}
lines = ["", "## What I need from you", ""]
for cid in sorted(asks, key=lambda x: int(x[1:])):
    lines.append(f"- {cid}: {asks[cid]}.")
doc = doc.rstrip() + "\n" + "\n".join(lines) + "\n"
doc_path.write_text(doc)
print("patched", len(asks), "asks")
