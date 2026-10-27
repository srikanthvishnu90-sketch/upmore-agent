// PEOPLE FINDING (D-033), the turn's guards over an in-memory store (the database's rules mirrored: a file replaces the
// export, a person once per source, the approval only of the exact stored text). Fast, so every guard's mutation can be
// shown red here; tests/architect/flow-people-finding.test.ts proves the same chain on real Postgres at the real handler.
import nodeAssert from "node:assert/strict";
import { type Intro, type PeopleDeps, type PeopleStore, peopleTurn, type PersonRec, type Prefs, supabasePeopleStore } from "../../supabase/functions/_shared/career_people.ts";
import { zipOf } from "./people-finding-fixtures.ts";
import { memoryOutreachStore } from "../../supabase/functions/_shared/career_outreach.ts";

function assert(v: unknown, m?: string): asserts v { nodeAssert.ok(v, m); }
const eq = (a: unknown, b: unknown, m?: string) => nodeAssert.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname;
const FIXTURE = await Deno.readTextFile(`${ROOT}tests/fixtures/people/Connections.csv`);
const U = "u-1", V = "u-2", T = "t-1";
const NOW = Date.parse("2026-10-26T18:00:00Z");

function memoryStore(): PeopleStore & { rows: (PersonRec & { user_id: string })[]; introsOf: Intro[] & { user_id?: string }[] } {
  let id = 0;
  const rows: (PersonRec & { user_id: string; dedupe_key: string })[] = [];
  const intros: (Intro & { user_id: string })[] = [];
  const prefs = new Map<string, Prefs>();
  return {
    rows, introsOf: intros as any,
    async importRows(u, source, file, _sha, rs, _read, _skipped, replace) {
      let replaced = 0;
      if (replace) for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === u && rows[i].source === source) { rows.splice(i, 1); replaced++; }
      let inserted = 0;
      for (const r of rs as any[]) {
        if (rows.some((x) => x.user_id === u && x.source === source && x.dedupe_key === r.dedupe_key)) continue;
        rows.push({ id: ++id, user_id: u, source, name: r.name ?? null, email: r.email ?? null, company: r.company ?? "", company_key: r.company_key ?? "", position: r.position ?? "", school: r.school ?? "",
          connected_on: r.connected_on ?? null, last_seen_at: r.last_seen_at ?? null, source_ref: r.source_ref, source_url: r.source_url ?? null, retrieved_at: new Date(NOW).toISOString(), dedupe_key: r.dedupe_key });
        inserted++;
      }
      const mine = rows.filter((x) => x.user_id === u && x.source === source);
      return { inserted, duplicates: rs.length - inserted, kept: mine.length, with_email: mine.filter((x) => x.email).length, replaced };
    },
    async counts(u) { const c: Record<string, number> = {}; for (const r of rows) if (r.user_id === u) c[r.source] = (c[r.source] ?? 0) + 1; return c; },
    async atCompany(u, key) { return rows.filter((r) => r.user_id === u && key && r.company_key === key); },
    async named(u, n) { const w = n.toLowerCase(); const ex = rows.filter((r) => r.user_id === u && r.name?.toLowerCase() === w); return ex.length || w.includes(" ") ? ex : rows.filter((r) => r.user_id === u && r.name?.toLowerCase().startsWith(`${w} `)); },
    async setSchool(u, ids, school) { let n = 0; for (const r of rows) if (r.user_id === u && ids.includes(r.id!)) { r.school = school; n++; } return n; },
    async forget(u, sources) { let n = 0; for (let i = rows.length - 1; i >= 0; i--) if (rows[i].user_id === u && sources.includes(rows[i].source as any)) { rows.splice(i, 1); n++; } return n; },
    async prefs(u) { return prefs.get(u) ?? { export_asked_at: null, paste_header: null, paste_file: null, paste_at: null }; },
    async setPrefs(u, p) { prefs.set(u, { ...(prefs.get(u) ?? { export_asked_at: null, paste_header: null, paste_file: null, paste_at: null }), ...p }); },
    async saveJobs() { return 0; }, async jobs() { return []; }, async forgetJobs() { return 0; },
    async intros(u) { return intros.filter((i) => i.user_id === u).map((i) => ({ ...i })); },
    async intro(u, n) { const i = intros.find((x) => x.user_id === u && x.n === n); return i ? { ...i } : null; },
    async addIntro(u, i) {
      const n = Math.max(0, ...intros.filter((x) => x.user_id === u).map((x) => x.n)) + 1;
      const row = { ...i, id: n, n, user_id: u, status: "drafted", status_source: null, approved_hash: null, approved_at: null, sent_at: null, follow_up_days: null, follow_up_at: null, reminded_at: null, created_at: new Date(NOW).toISOString() } as Intro & { user_id: string };
      intros.push(row); return { ...row };
    },
    async updateIntro(u, n, patch, onlyIf) {
      const i = intros.find((x) => x.user_id === u && x.n === n);
      if (!i || (onlyIf?.status && !onlyIf.status.includes(i.status)) || (onlyIf?.payload_hash && i.payload_hash !== onlyIf.payload_hash)) return null;
      if (patch.status === "approved" && patch.approved_hash !== (patch.payload_hash ?? i.payload_hash)) throw new Error("check constraint: approved_hash = payload_hash");
      Object.assign(i, patch); return { ...i };
    },
    async forgetIntros(u) { const n = intros.filter((x) => x.user_id === u).length; for (let k = intros.length - 1; k >= 0; k--) if (intros[k].user_id === u) intros.splice(k, 1); return n; },
  };
}
let calls = 0;
const model = async (p: any) => {
  calls++;
  const user = String(p.messages[0].content), first = /- name: (\S+)/.exec(user)?.[1] ?? "there";
  const topic = /ASK ABOUT[^\n]*\n- (.+)/.exec(user)?.[1] ?? "";
  const intro = /^an introduction to ([^,;]+)/.exec(topic);
  const text = intro ? `Subject: An introduction\n\nHi ${first},\n\nWould you be open to an introduction to ${intro[1]}? A short note you can forward is below.` : `Subject: A quick question\n\nHi ${first},\n\nWould you be open to a short call?`;
  return { content: [{ type: "text", text }], stop_reason: "end_turn" };
};
const facts = [{ id: "F-001", kind: "experience", text: "Data analyst intern at Acme Corp", status: "confirmed" }, { id: "F-002", kind: "education", text: "DePaul University, BS Finance", status: "confirmed" }];
function setup(o: { gmailToken?: string | null } = {}) {
  const store = memoryStore();
  const deps: PeopleDeps = { store, gmail: { fetch: (async () => new Response("{}", { status: 500 })) as typeof fetch, token: async () => o.gmailToken ?? null }, fetch: (async () => new Response("no", { status: 599 })) as typeof fetch };
  const out = memoryOutreachStore();
  const state: Record<string, unknown> = { profile: { facts } };
  const say = (message: string, extra: { user?: string; now?: number; attachments?: any[]; state?: Record<string, unknown>; noModel?: boolean } = {}) =>
    peopleTurn({ message, userId: extra.user ?? U, threadId: T, now: extra.now ?? NOW, state: extra.state ?? state, attachments: extra.attachments, store: out, model: extra.noModel ? null : model, people: deps });
  return { store, state, say };
}

