# Design review — the bar (T-87)

Prompt 1 rule 6: *"Design changes pass the screenshot sweep in docs/design-review/."*
This directory is that sweep. The bar below is written the way a sharp user
judges a chat surface in five seconds — not the way an engineer describes it.
A surface passes only if **every** applicable item passes on its rendered
evidence (the HTML/PNG chat renders in
`~/workspace/your_files/upmore-career-conversations/`).

## Checklist

1. **One clear primary action per card.** The user can tell, without reading
   twice, what tapping/approving does, and there is exactly one such action.
   Destructive or irreversible actions (disconnect, stop-everything, submit)
   show an explicit confirmation step.
2. **Exact where it counts.** Any card or message about money, sends, or
   submissions shows the exact amounts, names, dates, counts, and caps
   involved — never "some", "a few", or a rounded figure presented as exact.
   Numbers in the same message must agree with each other.
3. **Plain language, no jargon.** No internal vocabulary in user-facing text:
   no tier codes (T1–T4), no "CIR", no spec-section references (§3.2, Q30),
   no function names, no file paths, no internal IDs (ref-…, app-…, VAR-…),
   no status codes (`approved_not_sent`), no snake_case field names
   (`follow_up_due`, `base_salary`, `offer_expiry`).
4. **No raw data as UI copy.** Cards render as readable, labeled rows a
   person can scan. A JSON blob, a `{...}` map, an `= true` checklist, or a
   `null` is never presented as the card's content. A missing value is shown
   as missing in words ("no fit score yet") — never as `null`, and the prose
   around a card never claims a value the card does not show.
5. **Honest status words.** Built / proven / blocked (and COMPLETE / LEARN /
   ASK) are used only in their defined senses. A draft is not "sent", a plan
   is not "running", a paused campaign says why it paused, and nothing
   claims success that the same screen contradicts.
6. **Consistent card anatomy across tiers.** Send, submit, and share cards
   share one anatomy: title (what this is), body rows (who/what/exact
   values), one primary action, and a plain footer note (what happens /
   what does not happen yet). A card's title is not a verbatim repeat of the
   bubble text above it. Every card has a type; untyped ad-hoc cards fail.
7. **Readable renders.** Body text ≥14px equivalent, card text not shrunk
   below body size, text/background contrast ≥ 4.5:1 (WCAG AA for normal
   text), no wall-of-text answers where a short headed structure would do,
   no truncated rows presented as complete.
8. **Career surfaces contain career content.** No finance-domain leftovers
   (rent cycles, payment engines, PAY-### rows, finance capability counts,
   brokerage/bill vocabulary) inside a career answer, card, or status.
9. **Grammar a user would trust with their inbox.** Sentences have
   subjects, no doubled articles ("a a", "the a"), no duplicated sentences
   from two copy layers, counts pluralize ("1 rejection", not
   "1 rejections"), company and role names are spelled and capitalized the
   way the company spells them, with no stray leading spaces and no
   duplicate rows on the same card.
10. **One persona, honestly labeled.** TEST/fixture content is labeled as
    such wherever it could be mistaken for a real person, account, or send.

## How a sweep runs

- Sample every distinct surface **type**, not just every family: connect
  card, connected-accounts list, disconnect, approval card per tier (send /
  submit / share), safety-plan card, digest (daily / weekly / quiet-hours),
  brief, list-review card, status answer, thesis answer, handoff card,
  kill-switch state, onboarding chat, refusal/sensitive chat.
- Minimum 25 renders, each verdict recorded with its evidence filename.
- Defects go to a finisher bug file with severity; only trivial copy
  defects inside career domain modules are fixed in the sweep itself —
  structural defects are logged, not redesigned mid-sweep.
- The sweep verdict is strict: one P1 (severity-1) defect class on a swept
  surface type fails the sweep for that surface until fixed and re-swept.
