// SERIAL-1420 (a) / SERIAL-1430: a pace the person set is read the same way everywhere, in three states. One rule, in
// career_apply.ts (paceState / parsePace) and in SQL (career_apply_pace_state, 20261025160000): a missing or null value is
// no preference ("none"); a whole number from 1 to 2147483647 (int4, what the columns hold) is the pace ("set"), never
// floored, saturated or otherwise changed; anything else present (text, hex, a thousands separator, 0, negative, a
// fraction, an exponent, a number past int4) is "unreadable": not a pace and not permission for no limit. The cloud
// module's ownPace is the same function.
import assertNode from "node:assert/strict";
import { dailyLimit, INT4_MAX, paceState, parsePace } from "../../supabase/functions/_shared/career_apply.ts";
import { ownPace } from "../../supabase/functions/_shared/career_cloud_optin.ts";

type Want = ["none" | "set" | "unreadable", number | null];
const CASES: [unknown, Want][] = [
  [undefined, ["none", null]], [null, ["none", null]],
  ["", ["unreadable", null]], [" ", ["unreadable", null]], [0, ["unreadable", null]], ["0", ["unreadable", null]], [-3, ["unreadable", null]], ["-3", ["unreadable", null]],
  ["lots", ["unreadable", null]], ["0x10", ["unreadable", null]], [NaN, ["unreadable", null]], ["NaN", ["unreadable", null]], [Infinity, ["unreadable", null]], ["Infinity", ["unreadable", null]],
  [true, ["unreadable", null]], [{}, ["unreadable", null]], [[], ["unreadable", null]], ["1,000", ["unreadable", null]],
  [7.9, ["unreadable", null]], ["7.9", ["unreadable", null]], ["7.", ["unreadable", null]], [".5", ["unreadable", null]], [0.9, ["unreadable", null]], ["1e3", ["unreadable", null]],
  [7, ["set", 7]], ["7", ["set", 7]], [" 7 ", ["set", 7]], ["+7", ["set", 7]], [100, ["set", 100]], [1e6, ["set", 1_000_000]], ["1000000", ["set", 1_000_000]],
  [2147483647, ["set", 2147483647]], ["2147483647", ["set", 2147483647]],
  [2147483648, ["unreadable", null]], ["2147483648", ["unreadable", null]], [1e12, ["unreadable", null]], ["99999999999", ["unreadable", null]], [Number.MAX_SAFE_INTEGER, ["unreadable", null]],
];

Deno.test("SERIAL-1430 paceState: none, set, or unreadable; parsePace and dailyLimit follow it", () => {
  assertNode.equal(INT4_MAX, 2147483647);
  for (const [v, [state, pace]] of CASES) {
    const label = `(${JSON.stringify(v) ?? String(v)})`;
    assertNode.deepEqual([paceState(v).state, paceState(v).pace], [state, pace], `paceState${label}`);
    assertNode.equal(parsePace(v), pace, `parsePace${label}`);
    assertNode.equal(ownPace(v), pace, `ownPace${label}`);
    // dailyLimit: a number only when set; Infinity when none; an unreadable pace is not a limit either way, so NaN.
    const dl = dailyLimit({ daily: v as any });
    if (state === "set") assertNode.equal(dl, pace, `dailyLimit${label}`);
    else if (state === "none") assertNode.equal(dl, Infinity, `dailyLimit${label}`);
    else assertNode.ok(Number.isNaN(dl), `dailyLimit${label} is NaN (unknown), got ${dl}`);
  }
});

Deno.test("SERIAL-1430 the SQL rule is the same text: the pattern in 20261025160000 and the int4 bound accept and reject exactly what paceState does", async () => {
  const sql = await Deno.readTextFile(new URL("../../supabase/migrations/20261025160000_career_apply_pace_state.sql", import.meta.url));
  const m = sql.match(/PACE_RE[^:=']*:=\s*'([^']+)'/);
  assertNode.ok(m, "the migration states its pattern");
  assertNode.ok(sql.includes("2147483647"), "the migration states the int4 bound");
  const re = new RegExp(m![1]);
  for (const [v, [state, pace]] of CASES) {
    if (typeof v !== "string") continue;
    const sqlState = !re.test(v) ? "unreadable" : Number(v.trim()) < 1 || Number(v.trim()) > 2147483647 ? "unreadable" : "set";
    assertNode.deepEqual([sqlState, sqlState === "set" ? Number(v.trim()) : null], [state, pace], `SQL on ${JSON.stringify(v)}`);
  }
});
