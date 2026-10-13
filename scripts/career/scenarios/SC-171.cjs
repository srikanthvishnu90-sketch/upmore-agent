"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-171", "current-employer-contact-excluded");
  await s.user("Contact sits at my current employer — excluded by default, and I hear why");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    T("Inside Person", { current_firm: "TEST Systems Inc", title: "Engineering Manager", schools: ["TEST University"], connection_degree: 1, work_email: "inside@example.test" }),
    T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer", schools: ["TEST University"], work_email: "priya@example.test" })] }]);
  const res = G.findPaths(st, "TEST Systems Inc", profile);
  await s.tool("135-career-graph.findPaths(current employer)", res);
  await s.agent(`Excluded — and here's why you heard about it instead of it happening silently: ${res.excluded[0].exclusion.detail}\n\nThis is a default, not a wall: if you genuinely want to use this contact (for example, an internal transfer conversation), say so knowingly and I'll put the ask on a card with this warning attached. I will never route a job-search ask through a current-employer contact on my own.`);
  s.verify("exclusion state", { paths_at_current_employer: res.paths.length, excluded_reason: res.excluded[0].exclusion.reason });
  await s.finish({ status: "COMPLETE", outcome: "Current-employer contact (TEST Systems Inc = persona's internship employer) excluded from paths by default, with the reason surfaced to the user and a knowing-override path stated." });
})();
