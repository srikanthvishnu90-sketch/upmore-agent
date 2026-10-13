"use strict";
// SC-006 Portal account record — Workday record holds alias + vault REF only; secret refused.
const { H, A, EMAIL } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-006", "portal-account-record");
  s.user("you'll need a Workday account for that application — set it up");
  s.agent("I'll create the Workday portal record the way the rail requires: a unique alias email for this company, and the generated password stored in the vault — the record itself only ever holds the vault reference.");
  const alias = "alex.testcase+workday@example.test";
  const rec = A.portalRecord({ company: "Workday", alias_email: alias, password_vault_ref: "portal_workday_cred", now: Date.UTC(2026, 9, 12) });
  s.tool("CareerAccess.portalRecord(Workday)", rec);
  const probe = A.portalRecord({ company: "Workday", alias_email: alias, password_vault_ref: "portal_workday_cred", password: "mock-secret-value-999" });
  s.tool("CareerAccess.portalRecord(with a password field — must refuse)", probe);
  const list = A.portalList([rec.record]);
  s.tool("CareerAccess.portalList", list);
  s.agent(list.text, { card: { type: "portal_accounts", title: "Portal accounts", companies: list.companies } });
  const ok = rec.ok === true && rec.record.company_key === "workday" && rec.record.alias_email === alias
    && rec.record.password_vault_ref === "portal_workday_cred" && list.count === 1
    && probe.ok === false && probe.code === "secret_in_record"
    && !JSON.stringify(s.messages).includes("mock-secret-value-999")
    && !("password" in rec.record);
  s.verify("portal record state: company + unique alias + vault ref only, no password field exists on the record; listing names the company; a record handed a secret is refused and the value never echoed", { ok, record: rec.record, list_count: list.count, refused_code: probe.code });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Workday portal record created and listable: company + unique alias email + vault reference only — no secret value in the record, the listing, or any output; a secret-shaped record was refused outright." }
    : { status: "LEARN", outcome: "Portal record did not meet the alias + vault-ref-only standard.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix portalRecord/portalList in 120 and rerun SC-006." });
})().catch((e) => { console.error(e); process.exit(1); });
