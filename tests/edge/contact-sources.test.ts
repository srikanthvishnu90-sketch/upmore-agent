// CONTACT DATA SOURCES: Contact + provenance + dedupe, suppression, robots/allowlist gate, adapters (all fixture-based, no network),
// licensed-provider OFF switch, no guessed emails, coverage report. Run: deno test --no-check --allow-read --deny-net tests/edge/contact-sources.test.ts
import {
  csvCandidates, pastedCandidates, importContacts, SuppressionList, WebGate, parseRobots, robotsAllows, pageContacts, edgarInsiders,
  form4Candidates, secRules, validSecUserAgent, licensedAdapter, coverageReport, coverageMarkdown, emailEligibility, toContact, dedupe, isBlockedHost,
  type Fetcher, type SiteRule, type Candidate, type ProviderRecord, type LicenseConfig,
} from "../../supabase/functions/_shared/contact_sources/mod.ts";

const fx = (n: string) => Deno.readTextFileSync(new URL(`../fixtures/contact_sources/${n}`, import.meta.url));
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = new Date("2026-10-30T12:00:00Z");
const UA = "TraineeContactBot/1.0 (+https://upmore.example/bot; contact-ops@upmore-agent.dev)";
const rule = (host: string, over: Partial<SiteRule> = {}): SiteRule => ({ host, org_name: "Fixture Org", terms_url: `https://${host}/terms`, terms_reviewed_on: "2026-09-01", terms_reviewed_by: "owner",
  terms_summary: "Public directory; automated reading of public pages permitted.", license_note: "Public page; names/roles only.", min_delay_ms: 0, ...over });
function fixtureFetcher(pages: Record<string, { status?: number; text: string; url?: string }>, log: string[] = []): Fetcher {
  return async (url) => { log.push(url); const p = pages[url]; if (!p) return { status: 404, url, text: "" }; return { status: p.status ?? 200, url: p.url ?? url, text: p.text }; };
}
const gateFor = (rules: SiteRule[], pages: Record<string, { status?: number; text: string; url?: string }>, log: string[] = [], ua = UA) =>
  new WebGate({ allowlist: rules, fetcher: fixtureFetcher(pages, log), userAgent: ua, robotsToken: "TraineeContactBot", now: () => NOW, sleep: async () => {} });

// ---------- provenance ----------
Deno.test("provenance is required: no source_url, retrieved_at or license_note means no contact", () => {
  const base: Candidate = { full_name: "Ada Lovelace", provenance: { source_kind: "pasted", source_url: "user-paste://p1", retrieved_at: NOW.toISOString(), license_note: "mine" } };
  assert("contact" in toContact(base));
  for (const bad of [{ source_url: "" }, { retrieved_at: "" }, { license_note: "  " }, { retrieved_at: "not a date" }]) {
    const r = toContact({ ...base, provenance: { ...base.provenance, ...bad } }); assert("rejected" in r, JSON.stringify(bad));
  }
  assert("rejected" in toContact({ ...base, provenance: undefined as any }));
  const noHttp = toContact({ ...base, provenance: { source_kind: "team_page", source_url: "http://x.example/team", retrieved_at: NOW.toISOString(), license_note: "n" } }); assert("rejected" in noHttp);
  const li = toContact({ ...base, provenance: { source_kind: "team_page", source_url: "https://www.linkedin.com/in/someone", retrieved_at: NOW.toISOString(), license_note: "n" } }); assert("rejected" in li, "linkedin source refused");
  const r = importContacts([{ ...base, provenance: undefined as any }]); eq(r.contacts.length, 0); eq(r.rejected[0].reason, "no_provenance");
});