Deno.test("people turn: only earlier lists, no export, no Gmail: the networking turn answers, as before", async () => {
  const { say } = setup();
  const listed = { profile: { facts }, contacts: [{ file: "contacts.csv", row: 1, name: "Maya Chen", email: "maya@stripe.example", firm: "Stripe", firm_raw: "Stripe", company: "Stripe", title: "", school: "", connected_on: null }] };
  eq(await say("who do I know at Stripe?", { state: listed }), null);
  eq(await setup().say("who do I know at Stripe?", { state: {}, user: V }).then((r) => r?.status), "no_contacts", "nothing at all: the export is asked for");
});

Deno.test("people turn: the export is asked for once, then pointed back to", async () => {
  const { say, store } = setup();
  const one = await say("who do I know at Ramp?");
  assert(/1\) on LinkedIn/.test(one!.reply), one!.reply);
  assert((await store.prefs(U)).export_asked_at);
  const two = await say("who do I know at Ramp?");
  assert(/steps are in my earlier message/.test(two!.reply) && !/1\) on LinkedIn/.test(two!.reply), two!.reply);
});

Deno.test("people turn: a paste in parts joins only within the hour and only rows shaped like the export", async () => {
  const { say, store } = setup();
  const lines = FIXTURE.split("\r\n"), h = lines.findIndex((l) => l.startsWith("First Name"));
  eq((await say([lines[h], lines[h + 1]].join("\n")))!.status, "imported");
  eq((await say([lines[h + 2], lines[h + 3]].join("\n")))!.status, "imported");
  eq(store.rows.length, 3);
  eq(await say(["Name,Company", "Maya Chen,Stripe"].join("\n")), null, "a different list is the contacts importer's");
  eq(await say("some,thing\nother,thing"), null, "rows that aren't the export's shape are not taken");
  eq(await say("a,b,c,d,e,f,g\nh,i,j,k,l,m,n"), null, "seven columns, but not connections rows");
  eq(await say("Kai,Lo,https://www.linkedin.com/in/kai-lo,,Ramp\nMo,Li,https://www.linkedin.com/in/mo-li,,Ramp"), null, "connections rows of another width");
  eq(await say([lines[h + 4], lines[h + 5]].join("\n"), { now: NOW + 2 * 3600_000 }), null, "past the hour, a headerless part is not read");
  eq(store.rows.length, 3);
});

