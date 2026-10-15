# MI-052 — Prep/Graph harness world: staged graph + company context (Crew A, 2026-10-15)

## The defect in the measuring world

The fix-wave record (W5, BUG-070…079) left Prep/Graph at 7/42 with 35 residuals, and
its own text named the cause: the harness staged an **empty graph** (P1 connections:
[], no LinkedIn export) and **no company files/targets**, so 135's products were
honestly empty and the briefs honestly NO_CIR — and the residuals were charged to the
product. Verified on the current tree before this fix: SC-146 answered "Your graph on
file holds 0 people"; SC-100 filled "0 of the 5–10 seats … from your graph".

## What the harness world now stages

- **A real graph** — `packages/career-data/fixtures/gauntlet/graph/p1-graph.json`:
  P1's LinkedIn export + pasted contacts (11 rows, ALL TEST people): two Stripe
  paths (an TEST-University alum, an EM), a Stripe recruiter, Datadog alum +
  recruiter, a professor with a Google past, a just-joined alum at Ramp, a departed
  ex-Stripe contact, an internship colleague, a family friend, one person present in
  two sources (SC-174's premise), plus 4 interaction records (Daniel's coffee chat,
  Priya's chat, Elena's coffee chat, the professor meeting) dated against the
  gauntlet turn clock (2026-10-13).
- **Staging seam** — `pilot-lib.cjs stagingContext`, opt-in by scenario id
  (SC-100, SC-146…205) AND measurement-run slug: the graph rides `ctx.graph` (a channel 142's graphStoreOf
  reads). For the four brief scenarios the wave named (SC-176/177/181/183), the round
  context is staged ONLY through production-shaped keys — the profile's
  targetCompanies (on a clone; the runner's profile is never mutated — verified),
  the thread's staged Stripe posting from the corpus, and (SC-181) the invite's
  people as thread contacts. An earlier draft staged `ctx.company`/`ctx.cirs`; both
  were removed — the production host carries neither key, and the harness must
  stage only what a host could stage.

## Re-run classification (61 scenarios driven through the full chat path)

- **Fallback / no-intent: 0 of 61.** Typed payloads on 34.
- **No longer world-bound:** the graph band answers from the staged graph — SC-146
  returns 4 warm paths into Stripe (was: 0 people); SC-157 returns 3 due keep-warm
  touches with real reasons; SC-176's brief is CIR-grounded ("The bar at Stripe: …"
  from stripe.json).
- **Product residuals — now attributable to the product, named:**
  1. SC-146/SC-174 class: the two-source person (Priya Nair, linkedin-export +
     alumni-directory rows) is listed TWICE in the paths reply — the multi-source
     merge the family promises does not reach findPaths' rendering. (135/142.)
  2. SC-156: "When did I last talk to Daniel" — relationshipMemory resolves only
     exact full names; the unique first name in the graph finds nobody, and the
     staged interaction is never read. (135.)
  3. SC-157: the keep-warm list drops Prof. Alan Reyes's entry into a dangling
     "Prof." prefix on the next person's line — 3 due contacts announced, 2 named
     plus a fragment. (135/142 rendering.)
  4. SC-177/SC-183: the prep bank/brief resolves its company from the ask text
     only; the staged round (targets + posting) is not consulted, so "this round" /
     "this company" briefs stay company-less even with the round staged. (142 prep
     seam — production has the same gap when the user doesn't name the company.)
- **Still world-bound, honestly:** SC-181 (the calendar invite itself is not a
  record type the harness stages — the product's ask to paste it is correct
  behavior), SC-193/SC-200 (final-round/superday briefs for rounds whose company
  the asks don't name and which are not the Stripe round — staging them needs
  per-scenario round companies, several without CIR files on disk; a named
  fixture-program backlog, not silently staged with the wrong company), SC-100
  (mini-campaign at an unnamed "dream company" — the ask is underspecified; the
  honest reply stands in any world).
- SC-150/151-class (graph_blurb/alumni/memory intents with no A4 element branch)
  remains a GRADER-branch gap, not a world gap — owned by the A4 contract lane,
  unchanged by this item.

## Standing rule from this item

A family's residuals may not be reported as product failures until the harness
world stages what a production host would stage for that family (graph, company
files, round context) — and the harness may only stage production-shaped keys.