// ---------- no guessed email ----------
Deno.test("no guessed email: an address needs a named basis; a name plus a firm domain never yields one", () => {
  const p = { source_kind: "pasted" as const, source_url: "user-paste://p1", retrieved_at: NOW.toISOString(), license_note: "mine" };
  const r1 = toContact({ full_name: "Jane Doe", email: "jane.doe@acme.com", provenance: p }); assert("rejected" in r1 && r1.rejected.reason === "email_without_basis");
  const r2 = toContact({ full_name: "Jane Doe", email: "jane.doe@acme.com", email_basis: "guessed" as any, provenance: p }); assert("rejected" in r2 && r2.rejected.reason === "bad_email_basis");
  const r3 = toContact({ full_name: "Jane Doe", email_basis: "user_supplied", provenance: p }); assert("rejected" in r3);
  // team page with no mailto in the card, firm on the allowlist: email stays null
  const team = csvCandidates("x.csv", "Name,Company\nJane Doe,Acme\n", NOW);
  eq(team[0].email ?? null, null);
  const src = Deno.readTextFileSync(new URL("../../supabase/functions/_shared/contact_sources/types.ts", import.meta.url)) + Deno.readTextFileSync(new URL("../../supabase/functions/_shared/contact_sources/adapters/pages.ts", import.meta.url));
  assert(!/first\W*\+?\W*last\s*@|\$\{[^}]*first[^}]*\}\.\$\{[^}]*last/i.test(src), "no first.last@domain construction in source");
});

// ---------- user data ----------
Deno.test("user CSV (LinkedIn export format): preamble skipped, profile URL dropped, formula stripped, emails user_supplied, dupes merged", () => {
  const c = csvCandidates("Connections.csv", fx("user_connections.csv"), NOW);
  eq(c.length, 5);
  assert(!JSON.stringify(c).includes("linkedin.com"), "profile URLs are never stored");
  const r = importContacts(c);
  const maria = r.contacts.find((x) => x.full_name === "Maria Santos")!;
  eq(maria.email, "maria.santos@northbridge.example"); eq(maria.email_basis, "user_supplied");
  eq(maria.education, ["Wharton", "Fordham"]); eq(maria.shared_connections, ["Dev Patel", "Li Wei"]); eq(maria.role_family, "finance");
  eq(r.contacts.filter((x) => x.full_name === "Maria Santos").length, 1, "duplicate row merged"); eq(r.merged, 1);
  assert(!r.contacts.some((x) => x.full_name.includes("HYPERLINK") || x.full_name.includes("=")), "formula cell neutralized");
  assert(r.contacts.every((x) => x.provenance[0].source_url === "user-upload://Connections.csv"));
  eq(r.contacts.find((x) => x.full_name === "Sam Okafor")!.role_family, "healthcare");
});
Deno.test("pasted names: plain, 'at', comma, dash and a typed address", () => {
  const c = importContacts(pastedCandidates("Jane Doe\n- John Smith at Acme Capital\nAna Ruiz, Partner, Hale & Dorr LLP\nBo Chen - Orbit <bo@orbit.example>\nsingle", NOW)).contacts;
  eq(c.map((x) => x.full_name), ["Jane Doe", "John Smith", "Ana Ruiz", "Bo Chen"]);
  eq(c[2].firm, "Hale & Dorr LLP"); eq(c[2].role_title, "Partner"); eq(c[3].email_basis, "user_supplied"); eq(c[0].email, null);
});

// ---------- dedupe ----------
Deno.test("dedupe: same person across sources merges provenance and keeps the strongest email basis; same name at two firms stays two", () => {
  const prov = (k: "pasted" | "user_csv", u: string) => ({ source_kind: k, source_url: u, retrieved_at: NOW.toISOString(), license_note: "n" });
  const out = importContacts([
    { full_name: "Alex Kim", firm: "Acme Inc.", email: "alex@acme.example", email_basis: "user_supplied", provenance: prov("pasted", "user-paste://a") },
    { full_name: "Alex Kim", firm: "ACME", email: "alex@acme.example", email_basis: "licensed_verifier", provenance: { source_kind: "licensed_provider", source_url: "https://api.prov.example/r/1", retrieved_at: NOW.toISOString(), license_note: "L" } },
    { full_name: "Alex Kim", firm: "Other Co", provenance: prov("pasted", "user-paste://b") },
  ]).contacts;
  eq(out.length, 2); const a = out.find((x) => x.firm === "Acme Inc.")!;
  eq(a.provenance.length, 2); eq(a.email_basis, "licensed_verifier");
  eq(dedupe(out).length, 2);
});

