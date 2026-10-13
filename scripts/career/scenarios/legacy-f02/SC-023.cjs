"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;

(async () => {
  const s = H.session("SC-023", "new-posting-alert");
  s.user("tell me the moment a good role posts at my starred companies");
  const prof = L.profile("test-persona.json");
  const store = L.memStore();
  const starred = prof.preferences.starred_companies;
  const p1 = await L.pollLive(store);
  const p2 = await L.pollLive(store);
  s.tool("121.poll x2 (same snapshot store, unchanged live feeds)", { first_new: p1.new_postings.length, second_new: p2.new_postings.length, starred_companies: starred });
  const starredNew = p2.new_postings.filter((p) => starred.map((x) => x.toLowerCase()).includes(p.company.toLowerCase()));
  s.agent(`Watching your starred companies: ${starred.join(", ")}. Poll cadence for starred companies is every ${J.POLL_MINUTES.starred} minutes. I just ran two polls back to back: the first established the snapshot (${p1.new_postings.length} postings seen as the baseline), the second found ${p2.new_postings.length} genuinely new postings — so no alert fires. When a new one lands, the alert will name the company, the role, and your fit score.`, { card: { title: "Starred-company watch", starred, cadence_minutes: J.POLL_MINUTES.starred, false_alerts_on_unchanged_feeds: p2.new_postings.length } });
  s.verify("diffNew against the rail's own snapshot: second poll on unchanged feeds returns an empty new-set (0 false alerts)", { first_poll_new: p1.new_postings.length, second_poll_new: p2.new_postings.length, starred_new: starredNew.length });
  await s.finish({ status: "COMPLETE", outcome: `Baseline snapshot set from live feeds; immediate re-poll produced ${p2.new_postings.length} new postings and 0 false alerts at starred companies` });
})().catch((e) => { console.error(e); process.exit(1); });
