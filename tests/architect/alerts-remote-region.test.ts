// SERIAL-1530 (F4): remote semantics grounded. Fail-first on fc14e1e6: posting_region.ts did not exist; a remote posting
// passed any watch whose remote preference was not "no" (152 locationOk, career_alerts fits), and no stated country or
// region restriction on a posting was read. The spec (upmore-spec2 3.1, 3.2): locations plus the remote preference and
// work authorization are hard filters; never infer work authorization silently, ask.
//   (1) a New York watch against a "Remote - US" posting for a person in Toronto: not matched; for a person in Chicago:
//       matched; with no location on record: held, with the reason naming what to say;
//   (2) a remote posting with a stated country list ("Remote (US, Canada)"): Toronto yes, London no;
//   (3) "include remote" said vs the default: both take remote in (the stored choice says which); "no remote" leaves it out;
//   plus a restriction phrased as authorization ("must be authorized to work in the United Kingdom") screened as a place,
//   never as a claim about the person's authorization; the bridge carrying the person's stated location on each watch;
//   and module 152's mirror pinned to the shared rule on the same matrix.
import assertNode from "node:assert/strict";
import { createRequire } from "node:module";
import { postingScope, regionDecision, regionsOf, REGION_TABLE, restrictionsOf } from "../../supabase/functions/_shared/posting_region.ts";
import { matchPosting } from "../../supabase/functions/_shared/career_alerts.ts";
import { interestsFromWatch } from "../../supabase/functions/_shared/career_watch_alerts.ts";

const require = createRequire(import.meta.url);
const A = require("../../packages/domain/152-career-assign.js");
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const posting = (location: string, extra: Record<string, unknown> = {}) => ({ job_id: `j:${location}`, company: "Acme", title: "Data Analyst", location, url: "https://boards.greenhouse.io/acme/jobs/1", closed_at: null, first_seen_at: "2026-10-26T15:00:00Z", description: "", ...extra });
const watch = (home: string | null, remote_ok = true, locations = ["New York"]) => ({ keywords: ["data analyst"], locations, remote_ok, ...(home ? { home } : {}) });
const prefs = (w: ReturnType<typeof watch>) => ({ on: true, keywords: w.keywords, locations: w.locations, remote_ok: w.remote_ok, report_hour: 8, quiet_start: 22, quiet_end: 7, max_instant_per_day: 3, interests: [w] } as any);

Deno.test("regions: a place text names what it names, never more", () => {
  eq(regionsOf("Chicago, IL"), ["us"]); eq(regionsOf("New York, NY"), ["us"]); eq(regionsOf("United States"), ["us"]);
  eq(regionsOf("Toronto, ON"), ["canada"]); eq(regionsOf("Canada"), ["canada"]); eq(regionsOf("London, UK"), ["uk"]); eq(regionsOf("Berlin, Germany"), ["germany"]);
  eq(regionsOf(""), []); eq(regionsOf("somewhere nice"), []);
  eq(postingScope(posting("Remote - US")), ["us"]); eq(postingScope(posting("Remote (US, Canada)")).sort(), ["canada", "us"]);
  eq(postingScope(posting("Spain (Remote)")), ["spain"]); eq(postingScope(posting("Remote")), []); eq(postingScope(posting("New York, NY")), []);
  eq(postingScope(posting("Remote", { description: "You must be authorized to work in the United Kingdom." })), ["uk"]);
  eq(postingScope(posting("Remote", { description: "Open to candidates in the EU only." })), ["eu"]);
  eq(restrictionsOf("US-based candidates preferred; Canada residents only"), ["us", "canada"].sort().reverse().sort());
});

Deno.test("(1) a New York watch against Remote - US: Toronto no, Chicago yes, no location on record held with the reason", () => {
  const p = posting("Remote - US");
  const toronto = regionDecision(p, watch("Toronto, ON"), () => ({ ok: false }));
  eq(toronto.ok, false); ok(!toronto.ok && /remote within the US only; your location is Canada/.test(toronto.why), JSON.stringify(toronto));
  eq(regionDecision(p, watch("Chicago, IL"), () => ({ ok: false })), { ok: true, via: "remote within the US" });
  const unknown = regionDecision(p, watch(null), () => ({ ok: false }));
  ok(!unknown.ok && /remote within the US only, and your location is not on record: tell me your city and country/.test(unknown.why), JSON.stringify(unknown));
  // The scheduled matcher, through its interests.
  eq(matchPosting(p, prefs(watch("Toronto, ON"))), false);
  eq(matchPosting(p, prefs(watch("Chicago, IL"))), true);
  eq(matchPosting(p, prefs(watch(null))), false, "held, never passed, with no location on record");
  // A plain remote posting with nothing stated is open anywhere, as before; an office posting in the watched place too.
  eq(matchPosting(posting("Remote"), prefs(watch("Toronto, ON"))), true);
  eq(matchPosting(posting("New York, NY"), prefs(watch("Toronto, ON"))), true);
  eq(matchPosting(posting("Boston, MA"), prefs(watch("Toronto, ON"))), false);
});

