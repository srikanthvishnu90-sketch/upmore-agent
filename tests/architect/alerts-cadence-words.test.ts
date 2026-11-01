// JOB ALERTS AS A REAL OUTCOME, review of PR #365. Pure: no database. Each case fails under the mutation named beside it.
//   zone       a zone word is a zone only right after a time ("at 6am PT") or when it can only be a zone ("eastern time",
//              "PST"): "central London" is not Chicago, "PT roles" is part-time (mutation: the old any-word zone match)
//   hour       an hour only in a time's form (am/pm, :mm, o'clock, "at N" + a time-of-day word or a zone): "at 3
//              companies" is not 3 o'clock (mutation: the old "at N" match)
//   scope      "less like 2" reads the person's OWN last message: A's never reads B's, and never changes B's rules
//              (mutation: the user_id filter dropped from lastSent)
//   any turn   a cadence is changed only on the turn that set the watch or one about their alerts: "I go to the gym every
//              evening" changes nothing (mutation: the cadence read on every turn)
//   deno test -A --no-check tests/architect/alerts-cadence-words.test.ts
import { cadenceFrom, syncWatchAlerts, WATCH_PROFILE_KEY } from "../../supabase/functions/_shared/career_watch_alerts.ts";
import { alertFeedbackTurn, supabaseFeedbackReads } from "../../supabase/functions/_shared/career_alert_feedback.ts";
import { memoryAlertStore, startWatching, validPrefs } from "../../supabase/functions/_shared/career_alert_store.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const eq = (a: unknown, b: unknown, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
const CHI = "America/Chicago", LA = "America/Los_Angeles", NY = "America/New_York";

Deno.test("zone: only right after a time, or a word that can only be a zone", () => {
  eq(cadenceFrom("send me analyst roles in central London every morning"), { digest: true, report_hour: 8 }, "central London is a place");
  eq(cadenceFrom("PT roles in Austin every morning please"), { digest: true, report_hour: 8 }, "PT before roles is part-time");
  eq(cadenceFrom("send me part time PT jobs every morning at 9am"), { digest: true, report_hour: 9 }, "PT not after the time");
  eq(cadenceFrom("Pacific Northwest roles every morning"), { digest: true, report_hour: 8 }, "a region, not a zone");
  eq(cadenceFrom("every morning at 6am PT"), { digest: true, report_hour: 6, tz: LA }, "PT right after a time");
  eq(cadenceFrom("data analyst roles in Chicago every morning at 6am central"), { digest: true, report_hour: 6, tz: CHI }, "central after a time");
  eq(cadenceFrom("every morning at 6 central"), { digest: true, report_hour: 6, tz: CHI }, "at N + zone");
  eq(cadenceFrom("every evening at 7:30 et"), { digest: true, report_hour: 19, tz: NY }, ":mm + zone");
  eq(cadenceFrom("every morning, eastern time"), { digest: true, report_hour: 8, tz: NY }, "eastern time");
  eq(cadenceFrom("every morning on Chicago time"), { digest: true, report_hour: 8, tz: CHI }, "Chicago time");
  eq(cadenceFrom("every morning, I'm on PST"), { digest: true, report_hour: 8, tz: LA }, "PST can only be a zone");
});

Deno.test("hour: only a time's own form; a bare number is never an hour", () => {
  eq(cadenceFrom("every morning send me jobs at 3 companies"), { digest: true, report_hour: 8 }, "at 3 companies");
  eq(cadenceFrom("every evening send me roles at 2 startups in Denver"), { digest: true, report_hour: 18 }, "at 2 startups");
  eq(cadenceFrom("send me pm jobs every evening at 7"), { digest: true, report_hour: 18 }, "at 7 alone is not a time form");
  eq(cadenceFrom("send me pm jobs every evening at 7pm"), { digest: true, report_hour: 19 }, "7pm");
  eq(cadenceFrom("send me jobs every day at 7 in the evening"), { digest: true, report_hour: 19 }, "at 7 in the evening");
  eq(cadenceFrom("send me jobs every evening at 6 in the morning"), { digest: true, report_hour: 6 }, "the time's own part of day");
  eq(cadenceFrom("every morning at 9 o'clock"), { digest: true, report_hour: 9 }, "o'clock");
  eq(cadenceFrom("every morning at 6:00"), { digest: true, report_hour: 6 }, ":mm");
  eq(cadenceFrom("every day at 5 a.m."), { digest: true, report_hour: 5 }, "a.m.");
});

