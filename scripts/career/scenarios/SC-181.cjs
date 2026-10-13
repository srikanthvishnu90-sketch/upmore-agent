"use strict"; const { H, N, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-181", "offer-intake");
  s.user("here's my offer (attaches TEST offer letter)");
  const store = N.createStore(); const parsed = N.parseOffer(fixture("test-offer-a.txt"), { now: NOW }); const row = N.storeOffer(store, parsed);
  s.tool("128.parseOffer+storeOffer", row);
  s.agent(`Parsed and logged your offer from ${row.company}: base $${row.base_salary.toLocaleString()}, signing $${row.signing_bonus.toLocaleString()}, target bonus ${row.annual_bonus.pct}%, equity $${row.equity.grant_value.toLocaleString()} RSU grant over ${row.equity.vest_years} years (${row.equity.cliff} cliff), ${row.pto_days} days PTO, start ${row.start_date}, decision deadline ${row.expiry_date}. These stored values are what every later answer will use.`);
  s.verify("stored offer row equals parsed fields; deadline row created from expiry", { stored: store.offers[0], deadlines: store.deadlines });
  await s.finish({ status: "COMPLETE", outcome: "TEST offer parsed into the log (base/equity/bonus/benefits/start/expiry) and verified from stored state" }); })();
