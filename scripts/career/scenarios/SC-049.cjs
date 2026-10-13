"use strict";
const { H, M, NOW, PROFILE, poolOverFirms, FIRM_SETS } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-049", "honest-yield-before-approval");
  const firms = [].concat(FIRM_SETS.sets.elite_boutique.firms, FIRM_SETS.sets.bulge_bracket.firms.filter((f) => f.status !== "historical")).map((f) => f.name).slice(0, 16);
  const records = poolOverFirms(firms, 20, { per: (i) => { const r = i % 16; if (r < 10) return {}; if (r < 14) return { email_verification: null, email_source: "pattern", email_confidence: 0.6 }; if (r === 14) return { email_verification: "risky", email_source: "pattern", email_confidence: 0.4 }; const d = i % 4; return d === 0 ? { work_email: null } : d === 1 ? { email_verification: "invalid" } : d === 2 ? { opt_out: true } : { geography: "London", office: "London", country: "GB" }; } });
  const q = M.parseTarget("Find 300 bankers for a campaign — tell me the honest yield before I approve anything", PROFILE);
  const y = M.honestYield(records, Object.assign({}, q, { count: 300 }), { profile: PROFILE, nowMs: NOW });
  s.user("Find 300 bankers for a campaign — tell me the honest yield before I approve anything");
  s.tool("124.honestYield (engine breakdown over the fixture pool)", { found: y.found, verified: y.verified, patterned_out: y.patterned_out, trusted_emails: y.trusted_emails, risky_emails: y.risky_emails, sendable: y.sendable, selected: y.selected, reserve: y.reserve, exclusions: y.exclusions });
  s.agent(`Honest yield, before any approval: ${y.text} Nothing sends until you approve — and the patterned, unverified addresses never get counted as trustworthy.`, { card: { title: "Honest yield", found: y.found, trustworthy: y.trusted_emails, verified: y.verified, patterned_out: y.patterned_out, sendable: y.sendable, selected: y.selected, reserve: y.reserve, exclusions: y.exclusions } });
  s.verify("yield numbers are the engine's own buildList breakdown over the fixture pool (not the canonical example numbers)", { found: y.found, sendable: y.sendable, verified_plus_patterned_le_sendable: y.verified + y.patterned_out <= y.sendable, exclusions_sum: Object.values(y.exclusions).reduce((a, b) => a + b, 0) });
  await s.finish({ status: "COMPLETE", outcome: `Honest yield quoted from the engine's own breakdown: ${y.found} found, ${y.trusted_emails} trustworthy emails, ${y.sendable} sendable (${y.verified} verified, ${y.patterned_out} patterned/unverified kept separate) — quoted before any approval, exactly as computed` });
})();