Deno.test("people turn: the drafter's copy in the thread: a new file replaces every earlier copy of the export", async () => {
  const { say, state, store } = setup();
  await say("here", { attachments: [{ name: "Connections.csv", mime: "text/csv", text: FIXTURE }] });
  const zip = await zipOf([{ name: "Connections.csv", data: new TextEncoder().encode(FIXTURE) }]);
  let bin = ""; for (const b of zip) bin += String.fromCharCode(b);
  eq((await say("zip", { attachments: [{ name: "export.zip", mime: "application/zip", text: btoa(bin) }] }))!.status, "imported");
  eq((state.contacts as unknown[]).length, 8);
  const both = await say("both", { attachments: [{ name: "Connections.csv", mime: "text/csv", text: FIXTURE }, { name: "friends.csv", mime: "text/csv", text: "Name,Company,Email\nMo Li,Plaid,mo@plaid.example\n" }] });
  nodeAssert.match(both!.reply, /\nfriends\.csv: not read in this message\. Send it on its own and I'll import it\.$/, "a second list is never dropped silently");
  const all = await say("forget my contacts");
  eq([all!.status, all!.reply], ["forgotten", "Deleted all the people you gave me: 8 people from your LinkedIn export, Gmail and pages, and 8 rows from this chat's list. Deleted 0 intro requests."]);
  eq([store.rows.length, (state.contacts as unknown[]).length], [0, 0]);
});

Deno.test("people turn: a school is kept only for someone on their list; alumni needs a school", async () => {
  const { say, store } = setup();
  await say("here", { attachments: [{ name: "Connections.csv", mime: "text/csv", text: FIXTURE }] });
  eq(await say("Bob Nobody went to MIT"), null, "no such contact: not ours, nothing saved");
  eq((await say("Priya Shah went to DePaul"))!.status, "saved");
  eq(store.rows.find((r) => r.name === "Priya Shah")!.school, "DePaul");
  const none = setup();
  eq((await none.say("alumni at Ramp", { state: {} }))!.status, "no_school");
  eq((await say("alumni at Ramp"))!.status, "listed", "their confirmed education is the school");
});

Deno.test("people turn: intros: one draft per double tap, exact-text approval, cancelled stays cancelled, wrong person, reminders only when asked and once", async () => {
  const { say, store } = setup();
  await say("here", { attachments: [{ name: "Connections.csv", mime: "text/csv", text: FIXTURE }] });
  calls = 0;
  const d = await say("get me an intro to Maya Chen at Ramp");
  // Maya isn't in their contacts and no page names her: a mutual at Ramp is the path; named only as they typed her
  eq(d!.status, "drafted", d!.reply);
  eq(calls, 2);
  eq((await say("get me an intro to Maya Chen at Ramp"))!.reply.startsWith("Intro 1 is already drafted"), true);
  eq([calls, store.introsOf.length], [2, 1], "a double tap: no second draft, no second model call");
  // the stored text changed after it was shown: not approved
  const saved = store.introsOf[0] as any;
  const body = saved.body; saved.body = `${body} (changed)`;
  eq((await say("approve intro 1"))!.status, "refused");
  eq([saved.status, saved.approved_hash], ["drafted", null]);
  saved.body = body;
  eq((await say("approve intro 1"))!.status, "approved");
  eq(saved.approved_hash, saved.payload_hash);
  const at = saved.approved_at;
  eq((await say("approve intro 1"))!.status, "approved");
  eq(saved.approved_at, at, "a second yes is the same approval");
  eq((await say("approve intro 1", { user: V }))!.status, "not_found", "another person's intro is never theirs");
  eq((await say("intro 1 replied"))!.status, "refused", "replied before sent is refused");
  eq(saved.follow_up_at, null);
  eq((await say("intro 1 sent"))!.status, "sent");
  eq(saved.follow_up_at, null, "no reminder nobody asked for");
  eq((await say("remind me in 2 days"))!.status, "reminder_set");
  const later = Date.parse(saved.follow_up_at) + 60_000;
  const due = await say("my intros", { now: later });
  assert(/^Reminder you asked for: intro 1/.test(due!.reply), due!.reply);
  const again = await say("my intros", { now: later + 60_000 });
  assert(!/Reminder you asked for/.test(again!.reply), "reminded once");
  eq((await say("cancel intro 1"))!.status, "cancelled");
  const stays = await say("approve intro 1");
  eq(stays!.status, "refused"); nodeAssert.match(stays!.reply, /^Intro 1 was cancelled/, "a cancelled intro stays cancelled");
  // without the model switched on: the path is said, nothing is drafted
  calls = 0;
  const off = await say("get me an intro to Jordan Lee at Ramp", { noModel: true });
  eq([off!.status, calls, store.introsOf.length], ["drafting_off", 0, 1]);
});

Deno.test("people turn: forget reads back; a delete that left rows behind is never reported as done", async () => {
  // A client whose delete answers success but removes nothing: the read-back finds the rows and the turn says so.
  const chain = (table: string, op: string[] = []): any => {
    const b: any = new Proxy({}, { get: (_t, k) => {
      if (k === "then") return (ok: any) => ok(op.includes("delete") ? { data: [], error: null } : op.includes("rpc") ? { data: {}, error: null } : { data: table === "career_people" ? [{ id: 1 }] : [], error: null });
      return (..._a: unknown[]) => chain(table, [...op, String(k)]);
    } });
    return b;
  };
  const admin = { from: (t: string) => chain(t), rpc: () => Promise.resolve({ data: {}, error: null }) };
  const r = await peopleTurn({ message: "forget my LinkedIn contacts", userId: U, threadId: T, now: NOW, state: {}, store: memoryOutreachStore(), model: null,
    people: { store: supabasePeopleStore(admin), gmail: null, fetch } });
  eq(r!.status, "error", r!.reply);
  assert(!/Deleted/.test(r!.reply) && /can't confirm that anything was read, saved or deleted/.test(r!.reply), r!.reply);
});
