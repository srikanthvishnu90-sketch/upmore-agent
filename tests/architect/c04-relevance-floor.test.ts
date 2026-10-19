// C-04 (architect): the relevance floor. A labeled set of postings, each with what the floor must say and why, the
// traps first. Card: docs/architect/cards/C-04-relevance-floor.md. Synthetic postings only.
import {
  applyFloor,
  type Floor,
  isStaffing,
  levelOf,
  relevanceFloor,
  statedPay,
  typeOf,
  validFloor,
} from "../../supabase/functions/_shared/career_floor.ts";
import { DEFAULT_PREFS, matchPosting } from "../../supabase/functions/_shared/career_alerts.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { STAFFING_AGENCIES as agencies } from "../../supabase/functions/_shared/career_staffing_agencies.ts";

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const P = (title: string, more: Record<string, unknown> = {}) => ({
  job_id: "greenhouse:test:" + title.replace(/\W+/g, "-"),
  company: "TEST Employer",
  title,
  location: "Remote",
  url: "https://job-boards.greenhouse.io/test/jobs/1",
  description: "",
  first_seen_at: "2026-10-18T00:00:00Z",
  ...more,
});
const ENTRY: Floor = { levels: ["intern", "entry"] };
const SENIOR: Floor = { levels: ["senior", "lead"] };
const FULL: Floor = { types: ["full_time"] };
const PAY: Floor = { min_pay: { amount: 100000, period: "year" } };

