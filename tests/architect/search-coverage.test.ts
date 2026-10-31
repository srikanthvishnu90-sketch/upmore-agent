// SEARCH COVERAGE: every board type ingest reads yields open rows from its fixture board; the open / closed / expired /
// scam screens, the duplicate collapse and the level + place + term filters behave on "software engineering internship
// Chicago summer 2027". Offline: readers and logic only (scripts/career/coverage-report.ts prints the same table).
import { matchesWords, memoryPostingsDb, searchWords, titleTier } from "../../supabase/functions/_shared/career_ingest.ts";
import { searchPostings } from "../../supabase/functions/_shared/career_search.ts";
import { canonicalUrl, dupKeys, parseSearchQuery, placeFit, postingLevel, postingStatus, scamSignals, termExpired, termsIn } from "../../supabase/functions/_shared/career_search_query.ts";
import { coverage, QUERY } from "../../scripts/career/coverage-report.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.parse("2026-10-30T12:00:00Z");

Deno.test("SC/1 every one of the 11 board types, whole and streamed, yields open rows from its fixture", async () => {
  const lines = await coverage(NOW);
  eq(lines.length, 22);
  for (const l of lines) {
    assert(l.failures.length === 0, `${l.provider}/${l.mode} failed: ${l.failures}`);
    assert(l.open > 0, `${l.provider}/${l.mode} has no open rows`);
    // Text-visible providers drop the expired term, the filled posting and the scam; the three whose list carries no text keep the latter two.
    eq(l.open, l.text_visible ? 5 : 7, `${l.provider}/${l.mode} open rows`);
    eq(l.url_unknown, 0, `${l.provider}/${l.mode} every posting link has a recognized shape`);
    eq(l.screened.expired_term, 1, `${l.provider}/${l.mode} expired term`);
    eq(l.search_hits, l.text_visible ? 1 : 2, `${l.provider}/${l.mode} hits for the sentence`);
  }
  for (const p of ["workable", "recruitee", "teamtailor", "personio", "workday", "smartrecruiters"]) assert(lines.some((l) => l.provider === p && l.open > 0), p);
});

Deno.test("SC/2 the sentence is read as role + level + place + term", () => {
  const q = parseSearchQuery(QUERY);
  eq(q.roleWords, ["software", "engineering"]);
  eq(q.level, "intern");
  eq(q.places.map((p) => p.key), ["chicago"]);
  eq(q.term, { season: "summer", year: 2027 });
  eq(parseSearchQuery("new grad data analyst in new york").places.map((p) => p.key), ["new york"]);
  eq(parseSearchQuery("new grad data analyst in new york").level, "new_grad");
  eq(parseSearchQuery("product manager jobs").roleWords, ["product", "manager"]);
  eq(parseSearchQuery("swe intern nyc fall 2027").roleWords, ["software", "engineer"]);
});

Deno.test("SC/3 search: level, place and term filters; duplicates once; senior, other city and past term never offered", () => {
  const db = memoryPostingsDb();
  const mk = (id: string, title: string, location: string, extra: Record<string, unknown> = {}) => ({ job_id: id, provider: "greenhouse", board: "x", ats_id: id, company: "Acme", title, location, url: `https://boards.greenhouse.io/x/jobs/${id}0000`, description: "", department: "", posted_at: null, remote: null, role_family: null, seniority_band: null, apply_email: null, first_seen_at: "2026-10-20T00:00:00Z", last_seen_at: "2026-10-20T00:00:00Z", closed_at: null, ...extra });
  void db;
  const pool = [
    mk("a", "Software Engineering Intern, Summer 2027", "Chicago, IL"),
    mk("b", "Software Engineer Intern - Summer 2027", "Chicago, IL", { url: "https://boards.greenhouse.io/x/jobs/a0000?gh_src=li" }),
    mk("c", "Software Engineering Intern, Summer 2027", "New York, NY"),
    mk("d", "Senior Software Engineer", "Chicago, IL"),
    mk("e", "Software Engineering Intern, Fall 2027", "Chicago, IL"),
    mk("f", "Software Engineering Intern", "Chicago, IL"),
    mk("g", "Software Engineering Intern", "Multiple Locations"),
    mk("h", "Software Engineering Intern", "Remote, US"),
    mk("i", "Software Engineering Internship", "Chicago, IL", { description: "This position has been filled." }),
    mk("j", "Software Engineering Intern, Summer 2027", "Chicago, IL", { closed_at: "2026-10-25T00:00:00Z" }),
    mk("k", "Software Engineering Intern, Summer 2025", "Chicago, IL"),
  ];
  const r = searchPostings(pool, QUERY, null, 20, { now: NOW });
  eq(r.postings.map((p) => p.job_id), ["a", "f", "g"], "the stated-term Chicago intern first (one of the two duplicates), then the unstated term, then the unplaced");
  eq(r.screened, { closed_text: 1, expired_term: 1 });
  eq(r.duplicates, 1);
  eq(r.asked?.places, ["Chicago"]);
  // Remote asked: the remote posting joins.
  eq(searchPostings(pool, "software engineering intern remote summer 2027", null, 20, { now: NOW }).postings.map((p) => p.job_id).includes("h"), true);
  // Plain queries behave as before.
  eq(searchPostings(pool, "software engineer", null, 20, { now: NOW }).postings.length > 0, true);
});

