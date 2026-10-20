// WO-060 (architect): no two migrations share a version. Supabase tracks an applied migration by its version, the digits
// before the first "_" of the file name (the CLI's own rule), so a second file with an applied version is silently skipped
// by `supabase db push`. The deployed line's three channel migrations are live history and keep their names; trunk's
// three that collided with them moved to the next free version, content unchanged (git mv only).
//
// The early files are named YYYYMMDD_NNNNNN_*.sql; under the CLI's rule their version is the date alone, so six dates
// already hold several files. Those groups are frozen exactly as they are: no file may join one, and none may leave.
const DIR = new URL("../../supabase/migrations/", import.meta.url);

function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const files: string[] = [];
for await (const e of Deno.readDir(DIR)) if (e.isFile && e.name.endsWith(".sql")) files.push(e.name);
files.sort();
const versionOf = (f: string) => /^([0-9]+)_/.exec(f)?.[1] ?? null;

const HISTORICAL: Record<string, string[]> = {
  "20260923": ["20260923_000001_agent_rate_limits.sql", "20260923_000002_profile_prefs.sql", "20260923_000003_route_platform_urls.sql",
    "20260923_000004_save_side.sql", "20260923_000005_save_claims_deadline_nullable.sql", "20260923_000006_rate_limiter_hardening.sql",
    "20260923_000007_web_agent_jobs.sql", "20260923_000008_live_opportunities.sql"],
  "20260924": ["20260924_000001_live_opp_review_gate.sql", "20260924_000002_finance.sql", "20260924_000003_save_subscriptions_spike_fields.sql"],
  "20260926": ["20260926_000001_agent_exec.sql", "20260926_000002_agent_exec_otp.sql"],
  "20260927": ["20260927_000001_referral_program.sql", "20260927_000002_simplefin_vault.sql", "20260927_000003_agent_usage.sql",
    "20260927_000004_simplefin_disconnect.sql", "20260927_000005_referral_pending_credit.sql", "20260927_000006_plaid_spend_governor.sql",
    "20260927_000007_consent_and_tos.sql"],
  "20260928": ["20260928_000001_chat_reminders.sql", "20260928_000002_exec_runs_revoked.sql", "20260928_000003_reminders_rename.sql",
    "20260928_000004_exec_trust.sql", "20260928_000005_plaid_sync.sql", "20260928_000006_agent_lessons.sql", "20260928_000007_lesson_upsert_rpc.sql",
    "20260928_000008_save_subscriptions_annual_price.sql", "20260928_000009_purge_user_action_ledger.sql", "20260928_000010_exec_vault_read.sql",
    "20260928_000011_oauth_connections.sql"],
  "20261008": ["20261008_000001_imessage_threads.sql", "20261008_000002_agent_rl_bump_as.sql", "20261008_000003_imessage_outbox.sql",
    "20261008_000004_copy_trade_auto_invest.sql", "20261008_000005_ipo_offerings.sql"],
};

Deno.test("WO-060/1 every migration file has a version: the digits before its first underscore", () => {
  eq(files.filter((f) => versionOf(f) === null), [], "files without a version");
  if (files.length < 100) throw new Error(`only ${files.length} migration files read from ${DIR.pathname}`);
});

Deno.test("WO-060/2 no two migrations share a version, outside the frozen historical date groups", () => {
  const byVersion = new Map<string, string[]>();
  for (const f of files) byVersion.set(versionOf(f)!, [...(byVersion.get(versionOf(f)!) ?? []), f]);
  const shared = [...byVersion].filter(([, fs]) => fs.length > 1);
  eq(shared.filter(([v]) => !(v in HISTORICAL)), [], "a version held by more than one file");
  for (const [v, want] of Object.entries(HISTORICAL)) eq(byVersion.get(v) ?? [], want, `the historical ${v} group changed`);
});

Deno.test("WO-060/3 the live channel migrations keep their versions; trunk's three moved after them, in dependency order", () => {
  for (const f of ["20261019000000_channel_threads.sql", "20261019010000_channel_pending_approvals.sql", "20261020000000_channel_artifacts.sql",
    "20261019000001_career_postings.sql", "20261019010001_career_alerts.sql", "20261020000001_career_apply_jobs.sql"]) {
    if (!files.includes(f)) throw new Error(`${f} is missing`);
  }
  // Each trunk table is created before the first later migration that names it.
  const creates: Record<string, string> = { career_postings: "20261019000001_career_postings.sql", career_outbox: "20261019010001_career_alerts.sql",
    career_alert_prefs: "20261019010001_career_alerts.sql", career_proactive_runs: "20261019010001_career_alerts.sql", career_apply_jobs: "20261020000001_career_apply_jobs.sql" };
  for (const f of files.filter((x) => x >= "20261019")) {
    const sql = Deno.readTextFileSync(new URL(f, DIR));
    for (const [table, creator] of Object.entries(creates)) {
      if (f !== creator && new RegExp(`\\bpublic\\.${table}\\b`).test(sql) && f < creator) throw new Error(`${f} names ${table} before ${creator} creates it`);
    }
  }
});