// [name, posting, floor, pass, reasons]
const SET: [string, any, Floor, boolean, string[]][] = [
  // Seniority
  ["senior title fails an entry floor", P("Senior Software Engineer"), ENTRY, false, ["level_senior"]],
  ["Sr. abbreviation is senior", P("Sr. Data Analyst"), ENTRY, false, ["level_senior"]],
  ["trap: Seniority Analyst is not senior", P("Seniority Analyst"), ENTRY, true, []],
  ["staff engineer is lead", P("Staff Software Engineer"), ENTRY, false, ["level_lead"]],
  ["trap: Staff Accountant is not staff-engineer level", P("Staff Accountant"), ENTRY, true, []],
  ["trap: Staff Nurse is not staff-engineer level", P("Staff Nurse, Med-Surg"), ENTRY, true, []],
  ["principal is lead", P("Principal Product Designer"), ENTRY, false, ["level_lead"]],
  ["team lead is lead", P("Team Lead, Customer Support"), ENTRY, false, ["level_lead"]],
  ["trap: Lead Generation Specialist is not a lead role", P("Lead Generation Specialist"), ENTRY, true, []],
  ["director is exec", P("Director of Marketing"), ENTRY, false, ["level_exec"]],
  ["head of is exec", P("Head of Growth"), ENTRY, false, ["level_exec"]],
  ["VP is exec", P("VP, Engineering"), ENTRY, false, ["level_exec"]],
  ["trap: Executive Assistant is not an exec role", P("Executive Assistant"), ENTRY, true, []],
  ["intern passes an entry+intern floor", P("Software Engineering Intern"), ENTRY, true, []],
  ["trap: internal is not intern", P("Internal Communications Specialist"), SENIOR, true, []],
  ["trap: international is not intern", P("International Tax Manager"), SENIOR, true, []],
  ["junior fails a senior floor", P("Junior Developer"), SENIOR, false, ["level_entry"]],
  ["new grad fails a senior floor", P("Software Engineer, New Grad"), SENIOR, false, ["level_entry"]],
  ["a title naming no level passes any level floor", P("Software Engineer"), SENIOR, true, []],
  ["a title naming no level passes an entry floor too", P("Data Analyst"), ENTRY, true, []],
  // Employment type
  ["contract in parentheses is contract", P("Data Engineer (Contract)"), FULL, false, ["type_contract"]],
  ["contractor in the title is contract", P("Frontend Contractor"), FULL, false, ["type_contract"]],
  ["trap: Contract Manager is a full-time job about contracts", P("Contract Manager"), FULL, true, []],
  ["trap: Contracts Administrator", P("Contracts Administrator"), FULL, true, []],
  ["trap: contract law: the title decides", P("Associate Attorney, Contract Law"), FULL, true, []],
  ["part-time in the title", P("Barista, Part-Time"), FULL, false, ["type_part_time"]],
  ["temporary in the title", P("Temporary Warehouse Associate"), FULL, false, ["type_temporary"]],
  [
    "description: a 6-month contract",
    P("Python Developer", { description: "This is a 6-month contract with a possible extension." }),
    FULL,
    false,
    ["type_contract"],
  ],
  [
    "trap: description mentions government contracts, not contract work",
    P("Program Analyst", { description: "Support our government contracts and contract negotiations." }),
    FULL,
    true,
    [],
  ],
  ["internship fails a full-time floor", P("Summer Analyst Internship"), FULL, false, ["type_internship"]],
  ["a posting naming no type passes", P("Backend Engineer"), FULL, true, []],
  // Exclusions
  ["excluded word, whole word", P("Sales Development Representative"), { exclude_words: ["sales"] }, false, [
    "excluded_word",
  ]],
  [
    "trap: excluded word inside another word",
    P("Wholesale Operations Analyst"),
    { exclude_words: ["sales"] },
    true,
    [],
  ],
  [
    "excluded company after removing Inc",
    P("Engineer", { company: "Acme, Inc." }),
    { exclude_companies: ["acme"] },
    false,
    [
      "excluded_company",
    ],
  ],
  [
    "trap: excluded Meta is not Metabase",
    P("Engineer", { company: "Metabase" }),
    { exclude_companies: ["Meta"] },
    true,
    [],
  ],
  // Pay
  ["pay range below the floor", P("Analyst", { description: "Salary: $70,000 - $85,000 per year." }), PAY, false, [
    "pay_below_floor",
  ]],
  ["pay range above the floor", P("Analyst", { description: "The range is $120,000–$150,000." }), PAY, true, []],
  ["k shorthand", P("Analyst", { description: "USD 120k–150k plus equity." }), PAY, true, []],
  [
    "hourly range converts (45/hr = 93,600/yr, below)",
    P("Analyst", { description: "$40 - $45 per hour" }),
    PAY,
    false,
    [
      "pay_below_floor",
    ],
  ],
  [
    "hourly floor against an hourly range",
    P("Analyst", { description: "$45/hr" }),
    { min_pay: { amount: 40, period: "hour" } },
    true,
    [],
  ],
  ["trap: a signing bonus is not pay", P("Analyst", { description: "Includes a $1,000 signing bonus." }), PAY, true, [
    "pay_not_stated",
  ]],
  ["no pay stated never fails", P("Analyst", { description: "Competitive compensation." }), PAY, true, [
    "pay_not_stated",
  ]],
  ["pay in pounds is not comparable, never fails", P("Analyst", { description: "£40,000 - £50,000" }), PAY, true, [
    "pay_not_comparable",
  ]],
  [
    "several city ranges count by the most generous",
    P("Engineer", {
      description: "Denver: $80,000-$95,000. New York: $105,000-$130,000.",
    }),
    PAY,
    true,
    [],
  ],
  // Staffing
  [
    "our client is a staffing posting",
    P("Accountant", {
      company: "Some Recruiting Co",
      description: "Our client, a leading manufacturer, seeks an accountant.",
    }),
    {},
    false,
    ["staffing_agency"],
  ],
  [
    "on behalf of our client",
    P("Engineer", { company: "X Talent", description: "We are recruiting on behalf of our client in Austin." }),
    {},
    false,
    ["staffing_agency"],
  ],
  [
    "trap: a consulting firm describing our clients is not staffing",
    P("Consultant", { company: "TEST Consulting", description: "You will advise our clients on strategy." }),
    {},
    true,
    [],
  ],
  [
    "staffing allowed when the person says so",
    P("Accountant", { description: "Our client, a bank, is hiring." }),
    { allow_staffing: true },
    true,
    [],
  ],
  // Closed
  ["closed posting", P("Engineer", { closed_at: "2026-10-18T00:00:00Z" }), {}, false, ["closed"]],
  // Silence
  ["an empty floor passes an ordinary posting", P("Senior Director, Contract (Part-Time)"), {}, true, []],
];

Deno.test("C-04/1 the labeled set: every posting gets the floor's answer and its reason", () => {
  if (SET.length < 40) throw Error("the labeled set has fewer than 40 postings");
  const wrong: string[] = [];
  for (const [name, p, floor, pass, reasons] of SET) {
    const r = relevanceFloor(p, floor);
    if (r.pass !== pass || JSON.stringify(r.reasons) !== JSON.stringify(reasons)) {
      wrong.push(`${name}: got ${JSON.stringify(r)}, want pass=${pass} ${JSON.stringify(reasons)}`);
    }
  }
  console.log(`C-04 labeled set: ${SET.length - wrong.length}/${SET.length}`);
  eq(wrong, [], "labeled set");
});

Deno.test("C-04/2 pay_not_stated never fails a posting, whatever the floor", () => {
  for (const amount of [1, 50000, 1e9]) {
    for (const period of ["year", "hour"] as const) {
      const r = relevanceFloor(P("Analyst", { description: "Great benefits." }), { min_pay: { amount, period } });
      eq([r.pass, r.reasons], [true, ["pay_not_stated"]]);
    }
  }
});