// A service client over in-memory tables, filtering as PostgREST does (eq, in, not is null, order, limit).
function fakeAdmin(tables: Record<string, any[]>) {
  return {
    from(t: string) {
      let rows = [...(tables[t] ?? [])];
      const orders: [string, boolean][] = [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        not: (c: string, op: string, v: unknown) => { if (op === "is" && v === null) rows = rows.filter((r) => r[c] != null); return q; },
        order: (c: string, o?: { ascending?: boolean }) => { orders.push([c, o?.ascending !== false]); return q; },
        limit: (n: number) => { q._n = n; return q; },
        then: (res: any, rej: any) => {
          const out = [...rows].sort((a, b) => { for (const [c, asc] of orders) { if (a[c] !== b[c]) return (a[c] < b[c] ? -1 : 1) * (asc ? 1 : -1); } return 0; });
          return Promise.resolve({ data: out.slice(0, q._n ?? out.length), error: null }).then(res, rej);
        },
      };
      return q;
    },
  };
}

Deno.test("scope: A's \"less like 2\" reads A's own last message and never changes B's rules", async () => {
  const A = "00000000-0000-4000-8000-00000000000a", B = "00000000-0000-4000-8000-00000000000b", now = Date.parse("2026-11-01T14:00:00Z");
  const v = validPrefs({ keywords: ["frontend"] });
  assert(v.ok, "prefs");
  const store = memoryAlertStore();
  for (const u of [A, B]) await store.save(startWatching(null, { userId: u, prefs: v.prefs, tz: NY, now }));
  const post = (id: string, company: string, title: string) => ({ job_id: id, company, title, location: "Chicago, IL", url: `https://boards.greenhouse.io/x/jobs/${id}` });
  const P = [post("a1", "Acme", "Frontend Intern"), post("a2", "Brite", "Frontend Intern - Angular"), post("b1", "Globex", "Frontend Intern"), post("b2", "Hooli", "Frontend Intern - Vue")];
  const msg = (ps: any[]) => ps.map((p, i) => `${i + 1}. ${p.title} at ${p.company}\n   ${p.url}`).join("\n");
  const admin = fakeAdmin({
    career_postings: P,
    career_outbox: [
      { id: 1, user_id: A, key: "report:2026-11-01", kind: "report", text: msg([P[0], P[1]]), delivered_at: "2026-11-01T13:04:00Z" },
      // B's message is the newest anyone was sent.
      { id: 2, user_id: B, key: "report:2026-11-01", kind: "report", text: msg([P[2], P[3]]), delivered_at: "2026-11-01T13:09:00Z" },
    ],
  });
  const deps = { store, ...supabaseFeedbackReads(admin) };
  const bBefore = JSON.stringify((await store.get(B))?.prefs);
  const r = await alertFeedbackTurn({ message: "less like 2", userId: A, deps });
  assert(r && r.status === "saved", JSON.stringify(r));
  assert(/Brite/.test(r.reply) && !/Hooli|Globex/.test(r.reply), `A's own message: ${r.reply}`);
  eq((await store.get(A))?.prefs.feedback?.less?.map((s) => s.company), ["Brite"], "A's rule is from A's posting 2");
  eq(JSON.stringify((await store.get(B))?.prefs), bBefore, "B's rules are untouched");
  const rb = await alertFeedbackTurn({ message: "more like 1", userId: B, deps });
  assert(rb && /Globex/.test(rb.reply), `B's own message: ${rb?.reply}`);
  eq((await store.get(A))?.prefs.feedback?.more ?? [], [], "and B's never changes A's");
});

Deno.test("any turn: the cadence changes only on the watch's own turn or a turn about their alerts", async () => {
  const U = "00000000-0000-4000-8000-0000000000c1", now = Date.parse("2026-11-01T14:00:00Z");
  const W = { [WATCH_PROFILE_KEY(U)]: { type: "career_watch_profile", interests: [{ role: { terms: ["frontend"], blockers: [] }, filters: { places: ["Chicago"] } }] } };
  const store = memoryAlertStore();
  eq((await syncWatchAlerts({ userId: U, before: null, after: W, store, now, message: "send me new frontend roles in Chicago every morning" })).action, "saved", "the watch's turn");
  eq([(await store.get(U))?.prefs.digest, (await store.get(U))?.prefs.report_hour], [true, 8], "every morning");
  for (const said of ["I go to the gym every evening", "I study every day at 7pm"]) {
    eq((await syncWatchAlerts({ userId: U, before: W, after: W, store, now, message: said })).action, "unchanged", said);
    eq((await store.get(U))?.prefs.report_hour, 8, `${said}: not about their alerts`);
  }
  eq((await syncWatchAlerts({ userId: U, before: W, after: W, store, now, message: "send them every evening instead" })).action, "saved", "about their alerts");
  eq((await store.get(U))?.prefs.report_hour, 18, "every evening");
});
