// WO-041 acceptance tests: the chat answer is honest about stale sources. A firm-guide deadline already past when the
// answer is given is said to have passed, with "the next cycle's date is not published yet", and no next date is ever
// guessed; "apply inside its window" is never a move for a closed program; an interview pattern whose page the last
// source check found gone is never quoted, and one no check has opened is labeled unverified.
// Contract in docs/architect/work-orders/WO-041-source-freshness.md. The checker itself: tests/career-source-check.test.cjs.
// Run: deno test -A --no-check tests/architect/wo-041-source-freshness.test.ts
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { pastLine, pathAnswer } from "../../supabase/functions/_shared/career_path.ts";
import { start } from "../../supabase/functions/_shared/career_mock.ts";
import { interviewerInstructions } from "../../supabase/functions/_shared/career_voice.ts";
import { CareerPaths } from "../../supabase/functions/_shared/router_core.career.js";
import { HYGIENE } from "../../evals/career/compare.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const root = new URL("../../", import.meta.url);
const P = CareerPaths as any;
const GUIDE = P.firmGuide();
const at = (iso: string) => Date.parse(`${iso}T15:00:00Z`);
const NOW = at("2026-10-20");
const CLOCKS = ["2025-01-15", "2026-03-01", "2026-09-01", "2026-10-05", "2026-10-20", "2027-06-30"].map(at);
const NONE = { ran: false, run_at: null, urls: {} };
const checks = (urls: Record<string, string>, http: Record<string, number> = {}) => ({
  ran: true, run_at: "2026-10-26T06:17:00.000Z",
  urls: Object.fromEntries(Object.entries(urls).map(([u, status]) => [u, { status, http_status: http[u] ?? (status === "gone" ? 404 : status === "blocked" ? 403 : 200), final_url: u, fetched_at: "2026-10-26T06:17:05.000Z" }])),
});
const firm = (id: string) => GUIDE.firms.find((f: any) => f.firm_id === id);
const PASSED = /The next cycle's date is not published yet in my sources; I won't guess it\./;
function plainText(messages: string[], where: string) {
  for (const m of messages) {
    assert(m.length <= 1500, `${where}: a message of ${m.length} characters`);
    for (const h of HYGIENE) if (h.id !== "too_long") assert(!h.test(m), `${where}: ${h.what}\n${m}`);
    for (const line of m.split("\n")) if (/https?:\/\//.test(line)) assert(/^https?:\/\/\S+$/.test(line.trim()), `${where}: a link not alone on its line: ${line}`);
  }
}
// Every calendar date the guide states or was checked on, as YYYY-MM-DD.
const KNOWN = new Set<string>([
  ...P.statedDates(JSON.stringify(GUIDE)).map((d: any) => d.date),
  ...(JSON.stringify(GUIDE).match(/\b20\d\d-\d\d-\d\d\b/g) || []),
]);
function datesIn(text: string): string[] {
  return [...P.statedDates(text).map((d: any) => d.date), ...(text.match(/\b20\d\d-\d\d-\d\d\b/g) || [])];
}

Deno.test("WO-041/R1 a deadline already past is said to have passed, and the next cycle's date is not published yet", () => {
  const ev = pathAnswer({ firm: "Evercore", facts: [], now: NOW, checks: NONE });
  const text = ev.messages.join("\n");
  assert(text.includes("As of 2026-10-20, the opening date 31 August 2026 and the deadline 11 October 2026 have passed. The next cycle's date is not published yet in my sources; I won't guess it."), text);
  eq(ev.programs[0].past_dates.map((d) => [d.date, d.kind]), [["2026-08-31", "opens"], ["2026-10-11", "deadline"]]);
  // The line follows its own program's line.
  const lines = ev.messages[0].split("\n");
  const i = lines.findIndex((l) => l.startsWith("Summer intern programs (Europe/Asia, 2027):"));
  assert(i >= 0 && PASSED.test(lines[i + 1]), lines.join("\n"));
  // Before the deadline: no "passed", and an opening date already behind an open window is not news.
  const open = pathAnswer({ firm: "Evercore", facts: [], now: at("2026-10-05"), checks: NONE });
  assert(!/passed/.test(open.messages.join("\n")), open.messages.join("\n"));
  eq(open.programs[0].past_dates, []);
  // The deadline day itself has not passed; the day after it has.
  assert(!/passed/.test(pathAnswer({ firm: "Evercore", facts: [], now: Date.parse("2026-10-11T23:59:00Z"), checks: NONE }).messages.join("\n")));
  assert(/the opening date 31 August 2026 and the deadline 11 October 2026 have passed/.test(pathAnswer({ firm: "Evercore", facts: [], now: Date.parse("2026-10-12T00:01:00Z"), checks: NONE }).messages.join("\n")));
  // McKinsey's two programs, Bain's ACI: each past date in its own words.
  const mck = pathAnswer({ firm: "McKinsey", facts: [], now: NOW, checks: NONE }).messages.join("\n");
  assert(mck.includes("As of 2026-10-20, the opening date July 1, 2026 and the deadline August 11, 2026 have passed."), mck);
  assert(mck.includes("As of 2026-10-20, the deadline March 29, 2026 has passed."), mck);
  const bain = pathAnswer({ firm: "Bain", facts: [], now: NOW, checks: NONE }).messages.join("\n");
  assert(bain.includes("the deadline August 31, 2026 has passed"), bain);
});

Deno.test("WO-041/R2 no next date is ever guessed: every date in any answer is one the guide states, or today", () => {
  let lines = 0;
  for (const now of CLOCKS) {
    const today = new Date(now).toISOString().slice(0, 10);
    for (const f of GUIDE.firms) for (const role of ["", "summer analyst", "software engineer"]) {
      const r = pathAnswer({ firm: f.name, role, facts: [], now, checks: NONE });
      const text = r.messages.join("\n");
      for (const d of datesIn(text)) assert(KNOWN.has(d) || d === today, `${f.name} at ${today}: ${d} is not a date on file\n${text}`);
      for (const l of text.split("\n").filter((x) => PASSED.test(x))) {
        lines++;
        // The line itself: today, then only dates stated in the timeline, and no year of its own.
        const p = r.programs.find((x) => x.past_dates.length && l.includes(x.past_dates[0].said))!;
        assert(p, `${f.name}: a passed line for no program: ${l}`);
        let rest = l.replace(`As of ${today}, `, "");
        for (const d of p.past_dates) rest = rest.replace(d.said, "");
        assert(!/\b20\d\d\b/.test(rest), `${f.name}: a year that is not a stated date: ${l}`);
        assert(!/\b(?:next|expected|likely|usually|typically|probably|around|early|late|mid)[- ](?:january|february|march|april|may|june|july|august|september|october|november|december|20\d\d)/i.test(l), `${f.name}: a guessed date: ${l}`);
      }
      plainText(r.messages, `${f.name} at ${today}`);
    }
  }
  assert(lines >= 20, `only ${lines} passed lines seen`);
  eq(pastLine([], NOW), null);
});

Deno.test("WO-041/R3 'apply inside its window' is never a move for a program whose deadline has passed", () => {
  let checked = 0;
  const profiles = [[], [{ id: "F-001", kind: "education", text: "BS Economics at Rutgers, graduating May 2027" }], [{ id: "F-010", kind: "education", text: "Junior at Georgia Tech, BS in Computer Science, class of 2028, GPA 3.6" }]];
  for (const now of CLOCKS) for (const f of GUIDE.firms) for (const role of ["", "summer analyst", "business analyst", "intern"]) for (const facts of profiles) {
    const r = pathAnswer({ firm: f.name, role, facts, now, checks: NONE });
    for (const m of r.moves) {
      const hit = m.action.match(/^Apply to (.+) inside its window\.$/);
      if (!hit) continue;
      checked++;
      const p = r.programs.find((x) => x.name === hit[1])!;
      assert(!p.past_dates.some((d) => d.kind === "deadline"), `${f.name} at ${new Date(now).toISOString().slice(0, 10)}: apply to ${p.name}, closed ${JSON.stringify(p.past_dates)}`);
    }
  }
  assert(checked > 20, `only ${checked} apply moves seen`);
  // McKinsey's programs are both closed on 2026-10-20: the move says so, cites the page and the gap, and guesses nothing.
  const econ = [{ id: "F-001", kind: "education", text: "BS Economics at Rutgers, graduating May 2027" }];
  const mck = pathAnswer({ firm: "McKinsey", facts: econ, now: NOW, checks: NONE });
  const move = mck.moves.find((m) => m.requirement.id === "mckinsey-timeline")!;
  assert(move, JSON.stringify(mck.moves));
  eq(move.action, "The Business Analyst (US, full time) deadline (August 11, 2026) has passed, and the next cycle's date is not published yet: watch its page and apply when it opens.");
  assert(move.gap && /^https:\/\//.test(move.requirement.source_url));
  // Before that deadline the same program is a window to apply in.
  const june = pathAnswer({ firm: "McKinsey", facts: econ, now: at("2026-06-01"), checks: NONE });
  eq(june.moves.find((m) => m.requirement.id === "mckinsey-timeline")?.action, "Apply to Business Analyst (US, full time) inside its window.");
});

Deno.test("WO-041/R4 the brain tool answers on the turn's clock", async () => {
  const tools = Object.fromEntries(careerTools({ postings: async () => [] }).map((t) => [t.name, t]));
  const ask = (now: number) => tools.career_path_answer.run({ firm: "Evercore" }, { userId: "u1", threadId: "t1", now, state: {}, turn: { message: "how do I get into evercore", added: [] as string[] } }) as Promise<any>;
  assert(PASSED.test((await ask(NOW)).messages.join("\n")), "after the deadline");
  assert(!PASSED.test((await ask(at("2026-09-01"))).messages.join("\n")), "before it");
});

Deno.test("WO-041/R5 a program page the last check found gone is said so", () => {
  const url = firm("evercore").programs[0].source_url;
  const r = pathAnswer({ firm: "Evercore", facts: [], now: NOW, checks: checks({ [url]: "gone" }) });
  assert(r.messages.join("\n").includes("That page answered 404 at the 2026-10-26 source check, so this program may no longer be listed there."), r.messages.join("\n"));
  eq(r.programs[0].source_status, "gone");
  const live = pathAnswer({ firm: "Evercore", facts: [], now: NOW, checks: checks({ [url]: "live" }) });
  assert(!/source check/.test(live.messages.join("\n")));
  eq(pathAnswer({ firm: "Evercore", facts: [], now: NOW, checks: NONE }).programs[0].source_status, "unverified");
});

const META = (() => { const d = JSON.parse(Deno.readTextFileSync(new URL("packages/career-data/interview-patterns.json", root))); return d.firms.find((f: any) => f.id === "meta"); })();
const [OFFICIAL, REPORTED] = META.patterns;
const companyQ = (s: any) => s.questions.find((q: any) => q.kind === "company")?.q ?? null;

Deno.test("WO-041/R6 a pattern whose page the last check found gone is never quoted, by text or by voice", () => {
  const gone1 = checks({ [OFFICIAL.source_url]: "gone", [REPORTED.source_url]: "live" });
  const m = start({ role: "software engineer", company: "Meta", now: NOW, checks: gone1 });
  const q = companyQ(m.state)!;
  assert(q && !q.includes(OFFICIAL.text.slice(0, 60)), `the gone page is quoted: ${q}`);
  assert(q.startsWith("What is on file about Meta's interviews (reported, tryexponent.com, 2026-10-19): \""), q);
  assert(!/Unverified/.test(q), "the page the check opened needs no label");
  const voice = interviewerInstructions(m.state, { checks: gone1 });
  assert(!voice.includes(OFFICIAL.text) && !voice.includes(OFFICIAL.source_url), voice);
  assert(voice.includes(REPORTED.text), voice);
  // Every page gone: nothing about Meta is quoted at all.
  const allGone = checks({ [OFFICIAL.source_url]: "gone", [REPORTED.source_url]: "gone" }, { [REPORTED.source_url]: 410 });
  const none = start({ role: "software engineer", company: "Meta", now: NOW, checks: allGone });
  eq(companyQ(none.state), null);
  eq(none.state.patterns, null);
  assert(none.reply.includes("No record for Meta on file, so nothing here is about how they interview."), none.reply);
  const v2 = interviewerInstructions({ ...m.state }, { checks: allGone });
  assert(!v2.includes(OFFICIAL.text) && !v2.includes(REPORTED.text), v2);
});

Deno.test("WO-041/R7 a pattern no check has opened, or that refused the check, is labeled unverified", () => {
  // As committed (no check has run): the official page is quoted, labeled.
  const m = start({ role: "software engineer", company: "Meta", now: NOW });
  const q = companyQ(m.state)!;
  assert(q.includes("Unverified: a search summary of that page; no source check has opened the page yet."), q);
  assert(m.reply.includes("(checked 2026-10-19). Unverified: a search summary of that page; no source check has opened the page yet."), m.reply);
  const voice = interviewerInstructions(m.state);
  for (const p of META.patterns) assert(voice.includes(`- patterns: "${p.text}" (${p.source_type}, ${p.source_url}) [unverified: page not opened by a source check; do not present it as the firm's words]`), voice);
  // Refused: said with the check's date and what happened.
  const blocked = start({ role: "software engineer", company: "Meta", now: NOW, checks: checks({ [OFFICIAL.source_url]: "blocked", [REPORTED.source_url]: "blocked" }) });
  assert(companyQ(blocked.state)!.includes("Unverified: the page could not be opened at the 2026-10-26 source check (blocked)."), companyQ(blocked.state)!);
  // Opened: no label, by text or voice.
  const live = checks({ [OFFICIAL.source_url]: "live", [REPORTED.source_url]: "redirected" });
  const ok = start({ role: "software engineer", company: "Meta", now: NOW, checks: live });
  assert(!/Unverified/i.test(companyQ(ok.state)! + ok.reply), companyQ(ok.state)!);
  assert(!/unverified/.test(interviewerInstructions(ok.state, { checks: live })));
  // Every one of the 17 firms that quote their own patterns carries the label while no check has run.
  const d = JSON.parse(Deno.readTextFileSync(new URL("packages/career-data/interview-patterns.json", root)));
  let labeled = 0;
  for (const f of d.firms.filter((x: any) => x.record === null)) {
    const s = start({ role: "software engineer", company: f.name.split(/\s+[—–-]\s+|\s*\(|,/)[0], now: NOW, checks: NONE });
    const cq = companyQ(s.state);
    assert(cq && /Unverified: /.test(cq), `${f.id}: ${cq}`);
    plainText([s.reply, cq], f.id);
    labeled++;
  }
  eq(labeled, 17);
});

Deno.test("WO-041/R8 the bundle carries the source checks (Deno has no packages/ directory at deploy)", async () => {
  const bundle = await Deno.readTextFile(new URL("supabase/functions/_shared/router_core.career.js", root));
  assert(/^const CAREER_SOURCE_CHECKS_JSON = __careerData\("/m.test(bundle), "compressed into the career bundle");
  const file = JSON.parse(await Deno.readTextFile(new URL("packages/career-data/source-checks.json", root)));
  eq(P.sourceChecks(), file, "134 sourceChecks reads the committed file from the bundle");
});
