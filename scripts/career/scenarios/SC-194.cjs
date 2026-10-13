"use strict"; const { H, OS, N, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-194", "goals-checkin");
  s.user("(scheduled check-in fires)");
  const store = OS.createStore({ goals: [
    { text: "Secure a Summer 2027 SWE internship offer", target: 1, metric: "offers_logged" },
    { text: "Log wins every month", target: 3, metric: "wins_logged" },
    { text: "Keep a passive watch running", target: 1, metric: "active_watches" } ] });
  N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW }));
  OS.logWin(store, { text: "Shipped the dashboard migration", date: "2026-09-15" }, { now: NOW });
  OS.createWatch(store, { companies: ["Stripe"], role_families: ["SWE"] }, { now: NOW });
  const ci = OS.goalsCheckin(store, { now: NOW }); s.tool("129.goalsCheckin", ci);
  s.agent(`Check-in — stated goals vs your log's reality:\n${ci.stated_goals.map((g) => `• ${g.goal}: ${g.measured}/${g.target} — ${g.status}`).join("\n")}\nOpen deadline in the log: Airbnb offer decision by 2026-10-30. Proposed adjustment: add one win-log entry before month-end to get the wins goal back on pace — I'll only save adjustments you confirm.`);
  s.verify("check-in measured counts equal stored log rows (1 offer, 1 win, 1 watch)", { reality: ci.reality });
  await s.finish({ status: "COMPLETE", outcome: "Scheduled check-in compared stated goals against the log's actual counts and proposed a user-confirmed adjustment" }); })();
