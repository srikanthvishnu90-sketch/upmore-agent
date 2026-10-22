# F-013 pin attempt — empty location (DISCO-QUALITY, 2026-10-21)

**Method:** read-only shelf queries (`sb.py query`, SUPABASE_REF=mrwngntwmnaqrqhupvlt) against
`public.career_kb_postings` (21,688 rows), plus the two code layers that touch location.

**Verdict — MAPPING (load side), not source data and not render.** The exemplar row is
`ashby:https://jobs.ashbyhq.com/openai/8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3` ("Technical Program
Manager, Compute Infrastructure", OpenAI): its shelf `location` is `''` and its `extra` is `{}` —
and it is not one bad row: **all 2,776 of 2,776 Ashby rows on the shelf have an empty location**,
a whole-source absence that cannot be per-employer source data (Ashby postings carry locations,
and the product's own Ashby normalizer reads them: `packages/domain/121-career-jobs.js:504`,
`location: j.location || j.locationName || ""`). The corpus loader that built the shelf snapshot
simply never carried the field for this source — no location in the column, none in `extra`, none
in the excerpt header. The render layer is faithful and blameless: `career_pool.js:107` copies
`location: s(row.location || "")` verbatim, so whatever the shelf holds is what the user sees;
the "one role renders with EMPTY location" is any Ashby row surfacing in a served list.
Secondary counts for the same defect class: hn-algolia 169/358 empty (HN posts often genuinely
lack a structured location — plausibly source data there), arbeitnow 89/2,608, remoteok 40/99,
themuse 1/1,505; greenhouse, lever, workday, nyc-open-data, jobicy, remotive carry **zero** empty
locations, which is what proves the shelf pipeline *can* carry the field — the Ashby leg of the
loader dropped it. One leg is NOT_RUN: a live Ashby posting-API spot-check to watch the field
arrive in the payload (the fetch timed out; not retried) — the verdict does not depend on it,
resting on the normalizer's contract plus the whole-source pattern. **Fix owner:** the corpus
loader's Ashby mapping (carry `location`/`locationName` into the column, backfill not possible —
the data was never captured — so the fix lands on the next snapshot load), with a load-side
guard worth adding beside the F-010 shape guard: a source whose rows land >95% empty on a
field the normalizer maps should fail the load loudly instead of silently shipping blanks.