Deno.test("C-04/3 the same job on two boards within 30 days is kept once; 31 days apart it is new", () => {
  const a = P("Data Analyst", {
    job_id: "greenhouse:acme:1",
    company: "Acme Inc",
    first_seen_at: "2026-10-18T00:00:00Z",
  });
  const b = P("Data Analyst", { job_id: "lever:acme:9", company: "ACME", first_seen_at: "2026-10-10T00:00:00Z" });
  const c = P("Data Analyst", { job_id: "ashby:acme:3", company: "Acme", first_seen_at: "2026-09-01T00:00:00Z" });
  const r = applyFloor([a, b, c]);
  eq(r.kept.map((p) => p.job_id), ["greenhouse:acme:1", "ashby:acme:3"]);
  eq(r.filtered, { duplicate: 1 });
});

Deno.test("C-04/4 the stated floor is validated; anything not stated stays out", () => {
  eq(validFloor(undefined), { ok: true, floor: {} });
  eq(validFloor({ levels: ["Entry", "intern"], min_pay: { amount: 90000, period: "year" } }), {
    ok: true,
    floor: { levels: ["entry", "intern"], min_pay: { amount: 90000, period: "year" } },
  });
  eq(validFloor({ levels: ["wizard"] }).ok, false);
  eq(validFloor({ min_pay: { amount: -1, period: "year" } }).ok, false);
  eq(validFloor({ allow_staffing: "yes" }).ok, false);
});

Deno.test("C-04/5 every staffing agency on file names its primary source; a named agency is matched by its name", () => {
  const rows = agencies as any[];
  for (const r of rows) {
    if (!r.name || !/^https:\/\//.test(r.source_url) || !/^\d{4}-\d{2}-\d{2}$/.test(r.checked) || !r.quote) {
      throw Error("agency row without a source: " + JSON.stringify(r));
    }
  }
  // NOT_RUN on the file's own names while it is empty (no primary page could be fetched from the build container,
  // 2026-10-19); the matching itself, against a test-only list:
  if (!rows.length) console.log("C-04/5 career_staffing_agencies.ts is empty: BLOCKED on fetching primary sources");
  const names = ["TEST Staffing Group"];
  eq(isStaffing("TEST Staffing Group, LLC", "", names), true);
  eq(isStaffing("TEST Staffing Groupware", "", names), false, "whole words only");
});

Deno.test("C-04/6 alerts: a posting below the person's floor is never alerted", () => {
  const prefs = { ...DEFAULT_PREFS, keywords: ["data analyst"], floor: { levels: ["entry"] } } as any;
  eq(matchPosting(P("Senior Data Analyst"), prefs), false);
  eq(matchPosting(P("Junior Data Analyst"), prefs), true);
  eq(matchPosting(P("Data Analyst"), prefs), true, "a title naming no level still alerts");
  eq(matchPosting(P("Senior Data Analyst"), { ...prefs, floor: undefined }), true, "no floor stated, nothing hidden");
});

Deno.test("C-04/7 search_jobs hides what fails the person's saved floor and says how many, by reason", async () => {
  const pool = [
    P("Senior Data Analyst", { job_id: "greenhouse:a:1" }),
    P("Staff Data Analyst Engineer", { job_id: "greenhouse:a:2" }),
    P("Data Analyst (Contract)", { job_id: "greenhouse:a:3" }),
    P("Data Analyst", { job_id: "greenhouse:a:4" }),
    P("Data Analyst", { job_id: "lever:a:5" }),
    P("Junior Data Analyst", { job_id: "greenhouse:a:6", closed_at: "2026-10-18T00:00:00Z" }),
  ];
  const saved = {
    user_id: "TEST-USER",
    prefs: { ...DEFAULT_PREFS, keywords: ["data analyst"], floor: { levels: ["entry"], types: ["full_time"] } },
  };
  const alerts = { get: async () => saved, save: async () => {} } as any;
  const t = Object.fromEntries(careerTools({ postings: async () => pool, alerts }).map((x) => [x.name, x]));
  const r = await t.search_jobs.run(
    { query: "data analyst" },
    { userId: "TEST-USER", now: Date.parse("2026-10-19T00:00:00Z"), state: {} } as any,
  ) as any;
  eq(r.postings.map((p: any) => p.job_id), ["greenhouse:a:4"]);
  eq(r.filtered, { level_senior: 1, level_lead: 1, type_contract: 1, duplicate: 1, closed: 1 });
});

Deno.test("C-04/8 the parts read the way the card says", () => {
  eq([levelOf("Senior Seniority Analyst"), levelOf("Account Executive"), levelOf("Chief of Staff")], [
    "senior",
    null,
    "exec",
  ]);
  eq(typeOf("Engineer", "This is a contract-to-hire role."), "contract");
  eq(statedPay("Hourly: $22 - $26"), { top_per_year: 26 * 2080 });
});
