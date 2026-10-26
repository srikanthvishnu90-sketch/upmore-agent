// WO-037 acceptance tests (architect-authored): alert quality before launch. The alerts run never queues an alert below
// the person's own threshold (their keywords, place and relevance floor, and news rather than backlog); no week is a
// spam week (a rolling 7-day cap on top of the daily cap, quiet hours, once per posting, one report a day; a store that
// cannot count sends nothing); the labeled set is labeled by a person through a tiny CLI, and precision counts only the
// rows a person labeled; the hidden-market sheet scores only same-day checks of both sites and says NOT_RUN until then.
// Contract: docs/architect/work-orders/WO-037-discovery-at-scale.md
import { matchPosting, WEEKLY_DEFAULT, type AlertPrefs } from "../../supabase/functions/_shared/career_alerts.ts";
import { memoryAlertStore, validPrefs, type AlertRow } from "../../supabase/functions/_shared/career_alert_store.ts";
import { runAlerts } from "../../supabase/functions/_shared/career_proactive_run.ts";
import { relevanceFloor } from "../../supabase/functions/_shared/career_floor.ts";
import { buildRows, stratumOf, gate, prefsOf, score, wilson, type LabelFile, type Persona, type Row } from "../../evals/career/alert-labels/label_set.ts";
import { parseCsv, sample, score as hiddenScore, sheet } from "../../scripts/career/hidden-market.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const iso = (ms: number) => new Date(ms).toISOString();
const MON = Date.UTC(2026, 9, 19, 12); // Monday 08:00 in New York
const row = (id: string, prefs: AlertPrefs, at: number): AlertRow => ({ id, tz: "America/New_York", prefs, last_checked_at: iso(at), instant_sent_today: 0, sent_on: null, last_report_on: null, held: [] });
const TITLES = ["Data Analyst", "Senior Data Analyst", "Data Analyst (Contract)", "Data Analyst Intern", "Staff Data Analyst", "Analyst, Data", "Metadata Analyst",
  "Data Engineer", "Junior Data Analyst", "Data Analyst, Part-Time", "Lead Data Analyst", "Product Data Analyst", "Director of Data Analytics"];
const PLACES = ["New York, NY", "Remote - US", "Austin, TX", "London, UK", "Remote", "Brooklyn, NY", "Chicago, IL"];
const COMPANIES = ["Stripe", "Ramp", "Robert Half", "TEKsystems", "Acme", "Globex", "Initech"];
const DESCRIPTIONS = ["", "This is a 6-month contract.", "Pay: $45,000 - $60,000 a year.", "Pay: $130,000 - $160,000.", "We are hiring on behalf of our client.", "Full time, benefits."];

function postingsFor(r: () => number, n: number, from: number, spanMs: number) {
  return Array.from({ length: n }, (_, i) => {
    const seen = from + Math.floor(r() * spanMs);
    return { job_id: `greenhouse:t:${from}-${i}`, title: TITLES[Math.floor(r() * TITLES.length)], company: COMPANIES[Math.floor(r() * COMPANIES.length)],
      location: PLACES[Math.floor(r() * PLACES.length)], url: `https://job-boards.greenhouse.io/t/jobs/${from}-${i}`, description: DESCRIPTIONS[Math.floor(r() * DESCRIPTIONS.length)],
      first_seen_at: iso(seen), posted_at: r() < 0.15 ? iso(seen - 10 * 86400000) : iso(seen - 3600000), closed_at: null };
  });
}

// A week of alerts runs every 5 minutes for three people with different floors, over a steady stream of postings that
// mostly do not fit them. Returns everything the outbox received and every posting the run saw.
async function week(people: { id: string; prefs: AlertPrefs }[], seed = 37, perRun = 6) {
  const r = rng(seed), store = memoryAlertStore();
  for (const p of people) await store.save(row(p.id, p.prefs, MON));
  const all = new Map<string, any>();
  for (let t = MON + 5 * 60000; t < MON + 7 * 86400000; t += 5 * 60000) {
    for (const p of postingsFor(r, perRun, t - 5 * 60000, 5 * 60000)) all.set(p.job_id, p);
    await runAlerts({ store, outbox: store, now: t,
      recentPostings: async (since) => [...all.values()].filter((p) => p.first_seen_at > since),
      postingsById: async (ids) => ids.map((id) => all.get(id)).filter(Boolean) });
  }
  return { out: store.dump().outbox, all };
}
const prefs = (p: Partial<AlertPrefs>): AlertPrefs => {
  const v = validPrefs({ keywords: ["data analyst"], ...p } as Record<string, unknown>);
  if (!v.ok) throw new Error(v.error);
  return v.prefs;
};
const PEOPLE = [
  { id: "entry-nyc", prefs: prefs({ locations: ["new york", "brooklyn"], remote_ok: true, max_instant_per_day: 10, floor: { levels: ["entry"], types: ["full_time"], min_pay: { amount: 80000, period: "year" } } }) },
  { id: "no-staffing", prefs: prefs({ locations: [], remote_ok: true, max_instant_per_day: 10, floor: { exclude_companies: ["acme"], exclude_words: ["senior", "lead"] } }) },
  { id: "plain", prefs: prefs({ locations: ["austin"], remote_ok: false }) },
];

