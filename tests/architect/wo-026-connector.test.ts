// WO-026 (architect): the Connector, double-opt-in warm introductions, end to end on fakes. The database half (every
// refusal of connector_propose_for, the redacted read, cascade on delete) is proven in tests/db/career_connector.test.sql;
// the in-memory store here enforces the same rules. Synthetic people only.
import {
  applyFeedback, checkins, connectorEnabled, connectorTurn, factItem, FIT_BAR, followText, type IntroRow,
  memoryConnectorStore, needItem, offerItem, parseConnectorAsk, type Profile, profileFrom, proposalText, proposeNext,
  PROPOSAL_INTENT, CHECKIN_INTENT, INTRO_INTENT, type Role, score,
} from "../../supabase/functions/_shared/career_connector.ts";

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const T = Date.parse("2026-10-20T15:00:00Z");
const H = 3600000;

const P = (user_id: string, role: Role, o: Partial<Profile> = {}): Profile => ({
  user_id, role, verified: false, opted_in: true, paused: false, needs: [], offers: [], facts: [], filters: {}, ...o,
});
const name = (v: string) => ({ id: "name", kind: "name", value: v, source: "career:basics.name" });
const alum = (u: string, first: string, firm = "JPMorgan", school = "University of Michigan") =>
  P(u, "alumni", {
    facts: [factItem("employer", firm, `I work at ${firm}`), factItem("school", school, `I went to ${school}`), name(first)],
    offers: [offerItem("advice", firm, `I can talk to students about ${firm}`)],
  });
const peer = (u: string, first: string) =>
  P(u, "candidate", { facts: [name(first)], needs: [needItem("prep", "analyst", "find me a prep partner for analyst interviews")] });

// The student's own data: what she stated in chat and the master profile Trainee already holds.
const AVA_SOURCES = {
  stated: [
    { kind: "school", value: "University of Michigan", evidence: "I'm a junior at Michigan" },
    { kind: "target_firm", value: "jp morgan", evidence: "I really want JP Morgan" },
    { kind: "target_firm", value: "Lazard" }, // no words of hers and not confirmed: never used
  ],
  career: {
    basics: { name: "Ava Stone" },
    preferences: { targetCompanies: ["Goldman Sachs"], roles: ["investment banking analyst"] },
    facts: [
      { id: "F-003", kind: "education", title: "University of Michigan", status: "confirmed" },
      { id: "F-009", kind: "experience", company: "Draft Capital", needs_confirmation: true, status: "draft" },
    ],
  },
};