Deno.test("SC/4 level: an intern title, a new-grad title, a senior title", () => {
  eq(postingLevel({ title: "Software Engineer Intern" }), "intern");
  eq(postingLevel({ title: "Summer Analyst" }), "intern");
  eq(postingLevel({ title: "Senior Software Engineer" }), "senior");
  eq(postingLevel({ title: "Software Engineer, New Grad" }), "new_grad");
  eq(postingLevel({ title: "Software Engineer", seniority_band: "intern" }), "intern");
  eq(postingLevel({ title: "Engineering Manager Intern" }), "intern");
});

Deno.test("SC/5 place: a city and its aliases; unplaced is not 'elsewhere'; remote only when asked", () => {
  const chi = parseSearchQuery("chicago").places;
  eq(placeFit("Chicago, IL", chi, false), "yes");
  eq(placeFit("Springfield, IL", chi, false), "no");
  eq(placeFit("Remote, US", chi, false), "no");
  eq(placeFit("Remote, US", chi, true), "yes");
  eq(placeFit("Multiple Locations", chi, false), "unplaced");
  eq(placeFit("", chi, false), "unplaced");
  eq(placeFit("Brooklyn, NY", parseSearchQuery("nyc").places, false), "yes");
  eq(placeFit("Anywhere", [], false), "yes");
});

Deno.test("SC/6 term: read, expired against the clock", () => {
  eq(termsIn("Summer 2027 Intern; Fall '26"), [{ season: "summer", year: 2027 }, { season: "fall", year: 2026 }]);
  assert(termExpired({ season: "summer", year: 2026 }, NOW), "Summer 2026 is past in October 2026");
  assert(!termExpired({ season: "fall", year: 2026 }, NOW), "Fall 2026 is not over in October");
  assert(!termExpired({ season: "summer", year: 2027 }, NOW));
  assert(termExpired({ season: null, year: 2025 }, NOW));
});

Deno.test("SC/7 status: closed wording, expired term, scam; an ordinary posting stays open", () => {
  eq(postingStatus({ title: "Intern", description: "We are no longer accepting applications for this role." }, NOW), { open: false, reason: "closed_text" });
  eq(postingStatus({ title: "Intern, Summer 2025", description: "" }, NOW), { open: false, reason: "expired_term" });
  eq(postingStatus({ title: "Assistant", description: "Pay a $99 training fee before you start." }, NOW), { open: false, reason: "scam" });
  eq(postingStatus({ title: "Support", description: "Interview via Telegram. Contact our manager on Telegram." }, NOW).open, true, "one soft signal is not enough");
  eq(postingStatus({ title: "Support", description: "Interview via Telegram. Earn $900 per week, no experience needed. Buy gift cards for clients and send the codes." }, NOW), { open: false, reason: "scam" });
  eq(postingStatus({ title: "Software Engineer", description: "We pay competitive salaries, a relocation bonus and offer a gift card program for referrals and a crypto wallet product to build.", apply_email: null }, NOW).open, true);
  eq(postingStatus({ title: "Barista", description: "Our roles filled quickly last summer, but this one is open. Apply today." }, NOW), { open: true });
  eq(scamSignals({ title: "x", description: "We do background checks at our expense." }), []);
});

Deno.test("SC/8 duplicates: tracking params and trailing slashes do not make a different link", () => {
  eq(canonicalUrl("https://www.Example.com/jobs/1/?utm_source=x&gh_src=y#top"), "example.com/jobs/1");
  eq(dupKeys({ company: "Acme, Inc.", title: "Intern (Summer)", location: "Chicago, IL", url: "https://a.com/x" })[0], dupKeys({ company: "Acme", title: "Intern", location: "Chicago IL" })[0]);
});