Deno.test("(2) a remote posting with a stated country list, and a restriction phrased as authorization screened as a place", () => {
  const both = posting("Remote (US, Canada)");
  eq(matchPosting(both, prefs(watch("Toronto, ON"))), true);
  eq(matchPosting(both, prefs(watch("London, UK"))), false);
  eq(matchPosting(both, prefs(watch("Chicago, IL"))), true);
  const uk = posting("Remote", { description: "This role is remote. You must be authorized to work in the United Kingdom." });
  eq(matchPosting(uk, prefs(watch("London, UK"))), true, "their stated location is in the UK; nothing is claimed about their authorization");
  eq(matchPosting(uk, prefs(watch("Chicago, IL"))), false);
  const d = regionDecision(uk, watch(null), () => ({ ok: false }));
  ok(!d.ok && /open to the UK only|remote within the UK only/.test(d.why) && /not on record/.test(d.why), JSON.stringify(d));
  const eu = posting("Berlin, Germany", { description: "Open to candidates in the EU." });
  eq(matchPosting(eu, prefs(watch("Paris, France", true, ["Berlin"]))), true, "an EU member's resident for an EU-only office posting");
  eq(matchPosting(eu, prefs(watch("Chicago, IL", true, ["Berlin"]))), false);
});

Deno.test("(3) the remote preference: default and stated both include remote; no remote leaves every remote posting out", () => {
  eq(matchPosting(posting("Remote - US"), prefs(watch("Chicago, IL", false))), false, "no remote: left out");
  eq(matchPosting(posting("Remote"), prefs(watch("Chicago, IL", false))), false);
  eq(matchPosting(posting("New York, NY"), prefs(watch("Chicago, IL", false))), true, "the watched place still matches");
  const d = regionDecision(posting("Remote"), watch("Chicago, IL", false), () => ({ ok: false }));
  ok(!d.ok && /remote postings are left out of this watch/.test(d.why));
});

Deno.test("the bridge carries the person's stated location on each watch, from the watch profile's scoring profile", () => {
  const wp = { type: "career_watch_profile", user_id: "u1", scoring_profile: { location: "Chicago, IL (TEST)" },
    interests: [{ interest_id: "int-data-analyst", role: { title: "Data Analyst", terms: ["data analyst"], blockers: [] }, filters: { locations: ["New York"], remote_ok: true, remote_choice: "default", bands: [], firms_include: [], firms_exclude: [] } }] };
  const [i] = interestsFromWatch(wp);
  eq(i.home, "Chicago, IL (TEST)");
  eq(matchPosting(posting("Remote - US"), { on: true, keywords: ["data analyst"], locations: ["New York"], remote_ok: true, report_hour: 8, quiet_start: 22, quiet_end: 7, max_instant_per_day: 3, interests: [i] } as any), true);
  const [j] = interestsFromWatch({ ...wp, scoring_profile: {} });
  eq(j.home, undefined, "no location on record: none carried, nothing invented");
});

Deno.test("module 152 mirrors the shared rule: the same table, the same decisions on the matrix", () => {
  eq(A.REGION_TABLE, REGION_TABLE, "one table in both");
  const matrix: [string, Record<string, unknown>, string | null, boolean][] = [
    ["Remote - US", {}, "Toronto, ON", false], ["Remote - US", {}, "Chicago, IL", true], ["Remote - US", {}, null, false],
    ["Remote (US, Canada)", {}, "Toronto, ON", true], ["Remote (US, Canada)", {}, "London, UK", false],
    ["Remote", {}, "Toronto, ON", true], ["Remote", {}, null, true],
    ["Remote", { jd_text: "You must be authorized to work in the United Kingdom." }, "London, UK", true],
    ["Remote", { jd_text: "You must be authorized to work in the United Kingdom." }, "Chicago, IL", false],
    ["New York, NY", {}, "Toronto, ON", true], ["New York, NY", { jd_text: "US-based only." }, "Toronto, ON", false], ["New York, NY", { jd_text: "US-based only." }, null, false],
  ];
  for (const [location, extra, home, want] of matrix) {
    const p = { ...posting(location), ...extra, description: (extra as any).jd_text ?? "" };
    const ours = regionDecision(p, watch(home, true, ["New York"]), () => ({ ok: /new york/i.test(location), via: "location New York" })).ok;
    const theirs = A.locationOk(p, { locations: ["New York"], remote_ok: true }, home).ok;
    eq([ours, theirs], [want, want], `${location} ${JSON.stringify(extra)} home=${home}`);
  }
  for (const h of ["Chicago, IL", "Toronto, ON", "London, UK", "Berlin, Germany", "United States", ""]) eq(A.regionsOf(h), regionsOf(h), `regionsOf(${h})`);
});

Deno.test("a restriction is about the candidate: an employer's own descriptor is not one (the labeled set's P02-01 and P06-01 were held on \"Chicago-based\" boilerplate)", () => {
  const none = [
    "We are a Chicago-based company serving residents of Texas and beyond.",
    "Acme is based in Chicago with offices in London.",
    "This is a US-based team of 40 engineers.",
    "For internal use only.",
  ];
  for (const t of none) eq(restrictionsOf(t), [], `not a restriction: ${t}`);
  for (const t of none) eq(A.restrictionsOf(t), [], `152 mirror: ${t}`);
  const some: [string, string[]][] = [
    ["You must be US-based.", ["us"]], ["US-based candidates only.", ["us"]], ["Candidates must be located in the United Kingdom.", ["uk"]],
    ["You must be authorized to work in Canada.", ["canada"]], ["Open to candidates in the EU.", ["eu"]], ["Germany residents only.", ["germany"]],
  ];
  for (const [t, want] of some) eq(restrictionsOf(t), want, t);
  for (const [t, want] of some) eq(A.restrictionsOf(t), want, `152 mirror: ${t}`);
  // An office posting whose location names its country is where it is, not a restriction: the watched place decides.
  const office = { ...posting("Webster, New York, United States"), description: "We are a Chicago-based company." };
  eq(postingScope(office), [], "no scope read from an office posting's own country or the employer's descriptor");
  eq(regionDecision(office, watch(null, true, ["New York"]), () => ({ ok: true, via: "location New York" })).ok, true, "a New York watch takes it with no location on record");
});