Deno.test("WO-037/A1 zero alerts below the person's threshold: every alert queued in a week passes their own gate", async () => {
  const { out, all } = await week(PEOPLE);
  const alerts = out.filter((o) => o.kind === "alert");
  assert(alerts.length > 20, `a week produces alerts (${alerts.length})`);
  const below: string[] = [];
  for (const a of alerts) {
    const p = all.get(a.key.slice("alert:".length)), who = PEOPLE.find((x) => x.id === a.userId)!;
    if (!matchPosting(p, who.prefs)) below.push(`${a.userId}: ${p.title} at ${p.company} (${p.location})`);
    if (who.prefs.floor && !relevanceFloor(p, who.prefs.floor).pass) below.push(`${a.userId}: floor ${relevanceFloor(p, who.prefs.floor).reasons}`);
    assert(Date.parse(p.posted_at) >= Date.parse(p.first_seen_at) - 3 * 86400000, "a backlog posting is never an alert");
    eq(a.first_seen_at, p.first_seen_at, "the alert carries its posting's first_seen_at, for the latency report");
  }
  eq(below, [], "alerts below the person's threshold");
  // And the floor is real here: postings that only the floor keeps out were in the stream.
  const floorOnly = [...all.values()].filter((p) => matchPosting(p, { ...PEOPLE[0].prefs, floor: undefined }) && !matchPosting(p, PEOPLE[0].prefs));
  assert(floorOnly.length > 50, "the week held many near misses the floor had to stop");
});

Deno.test("WO-037/A2 zero spam weeks: at most the weekly cap in any rolling 7 days, the daily cap each local day, none in quiet hours, each posting once, one report a day", async () => {
  const { out } = await week(PEOPLE, 11, 12);
  for (const p of PEOPLE) {
    const mine = out.filter((o) => o.userId === p.id), alerts = mine.filter((o) => o.kind === "alert").sort((a, b) => a.at - b.at);
    for (let i = 0; i < alerts.length; i++) {
      const inWeek = alerts.filter((a) => a.at > alerts[i].at - 7 * 86400000 && a.at <= alerts[i].at).length;
      assert(inWeek <= WEEKLY_DEFAULT, `${p.id}: ${inWeek} alerts in the 7 days to ${iso(alerts[i].at)} (cap ${WEEKLY_DEFAULT})`);
    }
    const byDay = new Map<string, number>();
    for (const a of alerts) { const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(a.at)); byDay.set(d, (byDay.get(d) ?? 0) + 1); }
    for (const [d, n] of byDay) assert(n <= p.prefs.max_instant_per_day, `${p.id}: ${n} alerts on ${d}`);
    for (const a of alerts) {
      const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(a.at)));
      assert(!(h >= 22 || h < 7), `${p.id}: an alert delivered at ${h}:00, inside quiet hours`);
    }
    eq(new Set(mine.map((o) => o.key)).size, mine.length, `${p.id}: a key twice`);
    assert(mine.filter((o) => o.kind === "report").length <= 7, `${p.id}: one report a day`);
  }
  const entry = out.filter((o) => o.userId === "entry-nyc" && o.kind === "alert").length;
  assert(entry === WEEKLY_DEFAULT || out.filter((o) => o.userId === "no-staffing" && o.kind === "alert").length === WEEKLY_DEFAULT, "the stream was heavy enough to reach the weekly cap");
});

Deno.test("WO-037/A3 the weekly cap is the person's own (0 to 25), and a store that cannot count this week's alerts sends none", async () => {
  eq(validPrefs({ keywords: ["x"], max_per_week: 5 }).ok, true);
  eq(validPrefs({ keywords: ["x"], max_per_week: 26 }).ok, false, "never more than 25 a week");
  eq(validPrefs({ keywords: ["x"], max_per_week: -1 }).ok, false);
  const five = [{ id: "five", prefs: prefs({ remote_ok: true, max_instant_per_day: 10, max_per_week: 5 }) }];
  const { out } = await week(five, 5, 12);
  eq(out.filter((o) => o.kind === "alert").length, 5, "five a week, as the person said");
  const store = memoryAlertStore();
  await store.save(row("u", prefs({ remote_ok: true, max_instant_per_day: 10 }), MON));
  const blind = { get: store.get, save: store.save, active: store.active }; // no alertsSince
  const stats = await runAlerts({ store: blind, outbox: store, now: MON + 600000, postingsById: async () => [],
    recentPostings: async () => [{ job_id: "greenhouse:t:1", title: "Data Analyst", company: "Stripe", location: "Remote", url: "https://job-boards.greenhouse.io/t/jobs/1", first_seen_at: iso(MON + 60000), closed_at: null }] });
  eq([stats.alerts, stats.held], [0, 1], "cannot count: held for the report, never sent");
});

