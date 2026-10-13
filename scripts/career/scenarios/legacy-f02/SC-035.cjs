"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-035", "feed-failure-honesty");
  const bad = await J.fetchFeed(J.feeds.greenhouse("goldmansachs"));
  const good = await J.fetchFeed(J.feeds.greenhouse("janestreet"));
  s.user("(a board token 404s: goldmansachs on Greenhouse)");
  s.tool("121.fetchFeed goldmansachs + janestreet (live)", { goldmansachs: { http: bad.status, postings: bad.postings.length, error: bad.error || null, url: bad.url }, janestreet: { http: good.status, postings: good.postings.length } });
  s.agent(`Recorded as a gap, not papered over: the Greenhouse board token 'goldmansachs' returned HTTP ${bad.status} just now, so I have ZERO Goldman Sachs postings — Goldman posts via its own portal, with no public ATS feed I can read, and I will not invent listings to fill the hole. Finance coverage still works where boards are public: Jane Street's Greenhouse board returned HTTP ${good.status} with ${good.postings.length} live postings in the same run.`, { card: { title: "Feed gap: Goldman Sachs", goldmansachs_http: bad.status, goldmansachs_postings: bad.postings.length, gap_message: "Goldman posts via its own portal — no public feed" } });
  s.verify("the failure is in the rail's own result object (status + error, empty postings); no Goldman rows exist anywhere in the run", { http: bad.status, postings: bad.postings.length, error: bad.error || null });
  await s.finish({ status: bad.status !== 200 && bad.postings.length === 0 ? "COMPLETE" : "LEARN", outcome: `Goldman Greenhouse token failed live (HTTP ${bad.status}); reported as a portal-only gap with 0 invented listings, Jane Street contrast verified (HTTP ${good.status}, ${good.postings.length} postings)`, reason: bad.status === 200 ? "the token unexpectedly responded 200 in this run, so the failure condition did not occur" : undefined });
})().catch((e) => { console.error(e); process.exit(1); });
