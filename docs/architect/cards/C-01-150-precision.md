# C-01: module 150 never puts the person's contact facts into a question that is not asking for them

Status: ready · Work order: WO-009b-3 · Branch: `wo/009b-3-acceptance` (yours, at 58e7b97d) · Approved by the architect
2026-10-19 (answers Codex's request "authorize conservative classifyKind fixes in module 150").

## Base
```
git checkout wo/009b-3-acceptance
git fetch origin && git merge origin/trunk      # brings the ingest clock fix (PR #19) and the planner precision fix (PR #20)
```

## Files (only these)
- `packages/domain/150-career-portal-browser.js`: inside `classifyKind` only.
- `tests/career-apply-forms.test.cjs`: no edits expected; your four tests already state the contract.

## Steps
1. At the top of `classifyKind`, right after the line that defines `eff`, add exactly:
```js
    // Precision (architect, 2026-10-19; C-01): a wrong mapping sends a wrong answer to an employer, an unknown only asks.
    // The person's own contact facts go only into a free-text box that asks about the person: never a checkbox, radio
    // or select ("Do you own a Smartphone?"), never a question about someone else (a reference, a referrer, a manager).
    // Same rule as classifyField in supabase/functions/_shared/career_apply.ts (tests/architect/wo-009-classify-precision.test.ts).
    // inputType is the helper's (type attribute || tag name): a plain <input> with no type arrives as "input".
    const ownText = /^(text|input|email|tel|url|search|textarea)$/.test(inputType || "text") && !(f && f.tag === "select") &&
      !/\breferr|\breferen|\bteam member|\breferee|\bemergency|\bmanager|\bsupervisor|\brecruiter|\bspouse|\bparent|\bguardian|\bemployee who/.test(eff);
```
2. Extend the attestation rule (the line starting `if (/certif|attest|acknowledge|true and complete|provided.*true/`) so its
   regex is `/certif|attest|acknowledge|true and complete|provided.*true|^i understand|i have (read|marked)/`. Nothing
   else on that line changes.
3. Change the country rule to:
```js
    if (/\bcountry\b/.test(eff) && !/how (many|long)|\byears?\b|\bmonths?\b/.test(eff)) return { kind: "standard", profile_key: "country" };
```
4. Put `ownText &&` at the start of the condition on each of these eight rules, and change nothing else in them except
   where noted: name (`first name|last name|full name|...`), email, phone, linkedin, github, website (`portfolio|...`),
   current company, location. The phone rule's regex becomes `/\b(tele)?phone\b|\bcell\b|^mobile\b|mobile (phone|number)/`
   (so "Smartphone" is not a phone number). The location rule's exclusion becomes
   `!/preference|desired|applying for|office/.test(eff)`.
   Keep the label-less name fallback (`f && !f.label && (f.name === "name" || f.id === "name")`) inside the same
   `ownText && (...)` group: write it as `if (ownText && (/first name|.../.test(eff) || (f && !f.label && (...))))`.
5. Do not touch any other rule.

## Verified by the architect before handing over (2026-10-19)
This exact code, applied to `wo/009b-3-acceptance` at 58e7b97d: `tests/career-apply-forms.test.cjs` 22/22 as a non-root
user (before: 17/22, your four precision tests and the combined real-form test failing), and
`tests/career-portal-*.test.cjs` 92/92 with and without it (no regression). An earlier draft without
`input` in the list made 4 other tests fail (plain `<input>` fields became unknown); that is why the comment is there.

## Proof (run each, paste the summary lines)
```
node --test tests/career-apply-forms.test.cjs            # as a non-root user: expect your 4 precision tests to pass
node --test tests/career-portal-*.test.cjs               # run on origin/trunk first, then on your branch
deno test -A --no-check --ignore=tests/architect/pending tests/architect/
```
Paste: the pass/fail counts of each, and for `tests/career-portal-*.test.cjs` the list of failing test names on trunk
and on your branch. They must be the same list (no new failure). If a portal test now fails because it expected a
contact fact in a checkbox/radio/select, that test encoded the defect: list it under `BLOCKED:` with its name and stop;
the architect decides.

## Commit and PR
- Commit: `WO-009b-3 C-01: module 150 answers a contact question only in a free-text box about the person`
- PR into `trunk`, title: `WO-009b-3: rendered-form acceptance, active-challenge detection, contact precision (C-01)`
- The PR is the whole branch (your harness, the challenge fix and C-01). Body: the three proofs above, verbatim counts.

## Done
CI on the PR is green, and the four tests "employer office preference", "email acknowledgement", "smartphone
ownership" and "residence duration" pass without having been edited.
