"use strict"; const {H,OS}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-275","wins-log-living-resume");
  s.user("Wins log: I text wins all semester; they land in my living resume");
  const store=OS.createStore(); const texts=[["Shipped the payments dashboard migration","2026-09-05","now serves the whole support team"],["Cut report generation time by automating the weekly pull","2026-09-26","report lands same-day instead of next-day"],["Led the intern demo day presentation","2026-10-10","demo shown to the full product org"]];
  const rows=texts.map(([t,d,o])=>OS.logWin(store,{text:t,date:d,outcome:o},{now:"2026-10-13T12:00:00Z"})); s.tool("129.logWin x3 (TEST wins)",rows);
  const packet=OS.reviewPacket(store); s.tool("129.reviewPacket (living-resume seam)",packet);
  s.agent(`Logged all three with their dates, and they already land in your living record:\n${packet.packet_text}`);
  s.verify("3 wins stored in rail state and cited verbatim by the living-record packet",{stored:store.wins,count:packet.count});
  await s.finish({status:packet.count===3?"COMPLETE":"LEARN",outcome:"Three texted wins stored with dates and verified present in the living-resume packet"}); })();
