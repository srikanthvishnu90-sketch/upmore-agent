// SERIAL-1420 (a): a pace the person set is read the same way everywhere. One rule, in career_apply.ts (parsePace) and in
// SQL (career_apply_daily_limit, 20261025150000): a decimal number of 1 or more is the pace, floored, and kept up to
// 999,999,999 (an explicit number never silently becomes "no limit"); anything else (unset, 0, negative, text, hex,
// Infinity, NaN) is no pace. The cloud module's ownPace is the same function.
import assertNode from "node:assert/strict";
import { dailyLimit, parsePace } from "../../supabase/functions/_shared/career_apply.ts";
import { ownPace } from "../../supabase/functions/_shared/career_cloud_optin.ts";

const CASES: [unknown, number | null][] = [
  [undefined, null], [null, null], ["", null], [" ", null], [0, null], ["0", null], [-3, null], ["-3", null], ["lots", null], ["0x10", null],
  [NaN, null], [Infinity, null], ["Infinity", null], [true, null], [{}, null], [[], null], ["1,000", null],
  [7, 7], ["7", 7], [" 7 ", 7], ["+7", 7], [7.9, 7], ["7.9", 7], ["7.", 7], [".5", null], [0.9, null],
  [100, 100], ["1e3", 1000], [1e6, 1_000_000], ["1000000", 1_000_000], [999_999_999, 999_999_999],
  [1_000_000_000, 999_999_999], ["1e12", 999_999_999], [Number.MAX_SAFE_INTEGER, 999_999_999],
];

Deno.test("SERIAL-1420/a parsePace: every explicit number of 1 or more is a pace, floored and bounded; nothing else is", () => {
  for (const [v, want] of CASES) {
    assertNode.equal(parsePace(v), want, `parsePace(${JSON.stringify(v) ?? String(v)})`);
    assertNode.equal(ownPace(v), want, `ownPace(${JSON.stringify(v) ?? String(v)})`);
    assertNode.equal(dailyLimit({ daily: v as any }), want ?? Infinity, `dailyLimit(${JSON.stringify(v) ?? String(v)})`);
  }
});

Deno.test("SERIAL-1420/a the SQL rule is the same text: the regex in 20261025150000 accepts and rejects exactly what parsePace does", async () => {
  const sql = await Deno.readTextFile(new URL("../../supabase/migrations/20261025150000_career_apply_pace_parse.sql", import.meta.url));
  const m = sql.match(/PACE_RE[^:=']*:=\s*'([^']+)'/) ?? sql.match(/~\s*'(\^[^']+\$)'/);
  assertNode.ok(m, "the migration states its pattern");
  const re = new RegExp(m![1]);
  for (const [v, want] of CASES) {
    if (typeof v !== "string") continue;
    const sqlReads = re.test(v) ? Math.min(Math.floor(Number(v)), 999_999_999) : null;
    const sqlPace = sqlReads !== null && sqlReads >= 1 ? sqlReads : null;
    assertNode.equal(sqlPace, want, `SQL pattern on ${JSON.stringify(v)}`);
  }
});