function world(o: { profiles?: Profile[]; network?: number; sources?: Record<string, any> } = {}) {
  const clock = { t: T };
  const m = memoryConnectorStore({ profiles: o.profiles, network: o.network ?? 500, sources: o.sources, now: () => clock.t });
  const replies: string[] = [];
  const say = async (u: string, text: string, flag: string | null = "on") => {
    (m.threads[u] ??= []).push({ role: "user", text, intent: null });
    const r = await connectorTurn({ message: text, userId: u, threadId: u, now: clock.t, store: m.store, flag });
    m.threads[u].push({ role: "assistant", text: r?.reply ?? "(the brain answers)", intent: r ? (r.intent ?? "connector_other") : "brain" });
    if (r) replies.push(r.reply);
    return r;
  };
  const inbox = (u: string) => m.outbox.filter((x) => x.to === u);
  return { ...m, clock, say, inbox, replies };
}
// Every reply is a plain short text message: no markdown, one text.
function plainText(all: string[]) {
  for (const r of all) {
    assert(!/[*#`\[\]_]{1}|^\s*[-•]\s/m.test(r.replace(/"[^"]*"/g, "")), `markdown in: ${r}`);
    assert(r.length <= 600, `too long (${r.length}): ${r}`);
  }
}

Deno.test("WO-026/1 the gate: closed without CONNECTOR_ENABLED=on, and nothing is proposed below 500 people", async () => {
  eq([connectorEnabled("on"), connectorEnabled(" ON "), connectorEnabled("true"), connectorEnabled(undefined)], [true, true, false, false]);
  const w = world({ profiles: [alum("ub", "Maya")], network: 0, sources: { ua: AVA_SOURCES } });
  for (const flag of [null, "off", "1"]) {
    const r = await w.say("ua", "connect me with someone at JPM", flag);
    eq(r?.status, "closed", `flag ${flag}`);
    assert(/aren't open yet/.test(r!.reply) && /Nothing about you has been shared/.test(r!.reply), r!.reply);
    eq((await w.say("ua", "join introductions as a student", flag))?.status, "closed");
  }
  eq(await w.store.profile("ua"), null, "nothing was saved while closed");
  // Flag on, 2 people in the network: joining works, nothing is proposed, and the database refuses a proposal.
  const j = await w.say("ua", "join introductions as a student");
  eq(j?.status, "joined");
  assert(/Introductions start once enough people have joined/.test(j!.reply), j!.reply);
  const c = await w.say("ua", "connect me with someone at JPM");
  eq(c?.status, "saved_need");
  assert(c!.reply.startsWith("Saved: you want to meet someone at JPMorgan."), c!.reply);
  eq(w.outbox.length, 0, "nobody was told anything");
  eq(w.rows().intros.length, 0);
  let refused = "";
  try {
    await w.store.propose("ua", "ub", "meet", "x", "y", { a: ["need:meet:jpmorgan"], b: ["employer:jpmorgan"] });
  } catch (e) {
    refused = (e as Error).message;
  }
  eq(refused, "connector_closed");
  plainText(w.replies);
});

Deno.test("WO-026/2 the match profile holds only what the person stated or confirmed, each fact with its source", () => {
  const p = profileFrom(AVA_SOURCES.stated, AVA_SOURCES.career);
  eq(p.facts, [
    { id: "school:university-of-michigan", kind: "school", value: "University of Michigan", source: `chat: "I'm a junior at Michigan"` },
    { id: "target_firm:jpmorgan", kind: "target_firm", value: "JPMorgan", source: `chat: "I really want JP Morgan"` },
    { id: "name", kind: "name", value: "Ava", source: "career:basics.name" },
    { id: "target_firm:goldman-sachs", kind: "target_firm", value: "Goldman Sachs", source: "career:preferences.targetCompanies" },
    { id: "target_role:investment-banking-analyst", kind: "target_role", value: "investment banking analyst", source: "career:preferences.roles" },
  ]);
  assert(!JSON.stringify(p).includes("Lazard"), "a fact with no words of theirs and no confirmation is left out");
  assert(!JSON.stringify(p).includes("Draft Capital"), "a draft fact is left out");
  eq(profileFrom([], null).facts, [], "nothing known, nothing invented");
  eq(profileFrom([{ kind: "year", value: "2027", confirmed: true }], null).facts, [], "only the kinds a match can rest on");
});

Deno.test("WO-026/3 a full introduction: one proposal, nothing named until both say yes, then the intro and times passed along", async () => {
  const w = world({ profiles: [alum("ub", "Maya")], sources: { ua: AVA_SOURCES } });
  await w.say("ua", "join introductions as a student");
  const p = await w.say("ua", "Connect me with someone at JPM.");
  eq(p?.status, "proposed");
  eq(p?.intent, PROPOSAL_INTENT);
  eq(p!.reply,
    "I found an alum you might want to meet. Why: You asked to meet someone at JPMorgan, and they work there and offered to talk about it; they went to University of Michigan too. " +
      "Their name stays private until you both say yes, and nothing about you has been shared. Want the intro? Reply yes or no.");
  const toB = w.inbox("ub");
  eq(toB.length, 1);
  eq(toB[0].intent, PROPOSAL_INTENT);
  assert(/^I found a student you might want to meet\. Why: They want to meet someone at JPMorgan, and you offered to talk about your work there; they go to University of Michigan too\./.test(toB[0].text), toB[0].text);
  for (const t of [p!.reply, toB[0].text]) assert(!/Maya|Ava|Stone|\bua\b|\bub\b/.test(t), `nothing identifying before both yes: ${t}`);
  for (const v of [...await w.store.mine("ua"), ...await w.store.mine("ub")]) eq(v.other_user, null);

  // A yes counts only while the proposal is the thread's last word.
  (w.threads["ua"]).push({ role: "assistant", text: "Here are three jobs.", intent: "brain" });
  eq(await w.say("ua", "yes"), null, "a yes after another reply is not a yes to the intro");
  eq((await w.say("ua", "show my intro"))?.intent, PROPOSAL_INTENT, "the proposal can be shown again");

  const bYes = await w.say("ub", "yes");
  eq(bYes?.status, "waiting");
  assert(!/Ava/.test(bYes!.reply));
  eq((await w.store.mine("ua"))[0].other_user, null, "one yes reveals nothing");
  const both = await w.say("ua", "Yes");
  eq(both?.status, "introduced");
  eq(both?.intent, INTRO_INTENT);
  assert(both!.reply.startsWith("You're connected with Maya, an alum. You both said yes. Why: You asked to meet someone at JPMorgan"), both!.reply);
  assert(/Reply "times" and when you're free/.test(both!.reply) && /Reply "block"/.test(both!.reply), both!.reply);
  const introB = w.inbox("ub").at(-1)!;
  eq(introB.intent, INTRO_INTENT);
  assert(introB.text.startsWith("You're connected with Ava, a student."), introB.text);
  eq((await w.store.mine("ua"))[0].other_user, "ub");
  eq(w.rows().intros[0].state, "introduced");

  // Offer to book: times are passed along, in the person's own words.
  const t1 = await w.say("ua", "times Tue 3pm or Wed noon");
  eq(t1?.status, "times_sent");
  eq(w.inbox("ub").at(-1)!.text, `Ava suggested times: "Tue 3pm or Wed noon". Reply "times" and what works for you, and I'll pass it back.`);
  eq((await w.say("ub", "times: Wed noon works"))?.status, "times_sent");
  assert(w.inbox("ua").at(-1)!.text.startsWith(`Maya suggested times: "Wed noon works".`));
  plainText([...w.replies, ...w.outbox.map((x) => x.text)]);
});

Deno.test("WO-026/4 one side says no: nothing about either person is revealed, and the yes cannot revive it", async () => {
  const cole = P("uc", "candidate", { facts: [name("Cole")], offers: [offerItem("intel", "JPMorgan", "I can share my JPMorgan interviews")] });
  const w = world({ profiles: [cole], sources: { ua: AVA_SOURCES } });
  await w.say("ua", "join introductions as a student");
  const p = await w.say("ua", "connect me with someone who interviewed at JPMorgan");
  eq(p?.status, "proposed");
  assert(/someone who is also job hunting/.test(p!.reply) && /how JPMorgan interviews go/.test(p!.reply), p!.reply);
  eq((await w.say("ua", "yes"))?.status, "waiting");
  const no = await w.say("uc", "no thanks");
  eq(no?.status, "declined");
  eq(no!.reply, "Okay, no intro. Nothing about you was shared.");
  for (const u of ["ua", "uc"]) for (const v of await w.store.mine(u)) eq([v.state, v.other_user], ["declined", null]);
  eq(w.inbox("ua").length, 0, "the one who said yes is not told who said no, or anything");
  assert(!w.inbox("uc").some((x) => /Ava/.test(x.text)), "the one who said no never learns who asked");
  let parties = "";
  try {
    await w.store.parties(w.rows().intros[0].id);
  } catch (e) {
    parties = (e as Error).message;
  }
  eq(parties, "not_both_yes", "names are never read for an intro without both yeses");
  (w.threads["ua"]).push({ role: "assistant", text: proposalText({ why: "x", other_role: "candidate" }), intent: PROPOSAL_INTENT });
  eq((await w.say("ua", "yes"))?.status, "closed_intro");
});

Deno.test("WO-026/5 every why cites real facts from both profiles: no fact, no intro", () => {
  const ava = P("ua", "student", {
    facts: [factItem("school", "University of Michigan", "x"), factItem("target_firm", "Evercore", "x")],
    needs: [needItem("meet", "JPM", "connect me with someone at JPM")],
  });
  const maya = alum("ub", "Maya");
  const s = score(ava, maya)!;
  eq(s.score, 4);
  eq(s.kind, "meet");
  const ids = (p: Profile) => new Set([...p.facts, ...p.needs, ...p.offers].map((x) => x.id));
  for (const r of s.reasons) {
    assert(r.a.length && r.b.length, `${r.kind} cites both sides`);
    for (const x of r.a) assert(ids(ava).has(x), `${x} is Ava's`);
    for (const x of r.b) assert(ids(maya).has(x), `${x} is Maya's`);
    const cited = [...r.a.map((x) => [...ava.facts, ...ava.needs].find((f) => f.id === x)!), ...r.b.map((x) => [...maya.facts, ...maya.offers].find((f) => f.id === x)!)];
    for (const w of [r.why_a, r.why_b]) {
      const named = cited.map((c) => c.value).filter((v) => w.includes(v));
      assert(named.length, `"${w}" names a cited fact`);
      for (const firmOrSchool of ["JPMorgan", "University of Michigan", "Evercore", "Goldman Sachs"]) {
        if (w.includes(firmOrSchool)) assert(cited.some((c) => c.value === firmOrSchool), `"${w}" names ${firmOrSchool} without citing it`);
      }
    }
  }
  // Without the employer fact there is no "they work there", so no match; a shared school alone is no reason to meet.
  eq(score(ava, { ...maya, facts: maya.facts.filter((f) => f.kind !== "employer") }), null);
  eq(score(P("x", "student", { facts: [factItem("school", "University of Michigan", "x")] }), maya), null);
  // The database rule, here too: a cite the profile does not hold is refused.
  const w = memoryConnectorStore({ profiles: [ava, maya], network: 600 });
  return w.store.propose("ua", "ub", "meet", "why a", "why b", { a: ["school:harvard"], b: ["employer:jpmorgan"] }).then(
    () => { throw new Error("must refuse"); },
    (e) => eq((e as Error).message, "missing_cites"),
  );
});

Deno.test("WO-026/6 a block prevents proposals both ways; a report hides the reporter even after both said yes", async () => {
  const w = world({ profiles: [peer("p1", "Pat"), peer("p2", "Sam"), peer("p3", "Lee"), peer("p4", "Kim")] });
  const fst = await w.say("p1", "find me a prep partner for analyst interviews");
  eq(fst?.status, "proposed");
  const other = w.rows().intros[0].b_user;
  const blk = await w.say(other, "block");
  eq(blk?.status, "blocked");
  assert(!/Pat|p1/.test(blk!.reply));
  eq(w.rows().intros[0].state, "declined");
  const people = w.rows().profiles;
  const hist = await w.store.history("p1", w.clock.t);
  const pOther = people.find((p) => p.user_id === other)!, p1 = people.find((p) => p.user_id === "p1")!;
  // Remove the pair's history so only the block stands between them: still never proposed, either way.
  const blocksOnly = { intros: [], blocks: hist.blocks };
  eq(proposeNext(p1, [pOther], blocksOnly, w.clock.t), { none: "no_fit" });
  eq(proposeNext(pOther, [p1], blocksOnly, w.clock.t), { none: "no_fit" });
  for (const [a, b] of [["p1", other], [other, "p1"]]) {
    await w.store.propose(a, b, "prep", "x", "y", { a: ["need:prep:analyst"], b: ["need:prep:analyst"] }).then(
      () => { throw new Error("must refuse"); },
      (e) => eq((e as Error).message, "blocked"),
    );
  }
  // A report, after both said yes: the reported person no longer sees who it was and cannot pass anything along.
  const rest = ["p2", "p3", "p4"].filter((u) => u !== other);
  w.clock.t += 2 * H;
  const r = await w.say(rest[0], "find me a prep partner for analyst interviews");
  eq(r?.status, "proposed");
  const intro = w.rows().intros.at(-1)!;
  const [x, y] = [intro.a_user, intro.b_user];
  await w.say(y, "yes");
  eq((await w.say(x, "yes"))?.status, "introduced");
  eq((await w.say(y, "report them"))?.status, "reported");
  eq(w.rows().blocks.find((b) => b.blocker === y)?.reported, true, "flagged for human review");
  eq((await w.store.mine(x))[0].other_user, null, "the reporter is hidden from the reported person");
  eq(await w.say(x, "times Fri 2pm"), null, "nothing is passed to the person who reported them");
  eq(w.inbox(y).filter((m) => /suggested times/.test(m.text)).length, 0);
});

Deno.test("WO-026/7 at most 3 proposals a week, one at a time, never below the fit bar to hit a number", async () => {
  const people = [peer("x0", "Ari"), ...Array.from({ length: 5 }, (_, i) => peer(`x${i + 1}`, `Peer${i + 1}`)), P("weak", "candidate", { facts: [factItem("school", "University of Michigan", "x")] })];
  const w = world({ profiles: people });
  const seen: string[] = [];
  for (let k = 0; k < 3; k++) {
    const r = await w.say("x0", "find me a prep partner for analyst interviews");
    eq(r?.status, "proposed", `proposal ${k + 1}`);
    const i = w.rows().intros.at(-1)!;
    seen.push(i.b_user);
    const again = await w.say("x0", "find me a prep partner for analyst interviews");
    eq(again?.status, "pending", "one pending proposal at a time");
    await w.say("x0", "show my intro");
    await w.say("x0", "no");
    w.clock.t += H;
  }
  eq(new Set(seen).size, 3, "a pair is never proposed twice");
  const capped = await w.say("x0", "find me a prep partner for analyst interviews");
  eq(capped?.status, "weekly_cap");
  assert(/3 suggestions this week, the most I send/.test(capped!.reply), capped!.reply);
  w.clock.t += 7 * 24 * H;
  eq((await w.say("x0", "find me a prep partner for analyst interviews"))?.status, "proposed", "the next week it proposes again");
  // Nobody above the bar: nothing is proposed, rather than the weak fit.
  const lone = world({ profiles: [P("s", "student", { needs: [needItem("meet", "Evercore", "x")], facts: [factItem("school", "University of Michigan", "x")] }), people.at(-1)!] });
  eq(proposeNext((await lone.store.profile("s"))!, await lone.store.candidates("s"), { intros: [], blocks: [] }, T), { none: "no_fit" });
  assert(FIT_BAR === 3);
});

Deno.test("WO-026/8 follow-through: a 72-hour check-in, one nudge, then recorded; a stalled proposal is nudged once", () => {
  const iso = (h: number) => new Date(T + h * H).toISOString();
  const intro = (o: Partial<IntroRow>): IntroRow => ({ id: "i", a_user: "a", b_user: "b", kind: "meet", state: "introduced", proposed_at: iso(-1), intro_at: iso(0), ...o });
  eq(checkins([intro({})], T + 71 * H), [], "nothing before 72 hours");
  eq(checkins([intro({})], T + 72 * H), [{ intro_id: "i", step: "checkin", to: ["a", "b"] }]);
  eq(checkins([intro({ checkin_at: iso(72) })], T + 100 * H), [], "nothing between the check-in and its nudge");
  eq(checkins([intro({ checkin_at: iso(72) })], T + 144 * H), [{ intro_id: "i", step: "checkin_nudge", to: ["a", "b"] }]);
  eq(checkins([intro({ checkin_at: iso(72), checkin_nudge_at: iso(144) })], T + 200 * H), [], "never a second nudge");
  eq(checkins([intro({ checkin_at: iso(72), checkin_nudge_at: iso(144) })], T + 216 * H), [{ intro_id: "i", step: "no_reply", to: [] }]);
  eq(checkins([intro({ state: "met", checkin_at: iso(72) })], T + 400 * H), [], "answered: nothing more");
  // A proposal one side has not answered: one nudge to that side only, then it expires and the yes side is told.
  const prop = intro({ state: "a_yes", proposed_at: iso(0), intro_at: null });
  eq(checkins([prop], T + 72 * H), [{ intro_id: "i", step: "nudge", to: ["b"] }]);
  eq(checkins([{ ...prop, nudge_at: iso(72) }], T + 100 * H), [], "one nudge only");
  eq(checkins([{ ...prop, nudge_at: iso(72) }], T + 144 * H), [{ intro_id: "i", step: "expire", to: ["a"] }]);
  assert(/Did you and Maya get to talk\?/.test(followText("checkin", "Maya")));
  assert(/I won't ask again/.test(followText("checkin_nudge", null)));
  assert(!/Maya|name/.test(followText("nudge", "Maya")), "a nudge before both yes names nobody");
});

Deno.test("WO-026/9 feedback changes the person's filter and the next proposal", async () => {
  const ava = P("ua", "student", {
    facts: [factItem("school", "University of Michigan", "x"), name("Ava")],
    needs: [needItem("meet", "JPMorgan", "x"), needItem("intel", "JPMorgan", "x")],
  });
  const cole = P("uc", "candidate", { facts: [name("Cole")], offers: [offerItem("intel", "JPMorgan", "x")] });
  const w = world({ profiles: [ava, alum("ub", "Maya"), alum("ud", "Dev"), cole] });
  const first = await w.say("ua", "connect me with someone at JPMorgan");
  eq(first?.status, "proposed");
  const i1 = w.rows().intros[0];
  eq([i1.b_user, i1.kind], ["ub", "meet"], "the alum fits best first");
  await w.say("ub", "yes");
  await w.say("ua", "yes");
  // The scheduled check-in asks; the answer is read only while it is the last word.
  w.threads["ua"].push({ role: "assistant", text: followText("checkin", "Maya"), intent: CHECKIN_INTENT });
  const fb = await w.say("ua", "we met, it was not useful");
  eq(fb?.status, "feedback");
  eq(fb!.reply, "Thanks for saying so. I'll suggest different kinds of intros.");
  const me = (await w.store.profile("ua"))!;
  eq(me.filters, { avoid_kinds: ["meet"], prefer_kinds: [], not_useful_roles: { alumni: 1 } });
  eq(w.rows().intros[0].state, "met");
  // The same ask again: the other alum would have come next, and now the candidate who offered interview notes does.
  w.clock.t += H;
  const next = proposeNext(me, await w.store.candidates("ua"), await w.store.history("ua", w.clock.t), w.clock.t);
  assert(!("none" in next), JSON.stringify(next));
  eq([next.b.user_id, next.kind], ["uc", "intel"]);
  const before = proposeNext({ ...me, filters: {} }, await w.store.candidates("ua"), await w.store.history("ua", w.clock.t), w.clock.t);
  assert(!("none" in before) && before.b.user_id === "ud", "without the feedback, the other alum was next");
  // Useful is preferred; two not-useful intros with the same kind of person stop that kind; not meeting changes nothing.
  eq(applyFeedback({}, { met: true, useful: true, kind: "intel", other_role: "candidate" }), { prefer_kinds: ["intel"], avoid_kinds: [] });
  const twice = applyFeedback(me.filters, { met: true, useful: false, kind: "meet", other_role: "alumni" });
  eq(twice.exclude_roles, ["alumni"]);
  eq(applyFeedback(me.filters, { met: false, useful: null, kind: "meet", other_role: "alumni" }), me.filters);
  eq(applyFeedback({ min_score: 1 }, { met: true, useful: true, kind: "meet", other_role: "alumni" }).min_score, undefined, "the bar never moves down");
});

Deno.test("WO-026/10 a mentor or recruiter is matched only once verified", async () => {
  const mentor = { ...alum("um", "Rae"), role: "mentor" as Role, facts: [...alum("um", "Rae").facts, factItem("target_firm", "Evercore", "x")] };
  const ava = P("ua", "student", { facts: [factItem("school", "University of Michigan", "x"), factItem("target_firm", "Evercore", "x")], needs: [needItem("meet", "JPMorgan", "x")] });
  const w = world({ profiles: [ava, mentor, alum("ub", "Maya")] });
  eq(score(ava, mentor)!.score, 5, "the mentor fits better");
  const p = proposeNext(ava, await w.store.candidates("ua"), { intros: [], blocks: [] }, T);
  assert(!("none" in p) && p.b.user_id === "ub", "but an unverified mentor is never proposed");
  await w.store.propose("ua", "um", "meet", "x", "y", { a: ["need:meet:jpmorgan"], b: ["employer:jpmorgan"] }).then(
    () => { throw new Error("must refuse"); },
    (e) => eq((e as Error).message, "unverified"),
  );
  w.verify("um");
  const q = proposeNext(ava, await w.store.candidates("ua"), { intros: [], blocks: [] }, T);
  assert(!("none" in q) && q.b.user_id === "um");
  const join = await w.say("um2", "join introductions as a recruiter");
  assert(/checked by our team before anyone is matched/.test(join!.reply), join!.reply);
  eq((await w.store.profile("um2"))!.verified, false);
});

Deno.test("WO-026/11 no directory, no search by name, never the word stop, and only its own texts", async () => {
  const w = world({ profiles: [alum("ub", "Maya")], sources: { ua: AVA_SOURCES } });
  for (const t of ["connect me with Maya Chen", "introduce me to John"]) eq((await w.say("ua", t))?.status, "no_directory", t);
  for (const t of ["show me all the mentors", "list people at JPMorgan", "who else is on trainee"]) eq((await w.say("ua", t))?.status, "no_directory", t);
  assert(/I don't look people up by name/.test(w.replies[0]));
  for (const t of ["stop", "STOP", "quit", "cancel", "end", "yes", "no", "block", "we met", "times Tue 3pm", "find me jobs at JPMorgan",
    "I work at Google and need a new job", "I work at Google", "I can talk to students about Google"]) {
    eq(await w.say("ua", t), null, t);
  }
  eq(parseConnectorAsk("connect me with someone at jp morgan."), { kind: "connect", need: "meet", value: "JPMorgan" });
  eq(parseConnectorAsk("Can you connect me with an alum at Acme Capital?"), { kind: "connect", need: "meet", value: "Acme Capital" });
  eq(parseConnectorAsk("get me a referral at Goldman"), { kind: "connect", need: "referral", value: "Goldman Sachs" });
  eq(parseConnectorAsk("find me a study partner for consulting case interviews"), { kind: "connect", need: "prep", value: "consulting case" });
  eq(parseConnectorAsk("I can talk to students about my work at Evercore"), { kind: "offer", offer: "advice", value: "Evercore" });
  eq(parseConnectorAsk("join introductions as an alum"), { kind: "join", role: "alumni" });
  eq(parseConnectorAsk("leave introductions"), { kind: "leave" });
  eq(parseConnectorAsk("block and report this person"), { kind: "block", report: true });
  eq(parseConnectorAsk("we didn't meet"), { kind: "feedback", met: false, useful: null });
  eq(parseConnectorAsk("we met, super helpful"), { kind: "feedback", met: true, useful: true });
  // Joining first: a request before opting in stores nothing.
  eq((await w.say("ua", "connect me with someone at JPM"))?.status, "join_first");
  eq(await w.store.profile("ua"), null);
  // Leaving clears the profile.
  await w.say("ua", "join introductions as a student");
  await w.say("ua", "connect me with someone at JPM");
  const left = await w.say("ua", "leave introductions");
  eq(left?.status, "left");
  const gone = (await w.store.profile("ua"))!;
  eq([gone.opted_in, gone.needs, gone.facts], [false, [], []]);
  eq((await w.store.mine("ua"))[0].state, "expired", "the waiting proposal closed with it");
  plainText(w.replies);
});

Deno.test("WO-026/12 onboarding an alum: what they offer and where they work, each saved in their words and restated", async () => {
  const w = world({ sources: { ue: { stated: [], career: { basics: { name: "Eli Park" } } } } });
  const j = await w.say("ue", "join introductions as an alum");
  eq(j?.status, "joined");
  assert(j!.reply.startsWith("You're in as an alum. Your match profile has nothing yet. Only you can see it"), j!.reply);
  const off = await w.say("ue", "I can talk to students about Goldman");
  eq(off?.status, "saved_offer");
  eq(off!.reply, `Saved: you can talk with people about Goldman Sachs. To be matched on it, tell me "I work at Goldman Sachs" if you do or did.`);
  eq((await w.say("ue", "I work at Goldman Sachs"))?.status, "saved_fact");
  const p = (await w.store.profile("ue"))!;
  eq(p.offers, [{ id: "offer:advice:goldman-sachs", kind: "advice", value: "Goldman Sachs", source: `chat: "I can talk to students about Goldman"` }]);
  eq(p.facts.map((f) => [f.id, f.source]), [["name", "career:basics.name"], ["employer:goldman-sachs", `chat: "I work at Goldman Sachs"`]]);
  // Said anywhere else, "I work at X" stays with the rest of Trainee.
  w.threads["ue"].push({ role: "assistant", text: "Here are three jobs.", intent: "brain" });
  eq(await w.say("ue", "I work at Evercore"), null);
});
