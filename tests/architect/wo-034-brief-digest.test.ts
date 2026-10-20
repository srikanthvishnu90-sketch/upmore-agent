// WO-034: the pre-interview brief from an invite (mail or pasted), the weekly digest, the thank-you after an interview,
// and where-do-I-stand with dates and sources. Synthetic mail, a fake Gmail and in-memory stores only: no network, no
// database, no model. Run: deno test -A --no-check tests/architect/wo-034-brief-digest.test.ts
import { askedLastYear, extractInvite, INTERVIEWER_LOOKUP, INTERVIEWER_NOTE, interviewDrafts, interviewRow, inviteBrief, type InterviewRow, recordFor, TEXT_LIMIT } from "../../supabase/functions/_shared/career_invite.ts";
import { followUps, standing, type StatusEvent, type TrackedApp } from "../../supabase/functions/_shared/career_mail.ts";
import { appsFromTracker, memoryMailStore } from "../../supabase/functions/_shared/career_mail_store.ts";
import { memoryAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { memoryBriefStores } from "../../supabase/functions/_shared/career_brief_store.ts";
import { buildDigest, type DigestRows, digestDue, isoWeek } from "../../supabase/functions/_shared/career_digest.ts";
import { runDigest, runInterviewDrafts } from "../../supabase/functions/_shared/career_proactive_run.ts";
import { messageHash, readMailSince } from "../../supabase/functions/_shared/career_mail_gmail.ts";
import { handleProactive } from "../../supabase/functions/career-proactive/handler.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const DAY = 86400000, HOUR = 3600000, MIN = 60000;
const NOW = Date.parse("2026-10-20T15:00:00Z"); // Tuesday, 11:00 in New York
const iso = (t: number) => new Date(t).toISOString();
const SECRET = "x".repeat(40);
const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
// Plain text that reads the same on iMessage, WhatsApp and Telegram: no markdown, links bare on their own line.
function plainText(t: string, m = "") {
  assert(t.length <= TEXT_LIMIT, `${m}: ${t.length} characters`);
  assert(!/\*\*|__|^#|\[[^\]]+\]\(|`/m.test(t), `${m}: markdown in ${t}`);
  for (const line of t.split("\n")) if (/https?:\/\//.test(line)) assert(/^https:\/\/\S+$/.test(line.trim()), `${m}: a link not on its own line: ${line}`);
}

const DATADOG = {
  subject: "Interview invitation: Software Engineer at Datadog",
  text: "Hi Sam, we would like to invite you to a virtual interview for the Software Engineer role on Thursday, October 22 at 2:00 PM ET over Zoom. You will meet with Jane Smith, Engineering Manager, and Raj Patel (Senior Software Engineer).",
};

// ------------------------------------------------------------------------------------------------ the extractor
Deno.test("WO-034/B1 the invite extractor reads what the invite states: company, role, date, time and zone, format, who", () => {
  const inv = extractInvite({ ...DATADOG, sentAt: NOW });
  eq([inv.company, inv.role], ["Datadog", "Software Engineer"]);
  eq([inv.when.date, inv.when.time, inv.when.zone, inv.when.starts_at], ["2026-10-22", "14:00", "America/New_York", "2026-10-22T18:00:00.000Z"]);
  eq(inv.format, { kind: "video", said: "virtual" });
  eq(inv.interviewers, [{ name: "Jane Smith", title: "Engineering Manager" }, { name: "Raj Patel", title: "Senior Software Engineer" }]);
  // A forwarded invite: its own Date: line is when the email was sent, not the interview; a time range starts the interview.
  const fwd = extractInvite({ sentAt: NOW, text: "---------- Forwarded message ---------\nFrom: Stripe Recruiting <recruiting@stripe.com>\nDate: Mon, Oct 19, 2026 at 9:14 AM\nSubject: Stripe interview invitation\n\nWe'd like to invite you to an onsite interview on 10/28/2026 from 10:30 - 11:15 AM PT at our office. You'll be speaking with Maria Lopez." });
  eq([fwd.company, fwd.when.date, fwd.when.time, fwd.when.zone, fwd.format?.kind, fwd.interviewers], ["Stripe", "2026-10-28", "10:30", "America/Los_Angeles", "onsite", [{ name: "Maria Lopez", title: null }]]);
});

Deno.test("WO-034/B2 never a guessed date, time, zone or name: what the invite does not state stays empty", () => {
  const x = (text: string, more: Record<string, unknown> = {}) => extractInvite({ text, sentAt: NOW, subject: "Interview invitation", ...more });
  // No time at all: no time, no start. (The planted defect "a 9:00 default" fails here.)
  const noTime = x("We would like to invite you to interview with Plaid on Thursday, October 22.");
  eq([noTime.when.date, noTime.when.time, noTime.when.starts_at], ["2026-10-22", null, null]);
  // A time with no am/pm and no 24-hour reading is not completed; a time with no zone has no start instant.
  eq(x("Your interview is on October 22 at 10:30.").when.time, null, "10:30 could be morning or evening");
  const noZone = x("Your interview is on October 22 at 2 pm.");
  eq([noZone.when.time, noZone.when.zone, noZone.when.starts_at], ["14:00", null, null]);
  // Two offered dates, or a window to choose from: nothing is picked.
  const two = x("We would like to schedule a phone screen. Are you free between 2 and 4 pm on Oct 23 or Oct 24?");
  eq([two.when.date, two.when.time], [null, null]);
  assert(two.when.said.includes("Oct 23") && two.when.said.includes("Oct 24"), JSON.stringify(two.when));
  // A weekday that does not fit the date, a date far off with no year, an ambiguous numeric date: unresolved.
  eq(x("Interview: Friday, October 22 at 2 PM ET.").when.date, null, "Oct 22 2026 is a Thursday");
  eq(x("Interview on June 3 at 2 PM ET.").when.date, null, "June is more than 120 days off with no year");
  eq(x("Interview on 03/04/2027 at 2 PM ET.").when.date, null, "March 4 or April 3");
  // "Thursday" alone, "tomorrow": said back, never turned into a date.
  eq(x("We would like to invite you to interview tomorrow at 3 pm ET.").when.date, null);
  // A state's abbreviation in an address is not a time zone.
  eq(x("Please come in for an interview on October 22 at 2 pm at 1 Main St, Stamford, CT 06901.").when.zone, null);
  // Names only as written; a company, a tool or a team is not a person; no name, no interviewers.
  eq(x("You will meet with the hiring team over Google Meet on October 22 at 2 PM ET.").interviewers, []);
  eq(x("We would like to invite you to interview with Goldman Sachs on October 22.").interviewers, []);
  // No company in the words and no sender: none.
  eq(x("We would like to invite you to an interview on October 22.").company, null);
});

// ------------------------------------------------------------------------------------------------ the brief
Deno.test("WO-034/B3 the brief: the invite's facts, interviewers only as the invite gives them, the record with sources, a 10-point plan, as two plain texts", () => {
  const b = inviteBrief(extractInvite({ ...DATADOG, sentAt: NOW }), { now: NOW });
  eq(b.texts.length, 2);
  b.texts.forEach((t, i) => plainText(t, `text ${i + 1}`));
  const [one, two] = b.texts;
  assert(one.startsWith("Interview brief: Datadog, Software Engineer.\nWhen: Thursday, October 22, 2026 at 2:00 PM ET."), one);
  assert(one.includes(`Who you're meeting: Jane Smith (Engineering Manager), Raj Patel (Senior Software Engineer). ${INTERVIEWER_NOTE}`), one);
  assert(one.includes("Questions Datadog asked in the last 12 months: none on file."), one);
  assert(/Question patterns from Datadog's record \(as of \d{4}-\d{2}-\d{2}\): ".+" \(anecdotal, interviewing\.io, \d{4}-\d{2}-\d{2}\)/.test(one), one);
  eq(b.patterns_from, "company record");
  const lines = two.split("\n");
  eq([lines[0], lines.length, lines[10].startsWith("10. ")], ["10-point plan for Datadog:", 11, true]);
  // No record for the company: the role's bank, labeled as the role's and not the company's.
  const acme = inviteBrief(extractInvite({ text: "We would like to invite you to interview for the Data Analyst role at Acme Robotics on October 22.", subject: "Interview", sentAt: NOW }), { now: NOW });
  eq(acme.patterns_from, "role bank");
  assert(/Question patterns from the data question bank \(about the role, not about Acme Robotics\): /.test(acme.texts[0]), acme.texts[0]);
  assert(acme.texts[0].includes("Who you're meeting: the invite names no one. " + INTERVIEWER_NOTE), acme.texts[0]);
});

Deno.test("WO-034/B4 questions asked in the last 12 months: only listed, sourced questions dated within 365 days; a record's as_of never dates one", () => {
  const lib = [{
    company_id: "acme-robotics", company_name: "Acme Robotics", as_of: "2026-10-12",
    data_sources: [{ url: "https://acme.example/careers", source_type: "official" }],
    reported_questions: [
      { question: "Walk me through a robot you debugged.", asked_at: "2026-07-01", source_url: "https://acme.example/careers", source_type: "official" },
      { question: "An old question.", asked_at: "2025-08-01", source_url: "https://acme.example/careers", source_type: "official" },
      { question: "An unsourced question.", asked_at: "2026-09-01" },
      { question: "An undated question.", source_url: "https://acme.example/careers", source_type: "official" },
    ],
  }];
  eq(askedLastYear(lib[0], NOW).map((q) => [q.q, q.asked]), [["Walk me through a robot you debugged.", "2026-07-01"]]);
  const b = inviteBrief(extractInvite({ text: "We would like to invite you to interview at Acme Robotics on October 22.", subject: "Interview", sentAt: NOW }), { now: NOW, lib });
  assert(b.texts[0].includes(`Questions Acme Robotics asked in the last 12 months (1 on file):\n- "Walk me through a robot you debugged." (official, acme.example, 2026-10-12; asked 2026-07-01)`), b.texts[0]);
  // The records on file today list no questions one by one: every one says none on file.
  for (const name of ["JPMorgan Chase & Co.", "Stripe", "Goldman Sachs", "Datadog"]) {
    const cir = recordFor(name);
    assert(cir, `a record for ${name}`);
    eq(askedLastYear(cir, NOW), [], name);
  }
});

// ------------------------------------------------------------------------------------------------ the run
interface FakeMsg { id: string; at: number; from: string; subject: string; snippet: string }
// The inbox as of the run: an email that has not arrived yet is not listed.
function fakeGmail(msgs: FakeMsg[], clock: () => number = () => Infinity) {
  const calls: { url: string; method: string }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    if (url.startsWith(API + "?")) {
      const after = Number(/after:(\d+)/.exec(decodeURIComponent(url))?.[1] ?? 0) * 1000;
      return new Response(JSON.stringify({ messages: msgs.filter((m) => m.at > after && m.at <= clock()).sort((a, b) => b.at - a.at).map((m) => ({ id: m.id })) }), { status: 200 });
    }
    const m = /messages\/([^?]+)\?format=metadata/.exec(url);
    const msg = m ? msgs.find((x) => x.id === decodeURIComponent(m[1])) : null;
    if (!msg) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ id: msg.id, internalDate: String(msg.at), snippet: msg.snippet,
      payload: { headers: [{ name: "From", value: msg.from }, { name: "Subject", value: msg.subject }, { name: "Date", value: new Date(msg.at).toUTCString() }] } }), { status: 200 });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}
function harness(o: { msgs: FakeMsg[]; mail: ReturnType<typeof memoryMailStore>; briefs: ReturnType<typeof memoryBriefStores> }) {
  let clock = 0;
  const gmail = fakeGmail(o.msgs, () => clock), outbox = memoryAlertStore(), runs: any[] = [];
  const run = async (now: number) => {
    clock = now;
    const res = await handleProactive(new Request("https://x/", { method: "POST", headers: { "x-trainee-proactive-secret": SECRET } }), {
      env: { get: (k: string) => (k === "CAREER_PROACTIVE_SECRET" ? SECRET : undefined) }, store: () => outbox,
      recentPostings: async () => [], postingsById: async () => [], recordRun: async (r) => { runs.push(r); }, now: () => now,
      mail: { store: () => o.mail, read: (u, since, n) => readMailSince({ fetch: gmail.fetch, token: async () => "TEST-TOKEN", sleep: async () => {} }, u, since, n) },
      briefs: { interviews: () => o.briefs.interviews, drafts: () => o.mail, digest: () => o.briefs.digest },
    });
    return { status: res.status, body: await res.json() };
  };
  return { run, outbox, gmail, runs };
}
const JPM_INVITE = (at: number): FakeMsg => ({ id: "gm-jpm", at, from: "JPMorgan Chase & Co. <jpmc@myworkday.com>", subject: "Next steps: JPMorgan Chase interview",
  snippet: "We are pleased to invite you to a virtual first round interview on Thursday, October 22 at 10:00 AM ET with Priya Shah, Vice President. Please confirm." });
const jpmTracker = () => ({ U1: [{ app_id: "app-jpm-1", company: "JPMorgan Chase & Co.", role: "Investment Banking Summer Analyst", stage: "Submitted", applied_at: iso(NOW - 9 * DAY), events: [{ type: "applied", at: iso(NOW - 9 * DAY) }] }] });

Deno.test("WO-034/B5 an invite read by the mail run is briefed in the same run, its facts kept, the time from email to brief recorded; once", async () => {
  const mail = memoryMailStore({ people: [{ user_id: "U1", read_through: iso(NOW - HOUR) }], tracker: jpmTracker() });
  const briefs = memoryBriefStores();
  const arrived = NOW - 4 * MIN; // the run is every 5 minutes: an invite is at most one run old when it is read
  const h = harness({ msgs: [JPM_INVITE(arrived)], mail, briefs });
  const r = await h.run(NOW);
  eq(r.status, 200);
  const out = h.outbox.dump().outbox;
  const hash = await messageHash("U1", "gm-jpm");
  eq(out.map((x) => [x.kind, x.key]), [["status", `status:${hash}`], ["brief", `brief:${hash}:1`], ["brief", `brief:${hash}:2`]], "status, then the brief, in one run");
  out.filter((x) => x.kind === "brief").forEach((x) => plainText(x.text, x.key));
  assert(out[1].text.startsWith("Interview brief: JPMorganChase, Investment Banking Summer Analyst.\nWhen: Thursday, October 22, 2026 at 10:00 AM ET."), out[1].text);
  assert(out[1].text.includes(`Who you're meeting: Priya Shah (Vice President). ${INTERVIEWER_NOTE}`), out[1].text);
  assert(/\(official, careers\.outforundergrad\.org, 2026-10-12\)/.test(out[1].text), "the record's facts carry their source");
  const [row] = briefs.dump().interviews.U1;
  eq([row.source, row.ref, row.date, row.time, row.zone, row.starts_at, row.mail_at, row.brief_at, row.brief_ms], ["mail", "track:app-jpm-1", "2026-10-22", "10:00", "America/New_York", "2026-10-22T14:00:00.000Z", iso(arrived), iso(NOW), 4 * MIN]);
  eq([r.body.briefs, h.runs[0].briefs, h.runs[0].brief_ms_max], [1, 1, 4 * MIN]);
  await h.run(NOW + 5 * MIN);
  eq(h.outbox.dump().outbox.length, 3, "the overlap re-read never briefs twice");
});

Deno.test("WO-034/B6 the offline worst case: an invite arriving just after a run is briefed by the next run, 5 minutes later", async () => {
  const mail = memoryMailStore({ people: [{ user_id: "U1", read_through: iso(NOW) }], tracker: jpmTracker() });
  const briefs = memoryBriefStores();
  const h = harness({ msgs: [JPM_INVITE(NOW + 1000)], mail, briefs });
  await h.run(NOW); // the run one second before it arrives: nothing yet
  eq(h.outbox.dump().outbox.length, 0);
  await h.run(NOW + 5 * MIN); // the next scheduled run
  const row = briefs.dump().interviews.U1[0];
  eq(row.brief_ms, 5 * MIN - 1000, "the worst case is one schedule interval");
  eq(h.outbox.dump().outbox.filter((o) => o.kind === "brief").length, 2);
});

Deno.test("WO-034/B7 no interviewer is ever looked up: no fetch beyond the person's own mail, even with a People Data Labs key set", async () => {
  eq(INTERVIEWER_LOOKUP, "never");
  const realFetch = globalThis.fetch, seen: string[] = [];
  globalThis.fetch = (async (u: string | URL | Request) => { seen.push(String(u)); return new Response("{}", { status: 200 }); }) as typeof fetch;
  Deno.env.set("PEOPLE_DATA_LABS_API_KEY", "TEST-NOT-A-KEY");
  Deno.env.set("PDL_API_KEY", "TEST-NOT-A-KEY");
  try {
    const mail = memoryMailStore({ people: [{ user_id: "U1", read_through: iso(NOW - HOUR) }], tracker: jpmTracker() });
    const briefs = memoryBriefStores();
    const h = harness({ msgs: [JPM_INVITE(NOW - 4 * MIN)], mail, briefs });
    await h.run(NOW);
    assert(h.gmail.calls.every((c) => c.url.startsWith(API) && c.method === "GET"), JSON.stringify(h.gmail.calls));
    const t = careerTools({ postings: async () => [], interviews: briefs.interviews }).find((x) => x.name === "brief_from_invite")!;
    const msg = `${DATADOG.subject}\n${DATADOG.text}`;
    await t.run({ text: msg }, { userId: "U2", threadId: "T", now: NOW, state: {}, turn: { message: msg, added: [] } } as any);
    eq(seen, [], "nothing fetched: no people search, no profile lookup");
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("PEOPLE_DATA_LABS_API_KEY");
    Deno.env.delete("PDL_API_KEY");
  }
  // And nothing on the brief's path names a people-search source or reads a key.
  for (const f of ["career_invite.ts", "career_proactive_run.ts", "career_brief_store.ts", "career_digest.ts"]) {
    const src = await Deno.readTextFile(new URL(`../../supabase/functions/_shared/${f}`, import.meta.url));
    const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    assert(!/peopledatalabs|people_data_labs|pdl|linkedin\.com|Deno\.env|fetch\(/i.test(code), `${f} must not look anyone up`);
  }
});

// ------------------------------------------------------------------------------------------------ the pasted invite
Deno.test("WO-034/B8 a pasted invite gets the same brief through brief_from_invite; only text the person pasted; kept for the thank-you", async () => {
  const briefs = memoryBriefStores();
  const t = careerTools({ postings: async () => [], interviews: briefs.interviews }).find((x) => x.name === "brief_from_invite")!;
  eq(t.effect, "write_own");
  const msg = `can you help me prep? here's the invite:\n${DATADOG.subject}\n${DATADOG.text}`;
  const ctx = (message: string) => ({ userId: "U1", threadId: "T1", now: NOW, state: {} as Record<string, any>, turn: { message, added: [] as string[] } });
  // Text the person did not paste is refused: the model cannot brief an invite it wrote.
  let refused = "";
  try { await t.run({ text: "We would like to invite you to interview at Datadog on October 30 at 9 AM ET." }, ctx(msg)); } catch (e) { refused = String((e as Error).message); }
  assert(/not in the person's message/.test(refused), refused);
  eq(((await t.run({ text: "thanks for the help last week" }, ctx("thanks for the help last week"))) as any).is_invite, false);
  const out = (await t.run({ text: `${DATADOG.subject}\n${DATADOG.text}` }, ctx(msg))) as any;
  eq([out.is_invite, out.kept, out.invite.company, out.invite.when, out.interviewers_note], [true, true, "Datadog", "When: Thursday, October 22, 2026 at 2:00 PM ET.", INTERVIEWER_NOTE]);
  eq(out.texts, inviteBrief(extractInvite({ text: `${DATADOG.subject}\n${DATADOG.text}`, sentAt: NOW }), { now: NOW, postings: [] }).texts, "the same brief as the mail path");
  const [row] = briefs.dump().interviews.U1;
  eq([row.source, row.date, row.starts_at, row.interviewers.map((p) => p.name)], ["chat", "2026-10-22", "2026-10-22T18:00:00.000Z", ["Jane Smith", "Raj Patel"]]);
});

// ------------------------------------------------------------------------------------------------ after the interview
const ivRow = (more: Partial<InterviewRow> = {}): InterviewRow => ({
  ...interviewRow(extractInvite({ ...DATADOG, sentAt: NOW }), { key: "a".repeat(64), source: "mail", ref: "job:7", mail_at: iso(NOW), seen_at: NOW }), ...more,
});
const ddApp = (more: Partial<TrackedApp> = {}): TrackedApp => ({ ref: "job:7", company: "Datadog", role: "Software Engineer", stage: "Interview rounds", source: "queue", applied_at: iso(NOW - 10 * DAY), events: [{ kind: "interview", at: iso(NOW), source: "mail" }], ...more });

Deno.test("WO-034/B9 the thank-you: drafted 90 minutes after the stated start, within 24 hours of it, once; addressed only to the names the invite gave", () => {
  const start = Date.parse("2026-10-22T18:00:00Z");
  eq(interviewDrafts([ivRow()], [ddApp()], start + 30 * MIN).length, 0, "the interview is still going");
  const [d] = interviewDrafts([ivRow()], [ddApp()], start + 2 * HOUR);
  eq([d.kind, d.step, d.key], ["thank_you", "thanks", "thank_you:job:7:after:2026-10-22"]);
  assert(d.text.startsWith("Hello Jane and Raj, thank you for taking the time to speak with me on Oct 22 about the Software Engineer role at Datadog."), d.text);
  eq(interviewDrafts([ivRow()], [ddApp()], start + 90 * MIN + 25 * HOUR).length, 0, "past 24 hours: no late thank-you");
  // A date with no time: due at the end of the interview day in the person's zone, not before.
  const dateOnly = ivRow({ time: null, zone: null, starts_at: null });
  eq(interviewDrafts([dateOnly], [ddApp()], Date.parse("2026-10-22T20:00:00Z")).length, 0, "still the interview day in New York");
  eq(interviewDrafts([dateOnly], [ddApp()], Date.parse("2026-10-23T11:00:00Z"))[0]?.step, "thanks", "the next morning");
  // A rejection or an offer first: nothing.
  eq(interviewDrafts([ivRow()], [ddApp({ stage: "Rejected" })], start + 2 * HOUR).length, 0);
});

Deno.test("WO-034/B10 ghosted after an interview: the thank-you and nudge 7 quiet days after it; not if the employer wrote since", () => {
  const start = Date.parse("2026-10-22T18:00:00Z");
  eq(interviewDrafts([ivRow()], [ddApp()], start + 6 * DAY).length, 0, "6 days: not yet");
  const [n] = interviewDrafts([ivRow()], [ddApp()], start + 7 * DAY);
  eq([n.kind, n.step, n.key], ["thank_you", "nudge", "thank_you:job:7:2026-10-22"]);
  assert(n.text.includes("thank you again for the time with Datadog about the Software Engineer role on Oct 22") && /update on next steps\?$/.test(n.text), n.text);
  eq(interviewDrafts([ivRow()], [ddApp({ events: [{ kind: "interview", at: iso(NOW) }, { kind: "assessment", at: iso(start + 2 * DAY) }] })], start + 7 * DAY).length, 0, "they wrote since");
  // The mail planner's own nudge (7 days after the invite email) steps aside for a dated interview, so there is one, not two.
  eq(followUps([ddApp({ interview_on: "2026-10-22" })], NOW + 8 * DAY).length, 0);
  eq(followUps([ddApp()], NOW + 8 * DAY).map((d) => d.kind), ["thank_you"], "no date stated: 7 days after the invite, as WO-024");
  // An interview the person reported in chat (the tracker) counts as one too.
  const tracked = appsFromTracker([{ app_id: "a1", company: "Linear", stage: "Interview rounds", applied_at: iso(NOW - 20 * DAY), events: [{ type: "applied", at: iso(NOW - 20 * DAY) }, { type: "manual_update", at: iso(NOW - 7 * DAY), stage_after: "Interview rounds" }] }]);
  eq(followUps(tracked, NOW).map((d) => d.kind), ["thank_you"], "ghosted after an interview the person told Trainee about");
});

Deno.test("WO-034/B11 the run drafts the thank-you once, shows it in full, never sends it", async () => {
  const realFetch = globalThis.fetch, seen: string[] = [];
  globalThis.fetch = (async (u: string | URL | Request) => { seen.push(String(u)); return new Response("{}"); }) as typeof fetch;
  try {
    const mail = memoryMailStore({ queue: { U1: [{ id: "7", company: "Datadog", title: "Software Engineer", state: "confirmed", created_at: iso(NOW - 10 * DAY), updated_at: iso(NOW - 10 * DAY) }] },
      events: { U1: [{ hash: "a".repeat(64), ref: "job:7", kind: "interview", company: "Datadog", role: "Software Engineer", stage: "Interview rounds", flagged: false, evidence: "x", at: iso(NOW), new_app: false }] } });
    const briefs = memoryBriefStores({ interviews: { U1: [ivRow()] }, people: [{ user_id: "U1", tz: "America/New_York" }] });
    const outbox = memoryAlertStore();
    const at = Date.parse("2026-10-22T20:00:00Z");
    eq(await runInterviewDrafts({ outbox, now: at, interviews: briefs.interviews, drafts: mail }), 1);
    eq(await runInterviewDrafts({ outbox, now: at + 5 * MIN, interviews: briefs.interviews, drafts: mail }), 0, "once");
    const [o] = outbox.dump().outbox, [d] = mail.dump().drafts.U1;
    eq([o.kind, o.key], ["followup", "followup:thank_you:job:7:after:2026-10-22"]);
    assert(o.text.includes("I drafted a thank-you for you to send; it is not sent:") && o.text.endsWith(d.text), o.text);
    plainText(o.text, "the draft offer");
    eq(seen, [], "nothing sent anywhere");
  } finally { globalThis.fetch = realFetch; }
});

// ------------------------------------------------------------------------------------------------ the digest
const SUN = Date.parse("2026-10-25T22:02:00Z"); // Sunday 18:02 in New York
function digestRows(): DigestRows {
  const ev = (ref: string, kind: StatusEvent["kind"], company: string, stage: string | null, at: number): StatusEvent => ({ hash: `${ref}${kind}`.padEnd(64, "0").slice(0, 64), ref, kind, company, stage, flagged: false, evidence: "x", at: iso(at), new_app: false });
  return {
    queue: [
      { id: "1", company: "Stripe", url: "https://boards.greenhouse.io/stripe/jobs/1", state: "confirmed", created_at: iso(SUN - 3 * DAY), updated_at: iso(SUN - 3 * DAY) },
      { id: "2", company: "Plaid", url: "https://jobs.lever.co/plaid/2", state: "submitted_unconfirmed", created_at: iso(SUN - 2 * DAY), updated_at: iso(SUN - 2 * DAY) },
      { id: "3", company: "Ramp", url: "https://jobs.ashbyhq.com/ramp/3", state: "confirmed", created_at: iso(SUN - 10 * DAY), updated_at: iso(SUN - 10 * DAY) }, // last week
      { id: "4", company: "Notion", url: "https://boards.greenhouse.io/notion/4", state: "failed", created_at: iso(SUN - DAY), updated_at: iso(SUN - DAY) }, // never went
    ],
    tracker: [{ app_id: "t1", company: "Linear", role: "Product Engineer", stage: "Submitted", applied_at: iso(SUN - 4 * DAY), events: [] }],
    mail: [ev("job:3", "rejection", "Ramp", "Rejected", SUN - 2 * DAY), ev("job:1", "received", "Stripe", null, SUN - 3 * DAY)],
    interviews: [{ ...ivRow({ ref: "job:2", company: "Plaid", role: "Data Analyst", date: "2026-10-28", time: "14:00", zone: "America/New_York", starts_at: "2026-10-28T18:00:00.000Z" }) }],
    drafts: [{ key: "followup:job:9", kind: "followup", company: "Acme Robotics", role: null, state: "drafted", created_at: iso(SUN - DAY) }],
    alerts: [{ created_at: iso(SUN - DAY) }, { created_at: iso(SUN - 2 * DAY) }, { created_at: iso(SUN - 9 * DAY) }],
    events: [],
  };
}

Deno.test("WO-034/B12 the digest is built only from rows: this week's counts by source, status changes, interviews, drafts, alerts, the response rate", () => {
  const d = buildDigest(digestRows(), { now: SUN, tz: "America/New_York" })!;
  eq(d.text, [
    "Your weekly job search digest, Oct 18 to Oct 25:",
    "Applications sent: 3 (through Trainee 2: Greenhouse 1, Lever 1; you logged 1).",
    "Confirmations: 1.",
    "Status changes: 1",
    "- Ramp: Rejected, Oct 23 (mail)",
    "Interviews coming up: 1",
    "- Plaid (Data Analyst): Wed, Oct 28, 2:00 PM EDT",
    "https://jobs.lever.co/plaid/2",
    "Drafts waiting for you to send (Trainee never sends them): 1",
    "- follow-up to Acme Robotics",
    "Job alerts sent: 2.",
    "Response rate: 1 of 4 applications on file has had a reply (25%), too few to read much into.",
    `Text "weekly digest off" to stop these, or tell me another day and time.`,
  ].join("\n"));
  plainText(d.text, "digest");
  // Nothing on file: nothing said.
  eq(buildDigest({ queue: [], tracker: [], mail: [], interviews: [], drafts: [], alerts: [], events: [] }, { now: SUN, tz: "America/New_York" }), null);
  // Too much for one text: each list says how many are left and offers the rest, under 1,500 characters.
  const many = digestRows();
  for (let i = 0; i < 60; i++) many.mail.push({ hash: String(i).padStart(64, "0"), ref: `mail:co-${i}`, kind: "interview", company: `Company Number ${i} With A Long Name`, role: "Senior Data Analyst, Platform", stage: "Interview rounds", flagged: false, evidence: "x", at: iso(SUN - DAY), new_app: false });
  const big = buildDigest(many, { now: SUN, tz: "America/New_York" })!;
  assert(big.text.length <= 1500 && /and \d+ more; ask me for the rest\./.test(big.text), big.text);
  assert(big.text.includes("Status changes: 61"), "the count is the whole count");
});

Deno.test("WO-034/B13 the digest goes once a week at the person's day and hour, after quiet hours, and never when turned off", async () => {
  eq(isoWeek("2026-10-25"), "2026-W43");
  const briefs = memoryBriefStores({ rows: { U1: digestRows() }, people: [{ user_id: "U1", tz: "America/New_York" }] });
  const outbox = memoryAlertStore();
  const run = (now: number) => runDigest({ outbox, now, store: briefs.digest });
  eq(await run(SUN - DAY), 0, "Saturday");
  eq(await run(SUN - HOUR), 0, "Sunday 17:02: before the hour");
  eq(await run(SUN + 5 * MIN), 0, "not the hourly check");
  eq(await run(SUN), 1, "Sunday 18:02");
  eq(await run(SUN + HOUR), 0, "said once a week");
  eq(outbox.dump().outbox.map((o) => [o.kind, o.key, o.at]), [["digest", "digest:2026-W43", SUN]]);
  // A digest hour inside quiet hours waits for them to end.
  const late = memoryBriefStores({ rows: { U2: digestRows() }, people: [{ user_id: "U2", tz: "America/New_York", quiet_start: 22, quiet_end: 7 }], digest: { U2: { prefs: { on: true, day: 0, hour: 23 }, tz: "America/New_York" } } });
  const o2 = memoryAlertStore();
  eq(await runDigest({ outbox: o2, now: Date.parse("2026-10-26T03:02:00Z"), store: late.digest }), 1);
  const wake = o2.dump().outbox[0].at;
  assert(wake >= Date.parse("2026-10-26T11:00:00Z") && wake < Date.parse("2026-10-26T11:15:00Z"), `07:00 in New York, got ${iso(wake)}`);
  // Off is off.
  const off = memoryBriefStores({ rows: { U3: digestRows() }, digest: { U3: { prefs: { on: false, day: 0, hour: 18 }, tz: "America/New_York" } } });
  eq(await runDigest({ outbox: memoryAlertStore(), now: SUN, store: off.digest }), 0);
  eq(digestDue({ on: true, day: 5, hour: 9 }, Date.parse("2026-10-23T13:30:00Z"), "America/New_York").due, true, "Friday 9:30");
});

Deno.test("WO-034/B14 set_weekly_digest: off, on, another day and hour, in chat; refuses what is not a day or an hour", async () => {
  const briefs = memoryBriefStores();
  const t = careerTools({ postings: async () => [], digest: briefs.digest }).find((x) => x.name === "set_weekly_digest")!;
  eq(t.effect, "write_own");
  const c = { userId: "U1", threadId: "T1", now: NOW, state: {} };
  eq(((await t.run({ on: false }, c)) as any).digest, { on: false, day: "Sunday", hour: 18, timezone: "America/New_York", quiet_hours: "22:00-7:00" });
  eq(((await t.run({ on: true, day: "fri", hour: 9, timezone: "America/Chicago" }, c)) as any).digest.day, "Friday");
  eq(briefs.dump().digest.U1, { prefs: { on: true, day: 5, hour: 9 }, tz: "America/Chicago" });
  const late = (await t.run({ hour: 23 }, c)) as any;
  assert(/quiet hours/.test(late.note), "a quiet hour is said");
  for (const bad of [{ day: "someday" }, { hour: 25 }, { on: "yes" }]) {
    let err = "";
    try { await t.run(bad, c); } catch (e) { err = String((e as Error).message); }
    assert(err, `refused ${JSON.stringify(bad)}`);
  }
});

// ------------------------------------------------------------------------------------------------ where do I stand
Deno.test("WO-034/B15 where do I stand: each stage with its date and its source (Trainee, tracker or mail)", async () => {
  const apps: TrackedApp[] = [{ ref: "job:1", company: "JPMorgan Chase & Co.", role: "Investment Banking Summer Analyst", stage: "Submitted", source: "queue", applied_at: "2026-10-01T15:00:00Z", events: [] }];
  const events: StatusEvent[] = [{ hash: "h".repeat(64), ref: "job:1", kind: "interview", company: "JPMorgan Chase & Co.", stage: "Interview rounds", flagged: false, evidence: "x", at: "2026-10-18T15:00:00Z", new_app: false }];
  const tool = careerTools({ postings: async () => [], mail: { applications: async () => apps, events: async () => events } }).find((t) => t.name === "where_do_i_stand")!;
  const ctx = { userId: "U1", threadId: "T1", now: NOW, state: { trackStore: { rows: [{ app_id: "t1", company: "JPMorgan Chase", role: "Markets Analyst", stage: "Recruiter screen", applied_at: "2026-10-10T15:00:00Z",
    events: [{ type: "applied", at: "2026-10-10T15:00:00Z" }, { type: "manual_update", at: "2026-10-14T15:00:00Z", stage_after: "Recruiter screen" }] }] } } as Record<string, any> };
  const r = (await tool.run({ company: "JPMorgan" }, ctx)) as any;
  eq(r.history, [
    "JPMorgan Chase & Co. (Investment Banking Summer Analyst): Submitted Oct 1 (Trainee); Interview rounds Oct 18 (mail)",
    "JPMorgan Chase (Markets Analyst): Submitted Oct 10 (tracker); Recruiter screen Oct 14 (tracker)",
  ].join("\n"));
  eq(standing("JPMorgan", apps, events).applications[0].stages, [{ stage: "Submitted", date: "Oct 1", source: "Trainee" }, { stage: "Interview rounds", date: "Oct 18", source: "mail" }]);
});

// ------------------------------------------------------------------------------------------------ the migration
Deno.test("WO-034/B16 the migration: the erase is 20261020120100's plus the two deletes; every outbox kind an earlier migration allows stays", async () => {
  const mine = await Deno.readTextFile(new URL("../../supabase/migrations/20261021050000_career_brief_digest.sql", import.meta.url));
  const before = await Deno.readTextFile(new URL("../../supabase/migrations/20261020120100_career_events_erase.sql", import.meta.url));
  const fn = (s: string) => s.slice(s.indexOf("create or replace function public.career_host_commit"));
  eq(fn(mine).replace("  delete from career_interviews where user_id=p_user;\n  delete from career_digest_prefs where user_id=p_user;\n", ""), fn(before));
  const kinds = [...mine.matchAll(/career_outbox_kind_check check \(kind in \(([^)]*)\)\)/g)].pop()![1];
  for (const k of ["alert", "report", "reply", "receipt", "card", "status", "followup", "mock", "brief", "digest"]) assert(kinds.includes(`'${k}'`), k);
  const keys = /key ~ '\^\(([a-z|]+)\):/.exec(mine)![1].split("|");
  for (const k of ["alert", "report", "reply", "receipt", "card", "status", "followup", "mock", "brief", "digest"]) assert(keys.includes(k), k);
});
