"use strict"; const { H, OS, livePostings } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-196", "raise-worthy-market-shift");
  s.user("(a starred company's comp band moves in new postings)");
  // Prior snapshot: recorded-shape prior poll (labeled) vs current LIVE poll — the shift check only reads stated ranges.
  const prior = [{ job_id: "prior-stripe-1", company: "Stripe", title: "Software Engineer, New Grad", role_family: "SWE", location: "San Francisco, CA", url: "https://boards.greenhouse.io/stripe", posted_at: "2026-09-01T00:00:00Z", jd_text: "RECORDED PRIOR SNAPSHOT (labeled): Salary range $120,000 - $150,000." }];
  const live = await livePostings(["stripe"]); s.tool("121 live feed (current)", live.feeds);
  const shift = OS.compBandShift("Stripe", prior, live.postings); s.tool("129.compBandShift", shift);
  if (shift.shift) { s.agent(`Passive watch ping: ${shift.statement} Evidence is in the tool record — the ranges exactly as the postings state them.`); }
  else { s.agent(`No ping sent. ${shift.statement} I only ping on a band move I can show from stated posting ranges — never on an invented market claim.`); }
  s.verify("shift verdict computed solely from stated ranges in prior snapshot vs live postings", { shift });
  await s.finish(shift.shift ? { status: "COMPLETE", outcome: "Passive watch detected a stated-range comp-band move for the starred company and pinged with evidence" } : { status: "LEARN", outcome: "Watch ran against the live feed; no stated-range band move for Stripe was detectable from current postings", reason: shift.statement, unblock: "A Stripe posting whose JD states a salary range different from the prior snapshot's $120,000–$150,000 (live Greenhouse JD text frequently omits ranges — then no honest ping is possible)" }); })();
