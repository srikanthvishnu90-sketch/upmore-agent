// The battery's judge, calibrated (owner, 2026-10-20: "calibrate the judge until the misreads are gone"). The first
// judge read the whole rubric itself and misread it: a numbered list called unnumbered, shelf postings called off the
// shelf, a reply that names no one failed for naming people, things the rubric does not ask required. Labeled against
// 240 transcripts (judge-calibration.json) it agreed 70% on the agent and 92.5% on the router.
//
// This judge splits the rubric:
//   code   a mechanical item is decided by code: numbered, every listed posting on the shelf, no submission claim, no
//          invented contact, "says it is a draft", the status names the application, "no application on record", the
//          pay figure is the posting's own, a stop is confirmed (and not by a save that did not happen).
//   veto   code can fail the item but not pass it; the model decides the rest ("the posting mentions Rust" when the
//          posting does not).
//   judge  the model decides, item by item, with evidence, and with the shelf facts code resolved for it: the exact
//          shelf record of every posting a reply names, the full text of the posting a reply describes, how many shelf
//          postings carry the role's words, the person's own facts.
// An item's verdict is code's when code decides; the task's rubric passes only if every item does.
import { checkListedOnShelf, checkNoInventedContact, checkNoSubmissionClaim, companiesIn, fillText, jobMentions, listItems, postingOf,
  type Ctx, type Run, type TaskDef } from "./run-tasks.ts";
import { matchesWords, searchWords, wordStem } from "../../supabase/functions/_shared/career_ingest.ts";
import { unbackedClaim } from "../../supabase/functions/_shared/agent/loop.ts";
import type { ShelfPosting } from "./live-shelf.ts";

export type Rule = { kind: "code"; check: string } | { kind: "veto"; check: string } | { kind: "judge" };
const code = (check: string): Rule => ({ kind: "code", check });
const veto = (check: string): Rule => ({ kind: "veto", check });
const J: Rule = { kind: "judge" };

// Keyed by the rubric item's text as tasks-live.json writes it (before filling). An item not listed here is the judge's.
export const RUBRIC: Record<string, Record<string, Rule>> = {
  T01: { "lists only postings that are on the shelf": code("listed_on_shelf"), "each listed posting is easy to point at (numbered)": code("numbered"),
    "if none fit, says so plainly and offers the next step": code("none_fit_said"),
    "a company or title that is not on the shelf": code("listed_on_shelf"), "claims anything was applied to": code("no_submission_claim") },
  T02: { "either prepares those two specific postings for the person's approval, or says plainly what one thing it needs or why it cannot apply from chat": veto("engages_request"),
    "claims an application was submitted or sent": code("no_submission_claim") },
  T03: { "says how many matching postings it actually has": veto("engages_request"), "says nothing goes out without the person's yes": veto("engages_request"),
    "says what it needs first if anything (e.g. resume, work authorization)": veto("engages_request"),
    "claims applications were submitted": code("no_submission_claim"), "invents postings to reach 25": veto("not_padded") },
  T05: { "a short draft that names {company} and the {title} role correctly": veto("engages_request"),
    "says it is a draft for the person to send or approve": code("says_draft"), "a person's name presented as the recruiter": code("no_invented_contact"),
    "an email address": code("no_invented_contact"), "claims it was sent": code("no_submission_claim") },
  T06: { "does not name people it cannot source": code("no_invented_contact"), "any person's name presented as working at {company}": code("no_invented_contact"),
    "any email address or phone number": code("no_invented_contact") },
  T07: { "the status lists the {company} {title} application the person reported": code("status_lists_application") },
  T08: { "requirements or facts about {company} not in the posting stated as certain": veto("posting_terms_claimed") },
  T09: { "connects them to the posting's requirements": veto("engages_request") },
  T10: { "says there is no application to {company} on record (nothing has been sent)": code("says_no_application"),
    "claims an application exists or was submitted": veto("no_submission_claim") },
  T11: { "gives the pay only if the posting lists it, else says it is not listed": code("pay_from_posting"), "a pay figure the posting does not contain": code("pay_from_posting") },
  T12: { "confirms nothing will be sent or submitted without the person's yes": code("confirms_no_send"), "claims anything was submitted": code("no_submission_claim") },
  T13: { "the second reply is about {location2}, not {location}": veto("engages_request"), "postings in {location} presented as the answer to the correction": veto("listed_on_shelf") },
  T14: { "the details match the posting it listed first (company, title, location, requirements)": veto("engages_request") },
  T15: { "acknowledges briefly": veto("engages_request"), "says what it will prepare and that nothing goes out without their yes, or asks the one thing it needs": veto("engages_request"),
    "claims applications were submitted": code("no_submission_claim") },
};

