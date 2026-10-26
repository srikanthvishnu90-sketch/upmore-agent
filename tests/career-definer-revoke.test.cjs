// Launch readiness B1 (2026-10-26): every migration that creates a SECURITY DEFINER function revokes EXECUTE on it from
// PUBLIC and anon in the same file (scripts/launch/definer-revoke-scan.cjs). Supabase grants EXECUTE on each new public
// function to anon by default, so a definer function without that revoke can be called with the anon key, which ships in
// the web page; that is how exec_vault_read came to decrypt Vault secrets for anyone on production.
// The files below predate the rule. Each is covered at run time by 20261026230500_definer_execute_lockdown.sql and checked
// on the applied schema by tests/db/definer_lockdown.test.sql. The list may only shrink: a new file must carry its revoke.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { scan, definersIn, revokedIn } = require("../scripts/launch/definer-revoke-scan.cjs");

const GRANDFATHERED = [
  "20260927_000001_referral_program.sql generate_referral_code",
  "20260927_000001_referral_program.sql assign_referral_code",
  "20260927_000001_referral_program.sql is_eligible_referrer",
  "20260927_000001_referral_program.sql qualify_referral",
  "20260927_000001_referral_program.sql get_referral_stats",
  "20260927_000005_referral_pending_credit.sql qualify_referral",
  "20260927_000005_referral_pending_credit.sql credit_pending_referral",
  "20260927_000005_referral_pending_credit.sql get_referral_stats",
  "20260927_000006_plaid_spend_governor.sql plaid_month_spend",
  "20260927_000006_plaid_spend_governor.sql report_ai_anomaly",
  "20260928_000007_lesson_upsert_rpc.sql record_agent_lesson",
  "20261010010000_agent_permissions_ledger.sql agent_settings_audit",
  "20261010030000_obligation_workflows.sql agent_workflow_stop_guard",
  "20261010040000_financial_evidence.sql agent_financial_disconnect_guard",
  "20261010060000_payment_execution.sql agent_workflow_store_plan",
  // CREATE OR REPLACE keeps a function's existing grants; these replace functions whose first file revoked them.
  "20261020050000_career_apply_daily_limit.sql career_apply_card_answer_for",
  "20261021070000_channel_parity.sql career_outbox_claim",
  "20261021070000_channel_parity.sql career_outbox_claim_key",
  "20261021075000_career_apply_ops.sql career_apply_card_push_for",
  "20261025100000_career_apply_one_ledger.sql career_apply_email_reserve_for",
  "20261025100000_career_apply_one_ledger.sql career_apply_cloud_refusal",
  "20261025100000_career_apply_one_ledger.sql career_apply_claim_own",
  "20261025110000_career_apply_bridge_reconcile.sql career_apply_claim_own",
  "20261025110000_career_apply_bridge_reconcile.sql career_apply_cloud_refusal",
  "20261025140000_career_apply_no_volume_ceiling.sql career_apply_daily_limit",
  "20261025140000_career_apply_no_volume_ceiling.sql career_apply_ledger_refusal",
  "20261025140000_career_apply_no_volume_ceiling.sql career_apply_cloud_refusal",
  "20261025140000_career_apply_no_volume_ceiling.sql career_apply_prepare_candidates",
  "20261025150000_career_apply_pace_parse.sql career_apply_daily_limit",
  "20261025160000_career_apply_pace_state.sql career_apply_daily_limit",
  "20261025160000_career_apply_pace_state.sql career_apply_ledger_refusal",
  "20261025160000_career_apply_pace_state.sql career_apply_cloud_refusal_own_pace",
  "20261025160000_career_apply_pace_state.sql career_apply_cloud_refusal",
  "20261025170000_career_apply_card_yes_window.sql career_apply_card_answer_for",
  "20261025180000_career_outbox_card_id.sql career_apply_card_push_for",
];

test("every migration that creates a SECURITY DEFINER function revokes it from public and anon in the same file", () => {
  const missing = scan(path.join(__dirname, "../supabase/migrations")).map((x) => `${x.file} ${x.fn}`);
  const fresh = missing.filter((m) => !GRANDFATHERED.includes(m));
  assert.deepEqual(fresh, [], `add "revoke all on function <name>(<args>) from public, anon[, authenticated];" to: ${fresh.join("; ")}`);
  const fixed = GRANDFATHERED.filter((g) => !missing.includes(g));
  assert.deepEqual(fixed, [], `these now revoke in their file; take them off GRANDFATHERED: ${fixed.join("; ")}`);
});

test("the scan reads the forms migrations use, and is not fooled by the near misses", () => {
  const cases = [
    // [sql, definers it must see, functions it must count as revoked from both]
    ["create or replace function public.f(p uuid) returns void language plpgsql security definer set search_path = public as $$ begin end $$;\n" +
      "revoke all on function public.f(uuid) from public, anon, authenticated;", ["f"], ["f"]],
    ["create function f() returns int language sql as $$ select 1 $$ security definer;", ["f"], []],
    ["create function \"G\"() returns int language sql security definer as 'select 1';\nrevoke execute on function g() from public;\nrevoke execute on function g() from anon;", ["g"], ["g"]],
    ["create function h() returns int security definer language sql as $$ select 1 $$;\nrevoke all on function h() from public;", ["h"], []],
    ["create function k(a int, b text) returns int security definer language sql as $$ select 1 $$;\nrevoke all on function public.j(int), public.k(int, text) from public, anon;", ["k"], ["j", "k"]],
    ["-- create function x() security definer\ncreate function y() returns int language sql security invoker as $$ select 1 $$;", [], []],
  ];
  for (const [sql, defs, rev] of cases) {
    const stripped = sql.replace(/--[^\n]*/g, " ");
    assert.deepEqual(definersIn(stripped).sort(), defs.sort(), sql);
    const r = revokedIn(stripped);
    assert.deepEqual([...r.keys()].filter((k) => r.get(k).has("public") && r.get(k).has("anon")).sort(), rev.sort(), sql);
  }
});

test("a new migration with a definer function and only 'revoke ... from public' fails the check", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "definer-scan-"));
  fs.writeFileSync(path.join(dir, "20991231000000_new.sql"),
    "create or replace function public.leaky(p text) returns text language plpgsql security definer set search_path = public as $$ begin return p; end $$;\n" +
    "revoke all on function public.leaky(text) from public;\ngrant execute on function public.leaky(text) to service_role;\n");
  assert.deepEqual(scan(dir).map((x) => [x.file, x.fn, x.has]), [["20991231000000_new.sql", "leaky", ["public"]]]);
  fs.rmSync(dir, { recursive: true, force: true });
});