Deno.test("SC/9 words: an internship query finds an Intern title; plain queries unchanged; the database form groups the synonyms", async () => {
  const p = { title: "Software Engineer Intern", company: "Acme", location: "Chicago, IL", description: "" };
  assert(matchesWords(p, searchWords("software engineering internship")), "internship ~ intern");
  assert(matchesWords(p, searchWords("software engineer internship summer 2027")), "a season and a year are soft");
  assert(!matchesWords({ ...p, title: "International Sales" }, searchWords("internship")), "intern is not international");
  eq(titleTier(p, searchWords("software internship summer 2027")), 0);
  assert(!matchesWords(p, searchWords("summer 2027 pastry chef")), "soft words do not rescue a missing role");
  const { dbQuery } = await import("../../supabase/functions/_shared/career_ingest.ts");
  eq(dbQuery(["product", "manager"]), { titled: "product:A & manager:A", rest: "product manager", grouped: false });
  eq(dbQuery(["software", "internship", "summer", "2027"]).titled, "software:A & (intern:A | internship:A | coop:A)");
});

Deno.test("SC/10 reviewer probes: closed wording that is not a status stays open (flagged, not dropped)", () => {
  for (const d of ["Position filled quickly? Apply today.", "Applications are closed on Friday for the first round.", "This role is on hold for approvals.", "This role is no longer available in Germany but open in France.", "We have filled several roles and are hiring more."])
    eq(postingStatus({ title: "Engineer", description: d }, NOW).open, true, d);
  eq(postingStatus({ title: "Engineer", description: "Applications are closed on Friday for the first round." }, NOW), { open: true, flags: ["closed_wording_unclear"] });
  eq(postingStatus({ title: "Engineer", description: "We have filled several roles." }, NOW), { open: true });
  for (const d of ["This position has been filled.", "We are no longer accepting applications.", "Posting closed.", "Thank you. This job is no longer available."])
    eq(postingStatus({ title: "Engineer", description: d }, NOW), { open: false, reason: "closed_text" }, d);
});

Deno.test("SC/11 reviewer probes: an employer's own scam warning is not a scam; a plain request for payment is", () => {
  for (const d of ["Never pay a registration fee or send a cheque to anyone claiming to hire for us.", "We will never ask you to buy gift cards. Beware of scammers: our process is free of charge.", "Do not send money or pay a $50 fee; that is a scam, report it."])
    eq(postingStatus({ title: "Analyst", description: d + " Join our analytics team." }, NOW).open, true, d);
  eq(postingStatus({ title: "Analyst", description: "You must pay a registration fee before your first day." }, NOW), { open: false, reason: "scam" });
  eq(postingStatus({ title: "Analyst", description: "Pay a $120 onboarding fee to begin." }, NOW), { open: false, reason: "scam" });
});

Deno.test("SC/12 reviewer probes: Portland, bare LA, Winter 2026, managers at new grad", () => {
  const pdx = parseSearchQuery("software intern portland").places;
  eq(placeFit("Portland, OR", pdx, false), "yes");
  eq(placeFit("Portland, ME", pdx, false), "no");
  const me = parseSearchQuery("software intern portland maine");
  eq(me.places.map((p) => p.key), ["portland maine"]);
  eq(placeFit("Portland, Maine", me.places, false), "yes");
  eq(placeFit("Portland, Oregon", me.places, false), "no");
  eq(parseSearchQuery("la liga data analyst").places, [], "a bare la is not Los Angeles");
  eq(parseSearchQuery("analyst los angeles").places.map((p) => p.key), ["los angeles"]);
  assert(!termExpired({ season: "winter", year: 2026 }, NOW), "Winter 2026 starts later this year");
  assert(termExpired({ season: "winter", year: 2025 }, NOW));
  eq(postingStatus({ title: "Software Intern, Winter 2026", description: "" }, NOW), { open: true });
  eq(postingLevel({ title: "Account Manager" }), "other");
  eq(postingLevel({ title: "Product Manager", seniority_band: "manager" }), "other");
  const pool = [{ job_id: "m", provider: "g", board: "x", ats_id: "m", company: "A", title: "Account Manager", location: "Chicago, IL", url: "https://boards.greenhouse.io/x/jobs/1230000", description: "", seniority_band: "manager", first_seen_at: "2026-10-20T00:00:00Z", closed_at: null }];
  eq(searchPostings(pool, "account manager new grad chicago", null, 5, { now: NOW }).postings.length, 1);
});
