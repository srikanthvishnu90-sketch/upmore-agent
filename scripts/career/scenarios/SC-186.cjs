"use strict"; const { H, N, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-186", "deadline-extension");
  s.user("ask them for more time");
  const store = N.createStore(); const o = N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW }));
  const ext = N.extensionDraft(o, { days: 7, reason: "finals week" }); const tracked = N.trackExtension(store, o, ext);
  s.tool("128.extensionDraft+trackExtension", { ext, tracked });
  s.agent(`Draft ready on the card — it asks to move your deadline from ${ext.current_deadline} to ${ext.requested_deadline}. Nothing sends without your yes; the requested deadline is already tracked as drafted-not-sent.`, { card: ext.card });
  s.verify("deadline tracking row exists with from/to dates and status drafted_not_sent; card sent=false", { deadlines: store.deadlines });
  await s.finish({ status: "COMPLETE", outcome: "Extension draft card-gated (not sent) and the requested new deadline tracked in the log", reason: "Per program rules nothing sends without an approval card — the draft + tracking are the completed rail state; the actual send fires only on the user's card tap in the live chat surface.", unblock: "User taps yes on the extension card in the live app to send" }); })();
