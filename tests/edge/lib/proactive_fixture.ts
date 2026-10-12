// Fixture rows in the database's own shapes (agent_financial_accounts / agent_financial_transactions) for the proactive
// scheduler tests: three months of a person's checking account. Synthetic; no real person.
export const USER = "00000000-0000-0000-0000-0000000000a1";
export const NOW = Date.UTC(2026, 9, 11, 14, 0, 0); // Sun 2026-10-11 10:00 a.m. New York
export function accountRows(balance_cents = 41200) {
  return [{ account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents, available_cents: balance_cents, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" }];
}
export function txRows(extra: any[] = []) {
  const rows: any[] = []; let n = 0;
  const add = (on: string, cents: number, merchant: string, more: any = {}) => rows.push(Object.assign({ account_id: "chk-1", provider_transaction_id: "t" + (++n), currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" }, more));
  for (const d of ["2026-07-10", "2026-07-24", "2026-08-07", "2026-08-21", "2026-09-04", "2026-09-18", "2026-10-02"]) add(d, 180000, "ACME CORP PAYROLL DIR DEP");
  for (const d of ["2026-07-15", "2026-08-15", "2026-09-15"]) add(d, -145000, "OAK PROPERTY MGMT RENT");
  for (const [d, c] of [["2026-07-20", -1549], ["2026-08-20", -1549], ["2026-09-20", -1799]] as const) add(d, c, "NETFLIX.COM");
  for (const d of ["2026-07-05", "2026-07-12", "2026-07-19", "2026-07-26", "2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04"]) add(d, -6400, "WHOLE FOODS MARKET");
  for (const d of ["2026-10-05", "2026-10-07", "2026-10-09"]) add(d, -2350, "CHIPOTLE 1234");
  add("2026-10-08", -1200, "UBER TRIP");
  return rows.concat(extra);
}
