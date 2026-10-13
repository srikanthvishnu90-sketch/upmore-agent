"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-170", "mini-campaign-one-company");
  await s.user("Mini-campaign at one company: 8 people sequenced warm to cold");
  const mk = (name, o) => T(name, Object.assign({ current_firm: "Stripe", title: "Software Engineer", work_email: name.split(" ")[0].toLowerCase() + "@example.test" }, o));
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    mk("Anna A", { schools: ["TEST University"], clubs: ["TEST University Investing Club"], connection_degree: 1 }),
    mk("Ben B", { schools: ["TEST University"], clubs: ["TEST University Investing Club"] }),
    mk("Cara C", { schools: ["TEST University"], connection_degree: 1 }),
    mk("Dan D", { schools: ["TEST University"] }),
    mk("Eli E", { connection_degree: 1, hometown: "Chicago, IL (TEST)" }),
    mk("Fay F", { hometown: "Chicago, IL (TEST)" }),
    mk("Gus G", { connection_degree: 2 }),
    mk("Hal H", {})] }]);
  const camp = G.miniCampaign(st, "Stripe", profile, { count: 8 });
  await s.tool("135-career-graph.miniCampaign", camp);
  await s.agent(`Your 8-person Stripe mini-campaign, sequenced warm to cold — one at a time, each a coffee-chat ask first (a referral ask never goes in email one), and replies re-rank the rest:\n\n${camp.sequence.map((x) => `${x.order}. ${x.name} — warmth ${x.warmth} (${x.why.join(", ")})`).join("\n")}\n\nNothing is sent yet: the sequence is queued, and each send rides the 124 campaign caps (per-firm 15/30d is never approached by 8).`);
  s.verify("campaign state", { count: camp.count, warmths: camp.sequence.map((x) => x.warmth), all_queued_not_sent: camp.sequence.every((x) => x.status === "queued_not_sent") });
  await s.finish({ status: "COMPLETE", outcome: "8-person single-company mini-campaign built and sequenced warm→cold (85→0) with per-person shared facts, all queued-not-sent under the 124 caps." });
})();
