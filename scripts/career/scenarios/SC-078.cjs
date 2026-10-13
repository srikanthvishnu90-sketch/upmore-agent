"use strict";
const { T, H, NOW, INBOX } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-078", "duplicate-channel-check");
  const store = T.seedTestLog();
  s.user("did I already apply to Notion? I might have done it myself");
  const d = T.duplicateCheck(store, INBOX, "Notion");
  s.tool("126-career-track.duplicateCheck", d);
  s.agent(`${d.answer} The log also has your Notion application (stage ${d.log_stage}, applied yourself or by me — either way, applying again would duplicate it).`);
  s.verify("answer cites the actual inbox fixture message id + the log row, both searched", { inbox_evidence: d.inbox_evidence, in_log: d.in_log, log_stage: d.log_stage });
  await s.finish({ status: "COMPLETE", outcome: "Duplicate check found both the Notion log row (Confirmed) and the inbox confirmation TEST-msg-confirm-notion, cited by id — reapplying would duplicate" });
})();