// ---------- suppression ----------
Deno.test("suppression: opted-out person is removed, never re-imported, matched by email or name (any firm if no firm named); survives JSON round trip", () => {
  const sup = new SuppressionList(() => NOW);
  sup.suppress({ email: "Maria.Santos@Northbridge.example" }); sup.suppress({ name: "Dev Patel" }); sup.suppress({ name: "Sam Okafor", firm: "Riverside Medical Center" });
  const csv = csvCandidates("c.csv", fx("user_connections.csv"), NOW);
  const r = importContacts(csv, { suppression: sup });
  eq(r.contacts.map((x) => x.full_name).sort(), []); assert(r.suppressed >= 3);
  const later = importContacts(csv.concat(pastedCandidates("Dev Patel at Some Other Firm", NOW)), { suppression: SuppressionList.fromJSON(JSON.parse(JSON.stringify(sup.toJSON()))) });
  assert(!later.contacts.some((x) => x.full_name === "Dev Patel"), "name-only opt-out holds at every firm");
  const kept = importContacts(pastedCandidates("Sam Okafor at Elsewhere Clinic", NOW), { suppression: sup }); eq(kept.contacts.length, 1, "firm-scoped opt-out does not block another firm");
  // existing list is purged on the next import too
  const existing = importContacts(pastedCandidates("Zed Quill at Foo", NOW)).contacts; sup.suppress({ name: "Zed Quill" });
  eq(importContacts([], { suppression: sup, existing }).contacts.length, 0);
  eq(emailEligibility({ ...existing[0], email: "z@foo.example", email_basis: "user_supplied" }, sup), { ok: false, reason: "suppressed" });
});

