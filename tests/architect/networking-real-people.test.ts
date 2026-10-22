// #20 networking (owner's answer 2026-10-22: "Both"). (1) Real people only: every contact Trainee drafts to or names has a
// source (the person's own file and row, or a public page Trainee read: its https link, when it was read, and the page's
// words showing that name with that title at that firm), and nothing about them is generated. (2) The guard: a contact
// without a source is dropped, the output says who could not be sourced and why, and nothing is ever sent by any of it.
// On the base (348c2d4a) the sourcing module and the reply guard do not exist, an Apollo row is drafted on the vendor's
// word alone, a draft with no source is approved and sent, and a made-up person in a chat reply reaches the person.
// Synthetic people, firms and pages only; no network, no model, nothing sent.
import { contactsOf, importContactsFile, type MxResolver } from "../../supabase/functions/_shared/career_contacts.ts";
import { memoryOutreachStore, messageOf, OPT_OUT_LINE, OUTREACH_INTENT, outreachTurn, payloadHash, runOutreachSends, type Sender } from "../../supabase/functions/_shared/career_outreach.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { runAgentTurn, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";
import APOLLO from "../fixtures/wo-033/apollo-export.csv" with { type: "text" };
import LINKEDIN from "../fixtures/wo-033/linkedin-connections.csv" with { type: "text" };

const ok = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const eq = (a: unknown, b: unknown, m = "") => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); };
const mod = async () => { try { return await import("../../supabase/functions/_shared/career_people_sources.ts"); } catch (e) { throw new Error(`the sourcing module is absent: ${e}`); } };
const guards = async () => { const g: any = await import("../../supabase/functions/_shared/agent/reply_guards.ts"); if (!g.unsourcedPeople) throw new Error("no guard against people no source shows"); return g; };
const U = "TEST-USER-NET", TH = "TEST-THREAD-NET", OCT14 = Date.parse("2026-10-14T15:00:00Z");
const MX_OK: MxResolver = async () => ({ status: "ok", hosts: ["mx.example"] });
const FACTS = [{ id: "F-001", kind: "education", text: "Economics at NYU, Class of 2027", status: "confirmed" }];

// A firm's own team page: two people with titles, one printed address, a script that names someone the page does not show.
const TEAM_URL = "https://www.northwindsynthetic.example/about/team";
const TEAM_HTML = `<html><head><title>Team</title><script>window.cfg = { featured: "Ghost Person, Analyst at Northwind Synthetic" };</script><style>.x{}</style></head>
<body><h1>Northwind Synthetic &mdash; Our Team</h1>
<div class="card"><h3>Dana Fixture</h3><p>Vice President</p><p><a href="mailto:dana.fixture@northwindsynthetic.example">dana.fixture@northwindsynthetic.example</a></p></div>
<div class="card"><h3>Elliot Sample</h3><p>Analyst</p></div>
<footer>&copy; 2026 Northwind Synthetic LLC</footer></body></html>`;
// A news page on another site: shows Avery at Goldman Sachs; shows Blake, but at another bank than the vendor list says.
const NEWS_URL = "https://www.dealnews.example/2026/10/analyst-class";
const NEWS_HTML = `<html><body><article><p>Avery Synthetic, an Investment Banking Analyst at Goldman Sachs, spoke at the panel.</p>
<p>Later, Blake Fixture, an Investment Banking Associate at Morgan Stanley, joined.</p></article></body></html>`;

function pages(m: any, html: Record<string, string>) {
  const reads: string[] = [];
  const read = async (link: string) => { reads.push(link); const h = html[link]; return h ? { status: "ok" as const, url: link, text: m.pageText(h), retrieved_at: new Date(OCT14).toISOString() } : { status: "error" as const, why: "not found" }; };
  return { read, reads };
}
// The extractor stands in for the model: it proposes people, some of them made up. Code keeps only what the page shows.
const proposing = (people: any[]) => async () => people;

