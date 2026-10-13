"use strict"; const { H, P } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-178", "interviewer-changed-last-minute");
  await s.user("my interviewer just changed — it's now Dana Kim (TEST), a Senior SWE on the platform team, instead of Sam");
  await s.tool("calendar.invite.updated (scenario fixture)", { change: "Sam Rivera (TEST) -> Dana Kim (TEST)", supplied_public_facts: [] });
  const b = P.interviewerBrief({ name: "Dana Kim (TEST)", role: "Senior Software Engineer, Platform team", company: "Snowflake", publicFacts: [] });
  await s.agent(`Regenerated before your call. New-person brief for Dana Kim (TEST), Senior SWE, Platform team, Snowflake:\n\nStatus: UNKNOWN on background — the updated invite supplies no public professional facts for Dana, so I won't invent a bio. Unknown: ${b.unknown.join(", ")}.\n\nWhat you can still prep, grounded: the role (platform team → expect systems/deployment depth; your DeployBoard story — Go, Kubernetes, AWS EKS, 12 student teams — is your strongest match) and Snowflake's CIR bar (follow-ups push past the first working solution). Your previous interviewer's brief is superseded; nothing about Sam carries over.`);
  s.verify("regenerated brief state", { name: b.name, status: b.status, invented_facts: b.brief.length });
  await s.finish({ status: "COMPLETE", outcome: "Interviewer-change brief regenerated before the call from the updated invite: new person marked UNKNOWN where no public facts exist (zero invented facts), with role- and CIR-grounded prep angles substituted.", reason: null, unblock: null });
})();