// ---------- robots + allowlist ----------
Deno.test("robots parser: longest match, Allow beats Disallow on tie, wildcard, $, specific agent group beats *", () => {
  const r = parseRobots("User-agent: *\nDisallow: /a/\nAllow: /a/pub\nDisallow: /*.pdf$\n\nUser-agent: TraineeContactBot\nDisallow: /team/private\nCrawl-delay: 5\n", "TraineeContactBot");
  eq(r.crawlDelayS, 5); assert(robotsAllows(r, "/a/x"), "specific group has no /a rule"); assert(!robotsAllows(r, "/team/private/1"));
  const s = parseRobots("User-agent: *\nDisallow: /a/\nAllow: /a/pub\nDisallow: /*.pdf$", "Other");
  assert(!robotsAllows(s, "/a/x")); assert(robotsAllows(s, "/a/pub/1")); assert(!robotsAllows(s, "/f/x.pdf")); assert(robotsAllows(s, "/f/x.pdf?z"));
});
Deno.test("gate: default deny (not allowlisted), blocked sites never fetched even if allowlisted, http refused, path prefix", async () => {
  const log: string[] = [];
  const g = gateFor([rule("li.example")], {}, log);
  eq((await g.fetchText("https://unlisted.example/team") as any).reason, "not_allowlisted");
  const g2 = gateFor([rule("www.linkedin.com"), rule("jobs.indeed.com"), rule("app.joinhandshake.com")], {}, log);
  for (const u of ["https://www.linkedin.com/in/x", "https://jobs.indeed.com/p", "https://app.joinhandshake.com/u"]) eq((await g2.fetchText(u) as any).reason, "blocked_site");
  eq((await gateFor([rule("a.example")], {}).fetchText("http://a.example/team") as any).reason, "not_https");
  eq((await gateFor([rule("a.example", { path_prefixes: ["/team"] })], {}).fetchText("https://a.example/admin") as any).reason, "path_not_allowed");
  eq(log.length, 0, "no network call for any denied URL"); assert(isBlockedHost("uk.linkedin.com"));
});
Deno.test("gate: robots Disallow for our agent denies; unreadable robots denies; 404 robots allows; stale terms review denies; login wall and off-site redirect stop", async () => {
  const page = { text: fx("team_page.html") };
  const deny = gateFor([rule("firm.example")], { "https://firm.example/robots.txt": { text: fx("robots_deny_us.txt") }, "https://firm.example/team": page });
  eq((await deny.fetchText("https://firm.example/team") as any).reason, "robots_disallow");
  const down = gateFor([rule("firm.example")], { "https://firm.example/robots.txt": { status: 503, text: "" }, "https://firm.example/team": page });
  eq((await down.fetchText("https://firm.example/team") as any).reason, "robots_unavailable");
  const forb = gateFor([rule("firm.example")], { "https://firm.example/robots.txt": { status: 403, text: "" }, "https://firm.example/team": page });
  eq((await forb.fetchText("https://firm.example/team") as any).reason, "robots_unavailable");
  const none = gateFor([rule("firm.example")], { "https://firm.example/team": page }); assert((await none.fetchText("https://firm.example/team")).ok, "no robots.txt (404) means allowed");
  const stale = gateFor([rule("firm.example", { terms_reviewed_on: "2025-01-01" })], { "https://firm.example/team": page });
  eq((await stale.fetchText("https://firm.example/team") as any).reason, "terms_review_expired");
  const unreviewed = gateFor([rule("firm.example", { terms_reviewed_by: "" })], { "https://firm.example/team": page });
  eq((await unreviewed.fetchText("https://firm.example/team") as any).reason, "terms_review_expired");
  const wall = gateFor([rule("firm.example")], { "https://firm.example/team": { text: "", url: "https://firm.example/login?next=/team" } }); eq((await wall.fetchText("https://firm.example/team") as any).reason, "login_wall");
  const pw = gateFor([rule("firm.example")], { "https://firm.example/team": { text: '<form><input type="password"></form>' } }); eq((await pw.fetchText("https://firm.example/team") as any).reason, "login_wall");
  const off = gateFor([rule("firm.example")], { "https://firm.example/team": { text: "x", url: "https://other.example/team" } }); eq((await off.fetchText("https://firm.example/team") as any).reason, "redirect_off_site");
  eq((await gateFor([rule("firm.example")], { "https://firm.example/team": { status: 403, text: "" } }).fetchText("https://firm.example/team") as any).reason, "login_wall");
});
Deno.test("gate: robots Disallow on the page path blocks it; Crawl-delay is slept; robots read once per host", async () => {
  const sleeps: number[] = []; let t = NOW.getTime(); const log: string[] = [];
  const g = new WebGate({ allowlist: [rule("firm.example", { min_delay_ms: 1000 })], userAgent: UA, robotsToken: "TraineeContactBot", now: () => new Date(t), sleep: async (ms) => { sleeps.push(ms); t += ms; },
    fetcher: fixtureFetcher({ "https://firm.example/robots.txt": { text: fx("robots_ok.txt") }, "https://firm.example/team": { text: "ok" }, "https://firm.example/private/x": { text: "no" } }, log) });
  eq((await g.fetchText("https://firm.example/private/x") as any).reason, "robots_disallow");
  assert((await g.fetchText("https://firm.example/team")).ok); assert((await g.fetchText("https://firm.example/team")).ok);
  eq(log.filter((u) => u.endsWith("robots.txt")).length, 1); assert(sleeps.some((s) => s >= 2500), `crawl-delay 3s honored: ${sleeps}`);
});