// ------------------------------------------------------------------------------------------------ the labeled set
const ROOT = new URL("../../", import.meta.url);
const personas: Persona[] = JSON.parse(Deno.readTextFileSync(new URL("evals/career/alert-labels/personas.json", ROOT))).personas;
const candidates = JSON.parse(Deno.readTextFileSync(new URL("evals/career/alert-labels/candidates.json", ROOT)));
const rows: Row[] = candidates.rows_data;

Deno.test("WO-037/A4 the candidate set: 200 real postings, 8+ personas, near misses of every kind, the gate's answer stored is the gate's answer", () => {
  eq(rows.length, 200);
  assert(new Set(rows.map((r) => r.persona)).size >= 8, "at least 8 personas");
  eq(new Set(rows.map((r) => r.posting.job_id)).size, 200, "200 different postings");
  for (const s of ["gate_pass", "near_miss_floor", "near_miss_place", "near_miss_title", "near_miss_synonym"]) assert(rows.filter((r) => r.stratum === s).length >= 15, `stratum ${s}`);
  assert(rows.every((r) => /^(greenhouse|lever|ashby|smartrecruiters):/.test(r.posting.job_id) && /^https:\/\//.test(r.posting.url)), "real postings from the product's reader, with links");
  const byId = new Map(personas.map((p) => [p.id, prefsOf(p)]));
  for (const r of rows) eq(gate(r.posting, byId.get(r.persona)!), r.gate, `${r.id}: stored gate answer`);
  // Every stored stratum is the builder's own answer today (SERIAL-1530 re-read the set after the region rule: a remote
  // posting limited to a country is held for a persona with no stated location, a place near miss). The stored set was
  // collected under the earlier gate, so a rebuild from these 200 postings alone no longer fills every persona's 20
  // under the quotas; the per-row check is the invariant, a fresh collection (collect-pool.ts) the re-balance.
  const byPersona = new Map(personas.map((p) => [p.id, p]));
  for (const r of rows) eq(stratumOf(r.posting, byPersona.get(r.persona)!, byId.get(r.persona)!), r.stratum, `${r.id}: stored stratum`);
  assert(buildRows(rows.map((r) => r.posting), personas).every((b) => rows.some((r) => r.posting.job_id === b.posting.job_id)), "the build draws only from the pool");
});

Deno.test("WO-037/A5 precision counts only rows a person labeled; none labeled is NOT_RUN; assumed labels are never human", () => {
  const empty: LabelFile = { kind: "human", note: "", labels: {} };
  const s0 = score(rows, empty, personas);
  eq([s0.status, s0.labeled, s0.precision], ["NOT_RUN", 0, null]);
  const human = JSON.parse(Deno.readTextFileSync(new URL("evals/career/alert-labels/labels.human.json", ROOT)));
  eq(human.kind, "human");
  const assumed = JSON.parse(Deno.readTextFileSync(new URL("evals/career/alert-labels/labels.assumed.json", ROOT)));
  eq(assumed.kind, "assumed");
  assert(/ASSUMED/.test(assumed.note) && assumed.rubric.length > 200, "the proposed labels say what they are and carry their rubric");
  assert(Object.values(human.labels).every((l: any) => !/architect|ASSUMED/i.test(l.by)), "no architect label in the human file");
  // Three labeled rows out of 200: precision is over those three only.
  const gp = rows.filter((r) => r.gate).slice(0, 2), miss = rows.find((r) => !r.gate)!;
  const three: LabelFile = { kind: "human", note: "", labels: { [gp[0].id]: { label: "match", by: "t", at: "x" }, [gp[1].id]: { label: "no_match", by: "t", at: "x" }, [miss.id]: { label: "match", by: "t", at: "x" } } };
  const s = score(rows, three, personas);
  eq([s.status, s.labeled, s.skipped_unlabeled, s.tp, s.fp, s.fn, s.tn, s.precision, s.recall], ["MEASURED", 3, 197, 1, 1, 1, 0, 0.5, 0.5]);
  const w = wilson(9, 10)!;
  assert(w[0] > 0.59 && w[0] < 0.6 && w[1] > 0.98, `Wilson 9/10: ${w}`);
});

Deno.test("WO-037/A6 the labeling CLI round trip: answers typed in are saved per row, resumable, and read back by the eval", async () => {
  const tmp = await Deno.makeTempDir();
  const labels = `${tmp}/labels.json`;
  const cli = new URL("scripts/career/label-alerts.ts", ROOT).pathname;
  const run = async (input: string, extra: string[] = []) => {
    const p = new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-check", cli, "--by", "Vishnu", "--labels", labels, ...extra], stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
    const w = p.stdin.getWriter(); await w.write(new TextEncoder().encode(input)); await w.close();
    const o = await p.output();
    return { code: o.code, out: new TextDecoder().decode(o.stdout), err: new TextDecoder().decode(o.stderr) };
  };
  const first = await run("m\nn\nx\ns\nm\nq\n", ["--persona", "P03"]);
  eq(first.code, 0, first.err);
  assert(!/gate_pass|near_miss|stratum|gate:/.test(first.out), "the labeler never sees the gate's answer or why the row was picked");
  assert(/PERSON .*product manager/.test(first.out) && /POSTING /.test(first.out), "it shows the person and the posting");
  let f = JSON.parse(await Deno.readTextFile(labels));
  eq(Object.entries(f.labels).map(([k, v]: any) => [k, v.label, v.by]), [["P03-01", "match", "Vishnu"], ["P03-02", "no_match", "Vishnu"], ["P03-04", "match", "Vishnu"]],
    "m, n, an invalid key asked again, s skips P03-03, m, q");
  const second = await run("n\nb\nb\nm\nq\n", ["--persona", "P03"]);
  eq(second.code, 0, second.err);
  f = JSON.parse(await Deno.readTextFile(labels));
  eq(f.labels["P03-03"]?.label, "no_match", "a second session resumes at the first unlabeled row (the skipped P03-03)");
  eq(f.labels["P03-02"]?.label, "match", "b goes back (twice, to P03-02, labeled no_match before); a row can be labeled again");
  eq(f.labels["P03-03"].by, "Vishnu");
  const st = await run("", ["--status"]);
  assert(/4 of 200 labeled/.test(st.out), st.out);
  const noName = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-check", cli, "--labels", labels], stdout: "piped", stderr: "piped" }).output();
  eq(noName.code, 2, "a label needs a name");
  const s = score(rows, f, personas);
  eq([s.labeled, s.status], [4, "MEASURED"], "the eval reads what the CLI wrote");
});

Deno.test("WO-037/A7 the hidden-market sheet: a reproducible draw of distinct postings, scored only on same-day checks of both sites", () => {
  const alerts = Array.from({ length: 120 }, (_, i) => ({ alert_id: i, delivered_at: `2026-10-21T${String(10 + (i % 8)).padStart(2, "0")}:00:00Z`, job_id: `greenhouse:x:${i % 90}`,
    title: `Role ${i % 90}, "quoted"`, company: "Acme, Inc", location: "Remote", url: `https://job-boards.greenhouse.io/x/jobs/${i % 90}` }));
  const s1 = sample(alerts, "2026-10-21"), s2 = sample([...alerts].reverse(), "2026-10-21");
  eq(s1.length, 50);
  eq(new Set(s1.map((a) => a.job_id)).size, 50, "a posting sent to many people is checked once");
  eq(s1.map((a) => a.job_id), s2.map((a) => a.job_id), "the same draw from the same day");
  const csv = sheet(s1);
  const parsed = parseCsv(csv);
  eq(parsed.length, 50);
  eq(parsed[0].company, "Acme, Inc", "commas and quotes survive the sheet");
  eq(hiddenScore(parsed).status, "NOT_RUN", "an unfilled sheet is NOT_RUN");
  const filled = parsed.map((r, i) => ({ ...r, on_linkedin_same_day: i < 40 ? "yes" : "no", on_indeed_same_day: i < 35 ? "yes" : i < 45 ? "no" : "no",
    checked_at: i === 49 ? "2026-10-23T10:00:00Z" : r.delivered_at.replace(/T(\d\d)/, (_m, h) => `T${String(Number(h) + 2).padStart(2, "0")}`), checked_by: "Muse" }));
  filled[48].on_indeed_same_day = "unsure";
  const sc = hiddenScore(filled);
  eq([sc.checked, sc.hidden, sc.excluded_late, sc.excluded_unsure], [48, 8, 1, 1], "a check two days later and an unsure row are left out");
  eq(sc.status, "PARTIAL", "fewer than 50 counted");
  eq(sc.hidden_share, 8 / 48);
  eq(sc.target_20pct, "not met");
});
