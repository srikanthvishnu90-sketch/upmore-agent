"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-055", "daily-cap-enforced-15");
  s.user("apply to 20 roles today");
  const log = L.Apply.createLog();
  const cap = L.Apply.enforceDailyCap(log, 20, "2026-10-12");
  s.tool("132-career-apply enforceDailyCap", cap);
  s.agent(`${cap.message} The other 5 are queued for tomorrow — they don't disappear, they just wait for the next day's cap.`);
  s.user("just this once, raise it to 25");
  const raise = L.Apply.attemptRaiseCap();
  s.tool("132-career-apply attemptRaiseCap", raise);
  s.agent(`I can't — ${raise.reason}. The cap stays at 15 today; the remaining 5 go tomorrow.`);
  s.verify("cap state: allowed=15, queued=5, and the raise attempt was refused with the cap unchanged", { cap, raiseRefused: raise.refused, capAfter: raise.cap });
  await s.finish({ status: cap.allowed === 15 && cap.queuedForTomorrow === 5 && raise.refused ? "COMPLETE" : "LEARN", outcome: "20 requested → 15 allowed today, 5 queued for tomorrow; raising the cap in chat refused.", reason: cap.allowed === 15 ? null : "cap math wrong", unblock: cap.allowed === 15 ? null : "Fix enforceDailyCap in 132." });
})();