// ---------- page adapters ----------
Deno.test("team page: names cleaned, email only where a mailto is in the card, firm from the allowlist rule, provenance carries terms", async () => {
  const g = gateFor([rule("firm.example", { org_name: "Northbridge Capital" })], { "https://firm.example/robots.txt": { text: fx("robots_ok.txt") }, "https://firm.example/team": { text: fx("team_page.html") } });
  const { candidates, denied } = await pageContacts(g, "https://firm.example/team", "team_page"); eq(denied, null);
  const c = importContacts(candidates).contacts; eq(c.length, 3);
  const priya = c.find((x) => x.full_name === "Priya Raman")!;
  eq(priya.email, "priya.raman@northbridge.example"); eq(priya.email_basis, "published_on_source"); eq(priya.firm, "Northbridge Capital"); eq(priya.role_family, "finance");
  eq(priya.education, ["Columbia MBA", "Wharton BS"]); eq(priya.location, "New York");
  assert(priya.provenance[0].license_note.includes("https://firm.example/terms") && priya.provenance[0].source_url === "https://firm.example/team");
  eq(c.find((x) => x.full_name === "Tom & Jerry Holloway")!.email, null, "no mailto, no email, no guess");
  eq(c.find((x) => x.full_name === "Elena Voss")!.email, null);
});
Deno.test("team page behind a robots deny returns no candidates and says why", async () => {
  const g = gateFor([rule("firm.example")], { "https://firm.example/robots.txt": { text: fx("robots_deny_us.txt") }, "https://firm.example/team": { text: fx("team_page.html") } });
  const r = await pageContacts(g, "https://firm.example/team", "team_page"); eq(r.candidates.length, 0); eq(r.denied?.reason, "robots_disallow");
});
Deno.test("university faculty directory and conference speaker page", async () => {
  const g = gateFor([rule("dir.ridgeway.example", { org_name: "Ridgeway University" }), rule("conf.example", { org_name: "FutureConf 2026" })], {
    "https://dir.ridgeway.example/faculty": { text: fx("faculty.html") }, "https://conf.example/speakers": { text: fx("speakers.html") } });
  const f = importContacts((await pageContacts(g, "https://dir.ridgeway.example/faculty", "university_directory")).candidates).contacts;
  eq(f.length, 2); eq(f[0].full_name, "Hannah Whitcombe"); eq(f[0].firm, "Ridgeway University"); eq(f[0].role_title, "Associate Professor, Civil Engineering");
  eq(f[0].education, ["Ph.D., Stanford", "M.S., MIT"]); eq(f[0].email_basis, "published_on_source"); eq(f[1].role_family, "education");
  const s = importContacts((await pageContacts(g, "https://conf.example/speakers", "conference_speakers")).candidates).contacts;
  eq(s.map((x) => [x.full_name, x.firm, x.role_family]), [["Aisha Karim", "Harbor Legal Group", "law"], ["Joe Ferrara", "IBEW Local 9", "trades"], ["Wei Zhang", "Orbit Software", "tech"]]);
  eq(s.every((x) => x.email === null), true);
});

// ---------- EDGAR ----------
Deno.test("SEC EDGAR: Form 4 owner names, roles, issuer; no email, no address; User-Agent required; paced; fixtures only", async () => {
  const c = importContacts(form4Candidates(fx("form4.xml"), "https://www.sec.gov/Archives/edgar/data/123456/000012345626000002/wk-form4_1.xml", NOW.toISOString())).contacts;
  eq(c.map((x) => [x.full_name, x.role_title, x.firm, x.role_family]), [["Chidi A Okafor", "Chief Financial Officer", "Northbridge Holdings Inc", "finance"], ["Astrid Lindqvist", "Director", "Northbridge Holdings Inc", "other"]]);
  assert(c.every((x) => x.email === null && x.location === null));
  assert(!validSecUserAgent("Mozilla/5.0") && !validSecUserAgent("Trainee noreply@x.com") && validSecUserAgent("Trainee Inc ops@upmore-agent.dev"));
  const log: string[] = []; let t = NOW.getTime(); const sleeps: number[] = [];
  const secUA = "Trainee Inc ops@upmore-agent.dev";
  const g = new WebGate({ allowlist: secRules("2026-10-01", "owner"), userAgent: secUA, robotsToken: "Trainee", now: () => new Date(t), sleep: async (ms) => { sleeps.push(ms); t += ms; },
    fetcher: fixtureFetcher({ "https://data.sec.gov/submissions/CIK0000123456.json": { text: fx("submissions.json") },
      "https://www.sec.gov/Archives/edgar/data/123456/000012345626000002/wk-form4_1.xml": { text: fx("form4.xml") },
      "https://www.sec.gov/Archives/edgar/data/123456/000012345626000004/wk-form4_2.xml": { text: fx("form4.xml") } }, log) });
  const r = await edgarInsiders({ gate: g, cik: 123456, userAgent: secUA }); eq(r.denied.length, 0); eq(r.candidates.length, 4);
  assert(log.some((u) => u.endsWith("/wk-form4_1.xml")) && !log.some((u) => u.includes("xslF345")), "raw XML, not the rendered page");
  assert(sleeps.every((s) => s <= 150) && sleeps.length >= 2, "paced at no more than ~6 req/s: " + sleeps);
  let threw = false; try { await edgarInsiders({ gate: g, cik: 1, userAgent: "curl/8" }); } catch { threw = true; } assert(threw, "bad UA refused");
  eq(importContacts(r.candidates).contacts.length, 2, "same insiders across two filings dedupe");
});