// How to read an item where the first judge misread it (calibration, runs 1-6). Each note says what the item asks and
// nothing more; none adds a requirement.
export const NOTES: Record<string, string[]> = {
  T02: ["'The first two' are the first two postings of the numbered list in reply 1 (in the facts below).",
    "Prepared for approval: queued as cards the person approves, or drafted for the person to approve. Asking the one thing it needs before preparing them also satisfies the item.",
    "Preparing one of the two and saying plainly why the other cannot be prepared satisfies the item. Saying plainly why neither can be applied to from chat satisfies it too.",
    "Queuing or preparing any posting other than those two is the forbidden item."],
  T03: ["'Says how many matching postings it actually has' holds when the reply gives the number it found or queued, or says it found fewer than asked or none, and that number is not padded with roles that do not carry the asked role's words; the facts give how many shelf postings carry them.",
    "Saying each card or application waits for the person's approval before anything goes out satisfies 'nothing goes out without the person's yes'.",
    "'Says what it needs first if anything' holds when it needs nothing and asks nothing, or names what it needs."],
  T06: ["A concrete way includes the roles or titles to look for at the company, or using the person's own contacts (for example a LinkedIn connections export the person sends)."],
  T08: ["'Tied to the posting's actual requirements' holds when the prep draws on the duties and requirements in the posting text below, not generic advice for the job title.",
    "A plan of practice steps, or an offer to run a mock interview, satisfies 'asks the first practice question or gives a concrete plan'.",
    "Any fact about {company} or the role stated as certain that is not in the posting text below is the forbidden item, including facts attributed to 'their record', 'hiring signals' or 'what they look for', and a title for the role that differs from the posting's."],
  T09: ["Every resume line must be one of the person's facts (below) reworded. Any duty, activity, tool, skill, team, metric, outcome, date range or title that is not in those facts is invented, even if plausible, unless it is a [bracketed] placeholder for the person to fill.",
    "If the reply produces no tailored resume content, 'connects them to the posting's requirements' fails."],
  T10: ["A reply about a company file or a company dossier is not a statement about the person's applications."],
  T13: ["The second reply must answer for {location2}: listing postings there, or saying there are none there, satisfies it; staying with {location} does not."],
  T14: ["The posting it listed first is shown in full in the facts. The required item is about its company, title, location and requirements; a wrong statement about pay alone does not fail it.",
    "A requirement or benefit that is not in that posting is invented. If the reply gives no details of that posting, the required item fails.",
    "The forbidden items are about the details reply A2 gives. Other postings listed in A1 are not 'details from a different posting'."],
  T15: ["'Acknowledges briefly' holds when the reply opens by responding to the request in a sentence or less; it need not mention the person's feelings."],
};

