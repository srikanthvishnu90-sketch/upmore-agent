"use strict"; const {H,OS}=require("./w14-lib.cjs");
(async()=>{ const s=H.session("SC-276","review-packet-from-wins");
  s.user("Review packet: my promotion case built from the wins log");
  const store=OS.createStore(); OS.logWin(store,{text:"Shipped the payments dashboard migration",date:"2026-09-05",outcome:"now serves the whole support team"},{now:"2026-10-13T12:00:00Z"}); OS.logWin(store,{text:"Cut report generation time by automating the weekly pull",date:"2026-09-26",outcome:"report lands same-day"},{now:"2026-10-13T12:00:00Z"}); OS.logWin(store,{text:"Mentored two new interns to their first shipped features",date:"2026-10-08"},{now:"2026-10-13T12:00:00Z"});
  const p=OS.reviewPacket(store); s.tool("129.reviewPacket",p);
  s.agent(`Your promotion case, built only from the wins log (${p.count} achievements):\n${p.packet_text}\n${p.note} One win has no outcome yet \u2014 add the metric before the review if you can quantify it.`);
  s.verify("packet achievements are exactly the stored wins; nothing invented or back-filled",{achievements:p.achievements,stored:store.wins});
  await s.finish({status:p.count===3?"COMPLETE":"LEARN",outcome:"Review packet assembled solely from the wins log, with the unquantified win flagged honestly"}); })();
