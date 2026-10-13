"use strict"; const { H, N, fixture, NOW, F10 } = require("./w11-lib.cjs");
(async () => { const s = H.session("SC-206", "offer-intake");
  s.user("Offer intake: my offer letter parsed into the log — base, equity, bonus, benefits, start, expiry");
  s.tool("user-pasted offer text (TEST fixture test-offer-a.txt)", fixture("test-offer-a.txt"));
  const store = N.createStore(); const row = N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW }));
  s.tool("128.parseOffer + storeOffer -> stored log row", row);
  s.agent(`Parsed into the log as ${row.offer_id}:\n• Company: ${row.company} — ${row.role} (${row.location})\n• Base: $${row.base_salary.toLocaleString()}\n• Signing bonus: $${row.signing_bonus.toLocaleString()}\n• Annual bonus: target ${row.annual_bonus.pct}% of base\n• Equity: $${row.equity.grant_value.toLocaleString()} ${row.equity.type || ""} grant, vesting over ${row.equity.vest_years} years, ${row.equity.cliff} cliff\n• Benefits: ${row.benefits.join("; ")}\n• PTO: ${row.pto_days} days\n• Start: ${row.start_date} · Decision deadline: ${row.expiry_date} (expiry clock is running in the log)\n• Missing fields: ${row.missing.length ? row.missing.join(", ") : "none"}`);
  s.verify("stored row fields equal the letter's stated values; deadline row created from the same stored offer", { stored: store.offers[0], deadline: store.deadlines[0] });
  await s.finish({ status: "COMPLETE", outcome: "TEST offer letter parsed and stored in the log with every field verified from rail state (base/equity/bonus/benefits/start/expiry). Prior sibling evidence under old numbering SC-181 reaches the same Done-when — see " + F10 }); })();