Deno.test("#20/S1 a page the person names: only people its own words show are kept, each with the link, the date read and the quote", async () => {
  const m: any = await mod();
  const p = pages(m, { [TEAM_URL]: TEAM_HTML });
  const r = await m.sourcePeopleFromPage({ link: TEAM_URL, read: p.read, extract: proposing([
    { name: "Dana Fixture", title: "Vice President", firm: "Northwind Synthetic", email: "dana.fixture@northwindsynthetic.example" },
    { name: "Elliot Sample", title: "Analyst", firm: "Northwind Synthetic", email: "elliot.sample@northwindsynthetic.example" }, // a guessed address
    { name: "Ghost Person", title: "Analyst", firm: "Northwind Synthetic" }, // only in a script, not on the page
    { name: "Sarah Madeup", title: "Associate", firm: "Northwind Synthetic" }, // invented
    { name: "Dana Fixture", title: "Managing Director", firm: "Northwind Synthetic" }, // wrong title
    { name: "Elliot", title: "Analyst", firm: "Northwind Synthetic" }, // no full name
  ]) });
  ok(r.status === "ok", JSON.stringify(r));
  eq(r.kept.map((k: any) => [k.name, k.title, k.firm, k.email]), [["Dana Fixture", "Vice President", "Northwind Synthetic", "dana.fixture@northwindsynthetic.example"], ["Elliot Sample", "Analyst", "Northwind Synthetic", null]],
    "kept: the two the page shows; an address only where the page prints it, never guessed");
  for (const k of r.kept) {
    ok(k.source.kind === "public_page" && k.source.url === TEAM_URL && k.source.retrieved_at === "2026-10-14T15:00:00.000Z", JSON.stringify(k.source));
    ok(k.source.quote.includes(k.name) && /Northwind Synthetic|Vice President|Analyst/.test(k.source.quote), `the page's own words are kept: ${k.source.quote}`);
  }
  eq(r.not_sourced.map((x: any) => [x.name, x.why]), [
    ["Ghost Person", "the page doesn't name them"], ["Sarah Madeup", "the page doesn't name them"],
    ["Dana Fixture", "the page doesn't show them as Managing Director"], ["Elliot", "no full name to check"],
  ], "everyone not kept is said, with why");
  eq(p.reads, [TEAM_URL], "the page was read once");
});