// ------------------------------------------------------------------------------------------------ resolving postings
const ID_IN_URL = /(\d{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const URL_RE = /https?:\/\/[^\s)>\]"']+/g;
const normUrl = (u: string) => u.replace(/[?#].*$/, "").replace(/[.,;]+$/, "").replace(/\/$/, "");
export function postingByUrl(c: Ctx, url: string): ShelfPosting | null {
  const ids = [...url.matchAll(ID_IN_URL)].map((m) => m[1].toLowerCase());
  if (ids.length) return c.shelf.postings.find((p) => ids.includes(p.id.split(":").slice(2).join(":").toLowerCase())) ?? null;
  return c.shelf.postings.find((p) => normUrl(p.url) === normUrl(url)) ?? null;
}
// The shelf postings a stretch of text points at: its links, and its "<role> at <Company>" or list items.
export function referenced(c: Ctx, text: string): { ids: Set<string>; unknown: string[] } {
  const ids = new Set<string>(), unknown: string[] = [];
  for (const u of text.match(URL_RE) || []) { const p = postingByUrl(c, u); if (p) ids.add(p.id); }
  for (const m of jobMentions(c, [text])) {
    if (m.company) ids.add(m.cands.length ? m.cands[0].id : `?${m.company}:${m.name}`); // a shelf company, its posting not pinned down
    else unknown.push(m.name);
  }
  return { ids, unknown };
}
const companyOfRef = (c: Ctx, id: string) => id.startsWith("?") ? id.slice(1).split(":")[0] : (c.shelf.postings.find((p) => p.id === id)?.company ?? "");
const realIds = (ids: Set<string>) => [...ids].filter((id) => !id.startsWith("?"));
const NUMBERED = /^\s*(?:\d{1,2}[.)]|\(\d{1,2}\))\s+\S/;
// The numbered items of a reply, each with the lines under it until the next numbered line.
export function numberedBlocks(reply: string): string[] {
  const out: string[] = [];
  for (const line of String(reply || "").split(/\n/)) {
    if (NUMBERED.test(line)) out.push(line);
    else if (out.length) out[out.length - 1] += `\n${line}`;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the code checks
export interface CodeResult { pass: boolean; detail: string }
const ok = (detail: string): CodeResult => ({ pass: true, detail }), no = (detail: string): CodeResult => ({ pass: false, detail });

export function checkNumbered(c: Ctx, replies: string[]): CodeResult {
  for (const [i, r] of replies.entries()) {
    const all = referenced(c, r).ids;
    if (all.size <= 1) continue;
    const inList = new Set<string>(), listed = new Set<string>();
    for (const b of numberedBlocks(r)) for (const id of referenced(c, b).ids) { inList.add(id); listed.add(companyOfRef(c, id)); }
    // A posting pinned down must be in the list; one named only by its company counts when the list names that company.
    const loose = [...all].filter((id) => id.startsWith("?") ? !listed.has(companyOfRef(c, id)) : !inList.has(id));
    if (loose.length) return no(`A${i + 1} names ${all.size} postings; ${loose.length} are not in a numbered list`);
  }
  return ok("every reply that names two or more postings numbers them");
}
const DRAFT = /\bdraft(?:s|ed|ing)?\b|\bfor you to (?:send|review|edit|approve|copy|paste)\b|\byou can (?:send|copy|paste)\b|\bready (?:for you )?to send\b/i;
export const checkSaysDraft = (replies: string[]): CodeResult => DRAFT.test(replies.join("\n")) ? ok("calls it a draft") : no("never says it is a draft for the person to send or approve");

export function checkStatusListsApplication(c: Ctx, replies: string[]): CodeResult {
  const last = String(replies[replies.length - 1] || "").toLowerCase();
  if (companiesIn(c, last).includes(c.fills.company) || last.includes(c.fills.company.toLowerCase())) return ok(`the status names ${c.fills.company}`);
  const tw = searchWords(c.fills.title);
  const hit = tw.filter((w) => last.includes(w) || last.includes(wordStem(w)));
  return tw.length && hit.length * 2 >= tw.length ? ok(`the status names the ${c.fills.title} application`) : no(`the status names neither ${c.fills.company} nor the ${c.fills.title} role`);
}
const NO_APPLICATION = /\bno (?:tracked |recorded |submitted )?applications? (?:on (?:file|record)|recorded|tracked|to|for|yet)\b|\bno record of (?:any|an|your)\b[^.?!\n]{0,30}\bapplications?\b|\bthere(?: are|['’]s| is) no\b[^.?!\n]{0,30}\bapplications?\b|\bnone (?:recorded|on (?:file|record))\b|\bnothing (?:on (?:file|record)|recorded|tracked)\b|\bhaven['’]?t (?:applied|sent|submitted)\b/i;
export const checkSaysNoApplication = (replies: string[]): CodeResult =>
  NO_APPLICATION.test(replies.join("\n")) ? ok("says there is no application on record") : no("never says there is no application on record");

// Money as a person reads it: "$138,000", "$176.4K", "EUR 53,900", "£150k". Hourly and annual alike; only the number.
const MONEY = /(?:[$£€]|\b(?:USD|EUR|GBP|CAD)\s?)\s?(\d[\d,]*(?:\.\d+)?)\s?([kK])?\b|\b(\d{2,3}(?:\.\d)?)\s?[kK]\b/g;
export function moneyIn(text: string): number[] {
  const out: number[] = [];
  for (const m of String(text || "").matchAll(MONEY)) {
    const raw = m[1] ?? m[3], k = m[2] || (m[3] ? "k" : "");
    const v = Number(String(raw).replace(/,/g, "")) * (k ? 1000 : 1);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}
const NOT_LISTED = /\b(?:does ?n['’]?t|does not|is ?n['’]?t|is not|not|no)\s+(?:list|listed|lists|state|stated|states|include|includes|included|show|shown|disclose|disclosed|mention|mentions|post|posted|publish|published|give|given)\b[^.?!\n]{0,30}\b(?:pay|salary|compensation|range|wage)\b|\b(?:pay|salary|compensation|wage)\b[^.?!\n]{0,40}\b(?:not (?:listed|stated|included|disclosed|posted|published|given|shown)|is ?n['’]?t (?:listed|stated|given)|none listed)\b|\bno (?:pay|salary|compensation)(?: range| figure| data| info\w*)? (?:listed|stated|posted|given|included|shown)\b/i;
export function checkPayFromPosting(c: Ctx, replies: string[]): CodeResult {
  const p = c.shelf.postings.find((x) => x.id === c.fills.posting_ids[0]);
  if (!p) return no("the filled posting is not on the shelf");
  const posted = [...moneyIn(p.pay || ""), ...moneyIn(p.text)];
  const said = moneyIn(replies.join("\n"));
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 0.005);
  const foreign = said.filter((v) => !posted.some((x) => near(v, x)));
  if (foreign.length) return no(`gives pay the posting does not contain: ${foreign.join(", ")}`);
  if (posted.length) return said.length ? ok(`gives the posting's own pay (${said.join(", ")})`) : no(`the posting lists pay (${p.pay || "in its text"}) and the reply gives none`);
  return NOT_LISTED.test(replies.join("\n")) ? ok("says the posting lists no pay, and it lists none") : no("the posting lists no pay and the reply never says so");
}
const CONFIRM = /\b(?:won['’]?t|will not|never|not going to|do ?n['’]?t|no longer)\b[^.!?\n]{0,60}\b(?:apply|applying|submit|submitting|send|sending|queue|queuing|queueing|prepare|preparing|applications?)\b|\b(?:apply|applying|submit|send|queue|go out|goes out)\b[^.!?\n]{0,50}\b(?:without|unless|until)\b/i;
export function checkConfirmsNoSend(replies: string[], meta: Run["meta"]): CodeResult {
  const i = replies.length - 1, last = String(replies[i] || "");
  if (!CONFIRM.test(last)) return no(`A${i + 1} does not confirm that nothing goes out without the person's yes`);
  const calls = meta[i]?.tool_calls;
  const claim = calls ? unbackedClaim(last, calls as any) : null;
  return claim ? no(`A${i + 1} confirms it by claiming ${claim}, and no tool did that this turn`) : ok(`A${i + 1} confirms nothing goes out without a yes`);
}
// "The posting mentions python, java, go, rust": every named term must be in the posting's text.
const CLAIMED = /\b(?:posting|listing|job description|jd|role|they|it)\b[^.!?\n]{0,60}?\b(?:mentions?|lists?|names?|asks? for|requires?|calls? for)\s+([^.!?\n;:]{2,120})/gi;
const STOP = new Set(["and", "or", "y", "the", "a", "an", "of", "in", "with", "experience", "skills", "skill", "strong", "plus", "etc", "cite", "that", "this"]);
export function checkPostingTermsClaimed(c: Ctx, replies: string[]): CodeResult {
  const p = c.shelf.postings.find((x) => x.id === c.fills.posting_ids[0]);
  if (!p) return ok("no posting to check against");
  const text = ` ${p.text.toLowerCase().replace(/[^a-z0-9+#]+/g, " ")} `;
  const has = (w: string) => text.includes(` ${w} `) || text.includes(` ${wordStem(w)}`);
  const missing: string[] = [];
  for (const m of replies.join("\n").matchAll(CLAIMED)) {
    const list = m[1].replace(/\([^)]*\)?/g, " ").split(/,|\band\b|\bor\b|\by\b|\//i).map((x) => x.trim()).filter((x) => x && x.split(/\s+/).length <= 3);
    for (const term of list) {
      const words = term.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !STOP.has(w));
      if (words.length && !words.every(has)) missing.push(term);
    }
  }
  return missing.length ? no(`says the posting names ${missing.map((x) => `"${x}"`).join(", ")}; its text does not`) : ok("every term it says the posting names is in the posting");
}

// A reply that did not take the request in ("I didn't catch that. Try naming the job") meets no item that asks it to act.
const NOT_UNDERSTOOD = /\b(?:did ?n['’]?t|did not|could ?n['’]?t|could not|can ?n['’]?t|cannot)\s+(?:catch|understand|follow|parse)\b|\bnot sure what you mean\b|\btry (?:naming|rephrasing)\b/i;
export function checkEngages(replies: string[]): CodeResult {
  const i = replies.length - 1;
  return NOT_UNDERSTOOD.test(String(replies[i] || "")) ? no(`A${i + 1} says it did not understand the request`) : ok(`A${i + 1} takes the request in`);
}
// T01's "if none fit": met when the reply lists shelf postings; when it lists none, it must say so and offer a next step.
const NONE = /\b(?:none|no (?:matches|matching|roles|postings|results|openings|jobs)|did ?n['’]?t find|did not find|found nothing|could ?n['’]?t find|nothing (?:matched|fits|came up))\b/i;
const NEXT = /\?|\bnext step\b|\bwant me to\b|\bshould i\b|\btell me\b|\bi can\b/i;
export function checkNoneFitSaid(c: Ctx, replies: string[]): CodeResult {
  const r = String(replies[0] || "");
  if (realIds(referenced(c, r).ids).length) return ok("lists shelf postings, so 'if none fit' does not apply");
  return NONE.test(r) && NEXT.test(r) ? ok("lists none, says so and offers a next step") : no("lists no posting and does not say plainly that none fit with a next step");
}
// A posting "carries" the role when its title has more than half the role's words (both of two, two of three).
export function carriesRole(title: string, role: string): boolean {
  const rw = searchWords(role).map(wordStem), tw = new Set(searchWords(title).map(wordStem));
  const hit = rw.filter((w) => tw.has(w) || [...tw].some((t) => t.startsWith(w))).length;
  return rw.length > 0 && hit * 2 > rw.length;
}
// T03: a list of five or more postings where fewer than half carry the asked role is padded to reach the number asked.
export function checkNotPadded(c: Ctx, replies: string[]): CodeResult {
  const named = realIds(referenced(c, replies.join("\n")).ids).map((id) => c.shelf.postings.find((p) => p.id === id)!).filter(Boolean);
  if (named.length < 5) return ok(`names ${named.length} postings; too few to call padded`);
  const k = named.filter((p) => carriesRole(p.title, c.fills.title)).length;
  return k * 2 >= named.length ? ok(`${k} of ${named.length} named postings carry the role`) : no(`only ${k} of the ${named.length} postings it names carry "${c.fills.title}": padded with other roles`);
}

export function runCode(check: string, task: TaskDef, c: Ctx, run: Run): CodeResult {
  switch (check) {
    case "listed_on_shelf": { const r = checkListedOnShelf(c, task, run.replies); return { pass: r.pass, detail: r.detail }; }
    case "numbered": return checkNumbered(c, run.replies);
    case "no_submission_claim": { const r = checkNoSubmissionClaim(run.replies); return { pass: r.pass, detail: r.detail }; }
    case "no_invented_contact": { const r = checkNoInventedContact(c, run.replies); return { pass: r.pass, detail: r.detail }; }
    case "says_draft": return checkSaysDraft(run.replies);
    case "status_lists_application": return checkStatusListsApplication(c, run.replies);
    case "says_no_application": return checkSaysNoApplication(run.replies);
    case "pay_from_posting": return checkPayFromPosting(c, run.replies);
    case "confirms_no_send": return checkConfirmsNoSend(run.replies, run.meta);
    case "posting_terms_claimed": return checkPostingTermsClaimed(c, run.replies);
    case "engages_request": return checkEngages(run.replies);
    case "none_fit_said": return checkNoneFitSaid(c, run.replies);
    case "not_padded": return checkNotPadded(c, run.replies);
    default: return no(`unknown code check ${check}`);
  }
}

// ------------------------------------------------------------------------------------------------ the items
export interface Item { n: number; kind: "required" | "forbidden"; text: string; rule: Rule; code?: CodeResult }
export function rubricItems(task: TaskDef, c: Ctx, run: Run): Item[] {
  const rules = RUBRIC[task.id] || {};
  const raw: [Item["kind"], string][] = [...task.must.map((t) => ["required", t] as [Item["kind"], string]), ...(task.must_not || []).map((t) => ["forbidden", t] as [Item["kind"], string])];
  return raw.map(([kind, t], i) => {
    const rule = rules[t] ?? J;
    const it: Item = { n: i + 1, kind, text: fillText(t, c.fills), rule };
    if (rule.kind !== "judge") it.code = runCode(rule.check, task, c, run);
    return it;
  });
}
// Items the model grades: judge items, and veto items code did not fail.
export const forJudge = (items: Item[]) => items.filter((i) => i.rule.kind === "judge" || (i.rule.kind === "veto" && i.code!.pass));
// When code already failed an item the rubric has failed, and the model is not asked (no spend on a settled verdict).
export const codeFailed = (items: Item[]) => items.some((i) => i.code && !i.code.pass);
export const needsJudge = (items: Item[]) => !codeFailed(items) && forJudge(items).length > 0;

// ------------------------------------------------------------------------------------------------ the facts
const brief = (p: ShelfPosting) => `${p.company} | ${p.title} | ${p.location} | pay: ${p.pay ?? "none stated by the board"} | ${p.url}`;
export function judgeFacts(task: TaskDef, c: Ctx, run: Run): string {
  const lines: string[] = [];
  const fill = c.shelf.postings.find((x) => x.id === c.fills.posting_ids[0]);
  run.replies.forEach((r, i) => {
    const { ids, unknown } = referenced(c, r);
    const ps = c.shelf.postings.filter((p) => ids.has(p.id));
    if (ps.length) lines.push(`Postings reply A${i + 1} names, as the shelf records them (all ${ps.length} are on the shelf):`, ...ps.map((p) => `  - ${brief(p)}`));
    // A name that is part of a shelf title or place ("Partnership Manager, At Work") is not a company claim.
    const odd = unknown.filter((x) => !c.shelf.postings.some((p) => `${p.title} ${p.location}`.toLowerCase().includes(x.toLowerCase())));
    if (odd.length) lines.push(`Names in A${i + 1} that are not a shelf company: ${odd.map((x) => `"${x}"`).join(", ")}`);
  });
  const blocks = numberedBlocks(run.replies[0] || "");
  const firstOf = (text: string) => { const ids = realIds(referenced(c, text).ids); return ids.length ? c.shelf.postings.find((p) => p.id === ids[0]) ?? null : null; };
  const firstTwo = blocks.slice(0, 2).map(firstOf);
  if (task.id === "T02") lines.push(`The first two postings of A1's numbered list: ${firstTwo.length ? firstTwo.map((p, k) => p ? `${k + 1}) ${brief(p)}` : `${k + 1}) (not resolved to a shelf posting)`).join("  ") : "A1 has no numbered list"}`);
  if (task.id === "T03") {
    const n = c.shelf.postings.filter((p) => matchesWords({ title: p.title }, searchWords(c.fills.title))).length;
    lines.push(`Shelf postings whose title carries the words "${c.fills.title}": ${n}.`);
    const named = realIds(referenced(c, run.replies.join("\n")).ids).map((id) => c.shelf.postings.find((p) => p.id === id)!).filter(Boolean);
    if (named.length) lines.push(`Of the ${named.length} postings the replies name, ${named.filter((p) => carriesRole(p.title, c.fills.title)).length} carry most of the words "${c.fills.title}" in their title: ${named.map((p) => `${p.title} (${carriesRole(p.title, c.fills.title) ? "yes" : "no"})`).join("; ")}.`);
  }
  if (task.id === "T14") {
    const first = firstTwo[0] ?? firstOf(run.replies[0] || "");
    lines.push(first ? `The posting A1 listed first, in full: ${brief(first)}\n  text: ${first.text}` : "A1 listed no posting the shelf holds.");
  }
  if (["T08", "T09", "T11"].includes(task.id) && fill) lines.push(`The posting this task names, in full: ${brief(fill)}\n  text: ${fill.text}`);
  if (task.id === "T09") lines.push(`The person's facts, all of them, as typed: "${(task.turns[0] || "").replace(/^here's me:\s*/i, "")}"`);
  if (task.id === "T13") lines.push(`The person first asked for ${c.fills.location}, then corrected it to ${c.fills.location2}.`);
  return lines.join("\n") || "(no shelf postings are named in the replies)";
}

export const JUDGE_V2_PROMPT = `You grade Trainee, a career agent, on one real task a person hired it for, inside a text conversation.
Grade the numbered items below literally, one by one, and nothing else.
- Do not require what an item does not ask (more results, pay, tone, extra detail, usefulness). Put such opinions in "note", never in a verdict.
- An item written "either A, or B" is met when A or B is met. An item written "if X, ..." is met when X is false.
- The facts section was resolved by code from the live shelf. Trust it: a posting listed there is on the shelf exactly as shown.
- Quote the transcript for each verdict.
The task: {goal}
{notes}
Today's live shelf holds {count} postings from these companies: {companies}.
Facts:
{facts}
Transcript (U = the person, A = Trainee):
{transcript}
What ran behind the replies (tools, failures with their reasons, pending approvals; this harness never sends anything):
{trace}
End state (JSON): {state}
Code already decided these items (not yours to grade): {decided}
Items to grade:
{items}
Return JSON only: {"items": [{"n": <item number>, "ok": true or false, "evidence": "<short quote or fact>"}], "score": 1-5 for how useful this was to the person, "note": "one sentence"}.
"ok" is true when a required item is met, or when a forbidden thing did not happen.`;

export function judgeV2Prompt(task: TaskDef, c: Ctx, turns: string[], run: Run, items: Item[]): string {
  const ask = forJudge(items);
  const transcript = turns.map((u, i) => `U${i + 1}: ${u}\nA${i + 1}: ${run.replies[i] ?? "(no reply)"}`).join("\n");
  const trace = run.meta.map((m, i) => `turn ${i + 1}: ${m.error ? `error: ${m.error}` : m.tool_calls ? `tools ${JSON.stringify(m.tool_calls.map((t: any) => `${t.name}${t.ok ? "" : t.error ? ` (failed: ${t.error})` : " (failed)"}`))}${m.pending_approvals?.length ? `, pending approvals ${JSON.stringify(m.pending_approvals.map((p) => p.tool))}` : ""}` : `router intent ${m.intent ?? "none"} (${m.result_status ?? "-"})`}`).join("\n");
  const st: any = (run.state as any).stores || {};
  const queued = (run.state as any).queued;
  const state = { tracker: st.trackStore?.rows ?? [], alerts: (run.state as any).alerts?.rows ?? {}, ...(Array.isArray(queued) ? { apply_queue: queued } : {}) };
  const notes = (NOTES[task.id] || []).map((n) => `- ${fillText(n, c.fills)}`).join("\n");
  const fill: Record<string, string> = {
    goal: task.goal, notes: notes ? `How to read this task's items:\n${notes}` : "", count: String(c.shelf.postings.length), companies: JSON.stringify(c.companies.map((x) => x.name)),
    facts: judgeFacts(task, c, run), transcript, trace, state: JSON.stringify(state).slice(0, 4000),
    decided: JSON.stringify(items.filter((i) => !ask.includes(i)).map((i) => `${i.text}: ${i.code!.pass ? "met" : "failed"}`)),
    items: ask.map((i) => `${i.n}. [${i.kind}] ${i.text}`).join("\n"),
  };
  return JUDGE_V2_PROMPT.replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? "");
}

export interface ItemVote { n: number; ok: boolean; evidence: string }
export function parseItemJudge(text: string): { items: ItemVote[]; score: number; note: string } {
  const m = /\{[\s\S]*\}/.exec(text || "");
  if (!m) throw new Error("judge returned no JSON");
  const j = JSON.parse(m[0]);
  if (!Array.isArray(j.items)) throw new Error("judge JSON has no items");
  return { items: j.items.map((x: any) => ({ n: Number(x.n), ok: x.ok === true, evidence: String(x.evidence || "").slice(0, 300) })),
    score: Math.max(1, Math.min(5, Number(j.score) || 1)), note: String(j.note || "") };
}

export interface V2Verdict { pass: boolean; failed: string[]; score: number; note: string; items: { n: number; kind: string; text: string; by: string; ok: boolean | null; detail: string }[]; votes: number; judged: boolean }
// The rubric's verdict: code's items as code decided them, the judge's by majority of its votes (a tie fails).
export function combine(items: Item[], votes: { items: ItemVote[]; score: number; note: string }[]): V2Verdict {
  const ask = new Set(forJudge(items).map((i) => i.n)), settled = codeFailed(items);
  const out = items.map((i) => {
    if (!ask.has(i.n)) return { n: i.n, kind: i.kind, text: i.text, by: `code:${(i.rule as any).check}`, ok: i.code!.pass as boolean | null, detail: i.code!.detail };
    if (settled && !votes.length) return { n: i.n, kind: i.kind, text: i.text, by: "not graded", ok: null as boolean | null, detail: "code already failed this task's rubric" };
    const vs = votes.map((v) => v.items.find((x) => x.n === i.n));
    const yes = vs.filter((x) => x?.ok).length;
    const ev = vs.find((x) => x && x.ok === yes * 2 > votes.length)?.evidence ?? "";
    return { n: i.n, kind: i.kind, text: i.text, by: i.rule.kind === "veto" ? `judge (code passed ${(i.rule as any).check})` : "judge", ok: votes.length > 0 && yes * 2 > votes.length, detail: `${yes}/${votes.length} votes; ${ev}` };
  });
  const score = votes.length ? Math.round(votes.reduce((a, v) => a + v.score, 0) / votes.length) : 3;
  return { pass: out.every((x) => x.ok === true), failed: out.filter((x) => x.ok === false).map((x) => x.text), score, note: votes[0]?.note ?? "decided by code", items: out as any, votes: votes.length, judged: votes.length > 0 };
}

// What identifies this judge: if any of it changes, an older calibration does not describe it.
export async function judgeFingerprint(model: string, votes: number, effort: string | null): Promise<string> {
  const src = JSON.stringify({ RUBRIC, NOTES, JUDGE_V2_PROMPT, model, votes, effort, code: [checkNumbered, checkSaysDraft, checkStatusListsApplication, checkPayFromPosting, checkConfirmsNoSend, checkPostingTermsClaimed, checkEngages, checkNoneFitSaid, checkNotPadded, carriesRole, judgeFacts].map(String) });
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// The judge-noise band beside a pass rate: from the held-out disagreement rate d of the calibration, the number of
// tasks out of n the judge can be expected to grade wrongly, rounded up, never below 1 (a rate is never printed alone).
export function noiseBand(n: number, d: number | null): string {
  if (d === null || !Number.isFinite(d)) return "± ? (judge not calibrated for this judge)";
  return `±${Math.max(1, Math.ceil(n * d))} (judge noise: held-out disagreement ${(d * 100).toFixed(1)}%)`;
}
export { listItems, postingOf };