// ---------- licensed provider ----------
Deno.test("licensed provider adapter is OFF without key + signed contract; when on, only provider-verified emails pass, with the licence in provenance", async () => {
  eq(licensedAdapter(null).enabled, false);
  const recs: ProviderRecord[] = [
    { full_name: "Rae Lin", title: "Partner", company: "Hale Law LLP", email: "rae@hale.example", email_status: "valid", record_url: "https://api.prov.example/v1/p/1" },
    { full_name: "Tim Roe", title: "Associate", company: "Hale Law LLP", email: "tim@hale.example", email_status: "accept_all", record_url: "https://api.prov.example/v1/p/2" },
    { full_name: "No Url", record_url: "http://insecure.example/x" },
  ];
  let calls = 0; const provider = { id: "people_data_labs", terms_url: "https://prov.example/terms", search: async () => { calls++; return recs; } };
  const cfg: LicenseConfig = { provider, api_key: "k_12345678", contract_signed_on: "2026-10-30", contract_signed_by: "owner", permitted_use_note: "outreach to listed professionals, no resale" };
  for (const bad of [{ api_key: "" }, { contract_signed_on: "" }, { contract_signed_by: "" }, { permitted_use_note: " " }]) { const s = licensedAdapter({ ...cfg, ...bad }); eq(s.enabled, false, JSON.stringify(bad)); }
  eq(calls, 0, "off means no call");
  const on = licensedAdapter(cfg); assert(on.enabled); if (!on.enabled) return;
  const c = importContacts(await on.run({ firm: "Hale Law LLP" }, NOW)).contacts; eq(calls, 1); eq(c.length, 2);
  eq(c[0].email_basis, "licensed_verifier"); eq(c[1].email, null, "accept_all is not verified: address dropped"); assert(c[0].provenance[0].license_note.includes("contract signed 2026-10-30"));
  eq(c[0].role_family, "law");
});

// ---------- coverage ----------
Deno.test("coverage report built from every fixture", async () => {
  const g = gateFor([rule("firm.example", { org_name: "Northbridge Capital" }), rule("dir.ridgeway.example", { org_name: "Ridgeway University" }), rule("conf.example", { org_name: "FutureConf 2026" })], {
    "https://firm.example/team": { text: fx("team_page.html") }, "https://dir.ridgeway.example/faculty": { text: fx("faculty.html") }, "https://conf.example/speakers": { text: fx("speakers.html") } });
  const all: Candidate[] = [
    ...csvCandidates("Connections.csv", fx("user_connections.csv"), NOW), ...pastedCandidates("Jane Doe at Acme Capital", NOW),
    ...form4Candidates(fx("form4.xml"), "https://www.sec.gov/Archives/edgar/data/1/2/x.xml", NOW.toISOString()),
    ...(await pageContacts(g, "https://firm.example/team", "team_page")).candidates, ...(await pageContacts(g, "https://dir.ridgeway.example/faculty", "university_directory")).candidates,
    ...(await pageContacts(g, "https://conf.example/speakers", "conference_speakers")).candidates,
  ];
  const cov = coverageReport(importContacts(all).contacts);
  eq(cov.with_provenance, cov.total); assert(cov.total >= 14, String(cov.total));
  eq(Object.keys(cov.email_by_basis).sort(), ["published_on_source", "user_supplied"]);
  for (const f of ["finance", "tech", "healthcare", "law", "education", "trades"]) assert(cov.by_family[f] > 0, `family ${f} covered by fixtures`);
  console.log("\n" + coverageMarkdown(cov));
});