Deno.test("#20/S2 never LinkedIn or Indeed, only public https pages; a refused link is never read", async () => {
  const m: any = await mod();
  const p = pages(m, {});
  for (const link of ["https://www.linkedin.com/in/someone", "https://linkedin.com/company/x/people", "https://lnkd.in/abc", "https://www.indeed.com/cmp/x", "https://uk.indeed.com/x",
    "https://ca.linkedin.cn/x", "http://www.northwindsynthetic.example/team", "https://10.0.0.5/team", "https://localhost/team", "https://intranet/team", "https://user:pw@northwindsynthetic.example/team",
    "https://www.northwindsynthetic.example:8443/team", "not a link"]) {
    const r = await m.sourcePeopleFromPage({ link, read: p.read, extract: proposing([{ name: "Dana Fixture", title: "Vice President", firm: "Northwind Synthetic" }]) });
    ok(r.status === "refused" && typeof r.why === "string", `${link}: ${JSON.stringify(r)}`);
  }
  eq(p.reads, [], "no refused link was read");
  // The real reader re-checks every redirect, and reads only web pages, within its bounds.
  const asked: string[] = [];
  const fake = (routes: Record<string, () => Response>) => (async (u: any, init: any) => {
    asked.push(String(u)); ok(init?.method === "GET" && init?.credentials === "omit" && init?.redirect === "manual", JSON.stringify(init));
    return (routes[String(u)] ?? (() => new Response("no", { status: 404 })))();
  }) as typeof fetch;
  const reader = m.httpPageReader({ now: () => OCT14, fetch: fake({
    "https://a.example/team": () => new Response(null, { status: 302, headers: { location: "https://www.linkedin.com/company/a/people" } }),
    "https://b.example/team": () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    "https://c.example/team": () => new Response(TEAM_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    "https://d.example/team": () => new Response("x".repeat(m.PAGE_MAX_BYTES + 10), { status: 200, headers: { "content-type": "text/html" } }),
  }) });
  ok((await reader("https://a.example/team")).status === "refused", "a redirect to LinkedIn is refused");
  ok((await reader("https://b.example/team")).status === "error", "not a web page");
  ok((await reader("https://d.example/team")).status === "error", "too large");
  const c = await reader("https://c.example/team");
  ok(c.status === "ok" && /Dana Fixture\nVice President/.test(c.text) && !/Ghost Person/.test(c.text) && c.retrieved_at === "2026-10-14T15:00:00.000Z", JSON.stringify(c));
  ok(!asked.some((u) => /linkedin|indeed/i.test(u)), `never asked LinkedIn or Indeed: ${asked}`);
});

Deno.test("#20/G1 the guard: a vendor's claim, a row with no read date, and a row its source no longer backs are not sourced", async () => {
  const m: any = await mod();
  const state: Record<string, unknown> = {};
  await importContactsFile(state, { name: "Connections.csv", text: LINKEDIN }, MX_OK, OCT14);
  await importContactsFile(state, { name: "apollo-export.csv", text: APOLLO }, MX_OK, OCT14);
  const rows: any[] = contactsOf(state);
  const own = rows.filter((r) => r.file === "Connections.csv");
  ok(own.length === 4 && own.every((r) => r.source?.kind === "own_export" && r.source.url === null && r.source.ref === `Connections.csv, row ${r.row}` && r.source.retrieved_at === "2026-10-14T15:00:00.000Z"),
    `own export rows are sourced by their file and row, read now: ${JSON.stringify(own.map((r) => r.source))}`);
  ok(!JSON.stringify(state).includes("linkedin.com/in/"), "still no profile URL kept (WO-033 L1)");
  const g = m.requireSourced([...rows, { file: "LinkedIn connections (imported earlier)", row: 1, name: "Old Import", email: null, firm: "Lazard", firm_raw: "Lazard", company: "Lazard", title: "Analyst", school: "", connected_on: "imported" },
    { ...own[1], title: "Managing Director" }]);
  eq(g.kept.map((r: any) => r.name), ["Jordan Example", "Riley Placeholder", "Morgan Dummy", "Taylor Mock"]);
  eq(g.not_sourced.map((x: any) => [x.name, x.why]), [
    ["Avery Synthetic", "only Apollo's list says where they work; no page I've read shows it"], ["Blake Fixture", "only Apollo's list says where they work; no page I've read shows it"],
    ["Casey Sample", "only Apollo's list says where they work; no page I've read shows it"], ["Drew Testcase", "only Apollo's list says where they work; no page I've read shows it"],
    ["Old Import", "no source on record (read before Trainee kept when a list was read; send the file again)"],
    ["Riley Placeholder", "the source shows them as Analyst, not Managing Director"],
  ]);
  ok(/^Not sourced, so left out: 4 because only Apollo's list says/.test(m.notSourcedText(g.not_sourced)) && /nothing was sent\.$/.test(m.notSourcedText(g.not_sourced)), m.notSourcedText(g.not_sourced));
});

function drafter() {
  return async (p: any) => {
    const t = String(p.messages[0].content);
    const name = /- name: (.+)/.exec(t)![1].split(" ")[0], firm = /- firm: (.+)/.exec(t)![1];
    return { stop_reason: "end_turn", content: [{ type: "text", text: `Subject: Question about your path at ${firm}\n\nHi ${name},\n\nI'm studying economics at NYU. Would you have 15 minutes next week to talk about your work at ${firm}?` }] };
  };
}
function fakeGmail(): Sender & { sent: any[] } { const sent: any[] = []; return { sent, async send(_u, msg) { sent.push(msg); return { status: "sent", id: `G${sent.length}`, thread_id: `T${sent.length}` }; } }; }

Deno.test("#20/D1 drafting: only sourced people get a draft, each shows its source and read date, the rest are named as not sourced, and nothing is sent", async () => {
  const store = memoryOutreachStore(), gmail = fakeGmail();
  await store.setPrefs(U, { signature: "Sam Student" });
  const state: Record<string, any> = { profile: { facts: FACTS, connections: [] } };
  await importContactsFile(state, { name: "Connections.csv", text: LINKEDIN }, MX_OK, OCT14);
  await importContactsFile(state, { name: "apollo-export.csv", text: APOLLO }, MX_OK, OCT14);
  const read = async (link: string) => link === NEWS_URL ? { status: "ok" as const, url: link, text: NEWS_HTML.replace(/<[^>]+>/g, " "), retrieved_at: new Date(OCT14).toISOString() } : { status: "error" as const, why: "not found" };
  const tools = Object.fromEntries(careerTools({ postings: async () => [], outreach: { store, model: drafter(), pages: { read, extract: proposing([
    { name: "Avery Synthetic", title: "Investment Banking Analyst", firm: "Goldman Sachs" }, { name: "Blake Fixture", title: "Investment Banking Associate", firm: "J.P. Morgan" },
  ]) } } as any }).map((t) => [t.name, t]));
  const ctx = (message: string) => ({ userId: U, threadId: TH, now: OCT14, state, turn: { message, added: [] as string[] } as any });

  const c1 = ctx("draft emails to the people on my lists");
  const first = await tools.draft_outreach.run({}, c1);
  eq([first.drafted, (first.not_sourced ?? []).map((x: any) => x.name)], [1, ["Avery Synthetic", "Blake Fixture"]], "the own export's Riley is drafted; Apollo's two wait for a source");
  ok(/1\. To: Riley Placeholder, Analyst, Lazard <riley\.placeholder@lazard\.example>\nFrom your list: Connections\.csv, row 2 \(read 2026-10-14\)/.test(c1.turn.show.text), c1.turn.show.text);
  ok(/Not sourced, so left out: 2 because only Apollo's list says where they work; no page I've read shows it \(Avery Synthetic, Blake Fixture\)\. I only reach out to people a source shows; nothing was sent\./.test(c1.turn.show.text), c1.turn.show.text);

  // The person sends a page: Avery is shown at Goldman Sachs (the vendor's row is corroborated); Blake is shown elsewhere.
  const c2 = ctx(`here's an article about them: ${NEWS_URL}`);
  const src = await tools.source_people_from_page.run({ url: NEWS_URL }, c2);
  eq([src.status, src.corroborated, src.added, src.sent, src.not_sourced.map((x: any) => [x.name, x.why])], ["ok", 1, 0, 0, [["Blake Fixture", "the page doesn't show them at J.P. Morgan"]]]);
  ok(/Not sourced, so left out: 1 because the page doesn't show them at J\.P\. Morgan \(Blake Fixture\)/.test(src.not_sourced_text), src.not_sourced_text);
  await rejectsWith(() => tools.source_people_from_page.run({ url: NEWS_URL }, ctx("find people for me")), /the link must be one the person gave in this message/);

  const c3 = ctx("draft emails to the people on my lists");
  const second = await tools.draft_outreach.run({}, c3);
  eq([second.drafted, second.held_out.already_contacted, second.not_sourced.map((x: any) => x.name)], [1, 1, ["Blake Fixture"]]);
  ok(new RegExp(`1\\. To: Avery Synthetic, Investment Banking Analyst, Goldman Sachs <avery\\.synthetic@gs\\.example>\\nSource: ${NEWS_URL.replace(/[./]/g, "\\$&")} \\(read 2026-10-14\\)`).test(c3.turn.show.text), c3.turn.show.text);
  const avery = (await store.latestBatch(U))[0];
  eq([avery.recipient.source_kind, avery.recipient.source_url, avery.recipient.retrieved_at], ["public_page", NEWS_URL, "2026-10-14T15:00:00.000Z"]);
  // Drafting, sourcing and reading sent nothing; only the person's later approval and the scheduled run ever can.
  eq([gmail.sent.length, (await store.latestBatch(U)).every((d) => d.status === "shown")], [0, true]);
});

Deno.test("#20/D2 a draft with no source on record is never approved and never sent, however it got there", async () => {
  const store = memoryOutreachStore(), gmail = fakeGmail();
  const bare: any = { n: 1, recipient: { name: "Nobody Sourced", firm: "Lazard", title: "Analyst", school: "", email: "nobody.sourced@lazard.example", source: "made up" },
    subject: "Hello", body: "Hi, a question.", footer: `Sam\n\n${OPT_OUT_LINE}`, status: "shown", approved_hash: null, approved_at: null, sent_at: null, gmail_id: null, gmail_thread: null, result: null,
    created_at: new Date(OCT14).toISOString(), hash: "", shared: [] };
  bare.hash = await payloadHash(messageOf(bare));
  await store.saveBatch(U, TH, [bare], OCT14);
  store.setIntent(TH, OUTREACH_INTENT);
  const r = await outreachTurn({ message: "send all", userId: U, threadId: TH, now: OCT14, store, gmailConnected: async () => true });
  ok(/Nothing new was approved/.test(r!.reply) && /1 \(no source on record shows Nobody Sourced\)/.test(r!.reply), r!.reply);
  // An approval that exists anyway (written before this guard, or by any other path) is refused at the send.
  const [d] = await store.latestBatch(U);
  await store.update(U, { ...d, status: "approved", approved_hash: d.hash, approved_at: new Date(OCT14).toISOString() });
  const s = await runOutreachSends({ store, sender: gmail, now: OCT14 });
  eq([s.sent, s.refused.not_sourced, gmail.sent.length, (await store.latestBatch(U))[0].status], [0, 1, 0, "skipped"]);
});

// The chat: a reply that names a person no source shows has them left out, and says so.
const tool = (name: string, out: unknown): ToolSpec => ({ name, effect: "read", description: name, input_schema: { type: "object", properties: {}, required: [] }, run: async () => out });
function scripted(steps: any[][]) { let i = 0; return async () => ({ content: steps[Math.min(i++, steps.length - 1)], stop_reason: "end_turn" }); }
const text = (t: string) => [{ type: "text", text: t }];

Deno.test("#20/C1 chat: a made-up person is left out after one rewrite, and the reply says who and why", async () => {
  const madeUp = "Evercore is a strong fit. Reach out to Sarah Chen, an analyst at Evercore, for a coffee chat. Michael Klein is a managing director at Evercore too.";
  const r = await runAgentTurn({ system: "s", history: [], message: "who should I network with at Evercore?", tools: [tool("referral_map", { firms: [] })], model: scripted([text(madeUp), text(madeUp)]),
    ctx: { userId: U, threadId: TH, now: OCT14, state: { profile: { facts: FACTS } } } });
  ok(!/Sarah Chen, an analyst|Michael Klein is/.test(r.reply) && /Evercore is a strong fit\./.test(r.reply), r.reply);
  ok(/I left out Sarah Chen, Michael Klein: I couldn't source them/.test(r.reply), r.reply);
  const g = await guards();
  // Who a source shows stays: the person's own list, their own message, a tool's result.
  eq(g.unsourcedPeople("Reach out to Jordan Example at Goldman Sachs.", ["Jordan Example"]), []);
  eq(g.unsourcedPeople("Priya Raman, a VP at Ramp, is your interviewer.", ['{"interviewers":["Priya Raman"]}']), []);
  // Firms, teams and offices are not people.
  for (const s of ["Email Jane Street recruiting or reach out to Goldman Sachs' campus team.", "Reach out to Goldman Sachs Asset Management.", "Talk to your career center and the Investment Banking Club.",
    "Connect with New York alumni at Morgan Stanley.", "Contact Morgan Stanley about the role."]) eq(g.unsourcedPeople(s, []), [], s);
  eq(g.unsourcedPeople("Try networking with Mary Ann Lopez, an associate at Lazard.", []).map((x: any) => x.name), ["Mary Ann Lopez"]);
});

Deno.test("#20/N1 nothing here sends: the sourcing module names no send, post, claim or message door", async () => {
  const src = await Deno.readTextFile(new URL("../../supabase/functions/_shared/career_people_sources.ts", import.meta.url)).catch(() => { throw new Error("the sourcing module is absent"); });
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  ok(!/\b(sendOne|runOutreachSends|sender\.send|\.send\(|claim|career_outreach_claim|gmail|smtp|method:\s*"POST"|method:\s*"PUT")\b/i.test(code), "no send or post in the sourcing module");
  ok(/method: "GET"/.test(code) && /credentials: "omit"/.test(code), "the reader only GETs, without cookies");
});

async function rejectsWith(f: () => Promise<unknown>, re: RegExp) { try { await f(); } catch (e) { ok(re.test(String((e as Error).message)), `wrong error: ${(e as Error).message}`); return; } throw new Error("did not reject"); }
