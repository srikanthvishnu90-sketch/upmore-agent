// FEATURE 10 (2026-10-25): networking from chat, code-first on the live path (agent-chat/handler-career.ts), before the
// router. Three asks, each answered from the person's OWN contacts only (there is no people source by decision: D-018a):
//   (a) a contacts CSV pasted in the message, or attached (`attachments` on the request): imported into the person's
//       contacts by career_contacts.ts importContactsFile (the same import the brain uses), with a coverage fraction.
//       Contacts are the ACCOUNT's — one list per person in the outreach store (career_watch_kv 'career:contacts'),
//       like every outreach record; the thread state carries the turn's working copy (hydrated below);
//   (b) "who do I know at Stripe", "find my connections at X": the contacts at that firm, or plainly none, and how to add them;
//   (c) "email Maya at Stripe about the data analyst role", "draft intros to my 3 contacts at X": drafts written by
//       career_outreach.ts draftFor (every claim traced to a confirmed fact by outreachLock) and shown as the outreach
//       batch, the approval card outreachTurn already answers ("send 1", "send all", "redo 2"): one approval per exact
//       message, hash-bound. Sending stays the scheduled run's (career-proactive, CAREER_OUTREACH_SEND), through the
//       database's claim (caps, do-not-contact, recipient cap). Nothing here sends.
// Never an invented address: a recipient is a row of the person's own contacts, with the address on that row, or no one.
// The model writes only when the caller passes one (CAREER_NETWORKING_DRAFT=on, metered); without it the reply names who
// would be written to and that nothing was drafted.
import { type ContactRow, contactsOf, importContactsCsv, importContactsFile, MAX_CONTACTS, MX_NOT_WIRED, type MxResolver, normalizeFirm, sameFirm, verifyRows } from "./career_contacts.ts";
import { legacyRows } from "./career_referrals.ts";
import { peopleTurn } from "./career_people.ts";
import { BATCH_MAX, batchMessages, confirmed, draftFor, type Drafted, emailHash, footerOf, messageOf, type ModelFn, OUTREACH_INTENT, type OutreachDraft,
  type OutreachStore, payloadHash, type Recipient, recordOutreach } from "./career_outreach.ts";
import type { EventStore } from "./agent/timeline.ts";
import { trackTurn } from "./career_outreach_track.ts";

export const IMPORT_INTENT = "career_contacts_import";
export const AT_INTENT = "career_contacts_at";
export const DRAFT_INTENT = "career_networking_draft";
export const SIGNATURE_INTENT = "career_outreach_signature";
export const MAX_FILE_CHARS = 2_000_000, MAX_FILES = 3, LIST_MAX = 15;
export const ADD_CONTACTS = "To add people, download your LinkedIn connections (LinkedIn: Settings, Data privacy, Get a copy of your data, Connections) and send me the CSV here, or paste rows under a header line like Name,Company,Title,Email.";
export const NO_FINDER = "I don't have a people database or an email finder, and I won't guess names or addresses.";
export const SIGN_ASK = "How do you sign your emails? Send your name the way you want it at the bottom (and a phone or school line if you like), and I'll write the drafts.";

export interface Attachment { name: string; mime?: string; text: string | null }
export type Ask =
  | { kind: "who"; firm: string }
  | { kind: "draft"; target: Target; topic: string | null };
export type Target =
  | { by: "name"; name: string; firm: string | null }
  | { by: "group"; firm: string; count: number | null; role: string | null };

const plain = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9@.]+/g, " ").trim();
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 };
const numberOf = (w: string | undefined) => (w ? (/^\d+$/.test(w) ? Number(w) : NUM[w.toLowerCase()] ?? null) : null);
const NUMW = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)";
const GROUP = "(?:contacts|connections|people|friends|folks|alums|alumni)";
const FILLER = /^(?:(?:so|ok|okay|hey|hi|and|now|also|please|pls|can you|could you|would you|will you|help me|actually|wait|oh|oops|no)[, ]+)+/i;
// A firm as typed: the words after "at"/"from", up to the topic or the end.
function firmOf(raw: string): string | null {
  const f = raw.replace(/\s+(?:about|regarding|re|for|who|that|to|and ask|asking|right now|please)\b.*$/i, "").replace(/[?.!,;:]+$/, "").replace(/^the\s+/i, "").trim();
  if (!f || f.length > 60 || /[@/\\<>]/.test(f) || f.split(/\s+/).length > 6) return null;
  return f;
}

// (b) and (c): what the message asks, or null when it is not a networking ask (the rest of the chain answers it).
export function parseNetworkingAsk(message: string): Ask | null {
  const t = String(message ?? "").replace(/\s+/g, " ").trim().replace(FILLER, "").replace(/[?!.]+$/, "").replace(/,?\s+instead$/i, "").trim();
  if (!t || t.length > 300) return null;
  const who = [
    /^(?:who|which (?:people|contacts|connections))(?: else)? (?:do i know|do i have|in my (?:network|contacts|connections)|(?:are|is) (?:in )?my (?:contacts|connections|network))(?: (?:who |that )?works?| working)? (?:at|from|in) (.+)$/i,
    /^(?:find|show|list|get|give|pull up)(?: me)? (?:all )?(?:of )?(?:my |the )?(?:connections|contacts|people i know|network)(?: i have)? (?:at|from) (.+)$/i,
    /^(?:do i (?:know|have) (?:anyone|anybody|any (?:contacts|connections))|(?:is there )?(?:anyone|anybody) (?:i know|in my (?:network|contacts|connections))) (?:at|from) (.+)$/i,
    /^find(?: me)? (?:someone|somebody|anyone|anybody|a person|people|a contact|contacts) (?:at|from) (.+)$/i,
    /^(?:my|any) (?:contacts|connections) (?:at|from) (.+)$/i,
  ];
  for (const rx of who) {
    const m = rx.exec(t);
    if (m) { const firm = firmOf(m[1]); return firm ? { kind: "who", firm } : null; }
  }
  const verb = new RegExp(`^(?:email|e-mail|emial|emal|eamil|message|reach out to|intro(?:duce)? me to|write(?: an?)?(?: (?:email|note|intro|message))? to|send(?: an?)?(?: (?:email|intro|note|message))? to|draft(?: me)?(?: an?| some| ${NUMW})?(?: cold| short| quick| networking)?(?: (?:emails?|intros?|introductions?|notes?|messages?|outreach(?: emails?)?))(?: to| for)?) (.+)$`, "i").exec(t);
  if (!verb) return null;
  const verbCount = numberOf(verb[1]);
  let rest = verb[2].trim(), topic: string | null = null;
  const tm = /\s+(?:(?:about|regarding|re|asking about|to ask about)(?=\s)|re:|for (?:an?|the|my)(?=\s))\s*(.+)$/i.exec(rest);
  if (tm) {
    topic = (/^for /i.test(tm[0].trim()) ? tm[0].trim().replace(/^for\s+/i, "") : tm[1]).replace(/https?:\S+|\S+@\S+/g, "").trim().slice(0, 200) || null;
    rest = rest.slice(0, tm.index).trim();
  }
  rest = rest.replace(/[?.!,;:]+$/, "").trim();
  // "my 3 contacts at X", "people at X", "everyone I know at X", "someone at X"
  const g = new RegExp(`^(?:all (?:of )?)?(?:my |the )?(?:${NUMW} )?(?:${GROUP})(?: i (?:know|have))? (?:at|from) (.+)$`, "i").exec(rest);
  if (g) { const firm = firmOf(g[2]); return firm ? { kind: "draft", topic, target: { by: "group", firm, count: numberOf(g[1]) ?? verbCount, role: null } } : null; }
  const e = /^(everyone|everybody|anyone|anybody|someone|somebody|a person)(?: i know)? (?:at|from) (.+)$/i.exec(rest);
  if (e) { const firm = firmOf(e[2]); return firm ? { kind: "draft", topic, target: { by: "group", firm, count: /^some|^a person/i.test(e[1]) ? 1 : verbCount, role: null } } : null; }
  // "Maya at Stripe", "Maya Chen", "a recruiter at Stripe", "the hiring manager at X"
  const at = /^(.+?) (?:at|from) (.+)$/i.exec(rest);
  const who2 = (at ? at[1] : rest).trim(), firm = at ? firmOf(at[2]) : null;
  if (at && !firm) return null;
  const role = /^(?:an?|the|my|some|any)\s+(.+)$/i.exec(who2);
  if (role && firm && /^[a-z][a-z -]{1,40}$/i.test(role[1])) {
    const many = /s$/i.test(role[1].trim()) && !/ss$/i.test(role[1].trim());
    return { kind: "draft", topic, target: { by: "group", firm, count: many ? verbCount : 1, role: role[1].trim().replace(/s$/i, "") } };
  }
  const words = who2.split(/\s+/);
  const STOP = /^(?:my|the|a|an|your|our|me|him|her|them|it|this|that|these|those|resume|cv|cover|letter|application|everyone|someone|anyone|recruiters?|people|contacts|connections)$/i;
  if (words.length < 1 || words.length > 3 || words.some((w) => !/^[A-Za-z][A-Za-z.'’-]*$/.test(w) || STOP.test(w))) return null;
  return { kind: "draft", topic, target: { by: "name", name: who2, firm } };
}

// (a): a contacts CSV pasted in the message: a header with a name column and a company or email column, and at least one row.
export function pastedCsv(message: string): string | null {
  const text = String(message ?? "");
  if (!/\n/.test(text) || !/,/.test(text)) return null;
  const r = importContactsCsv("pasted", text);
  return !r.error && r.rows.length ? text : null;
}

// One person once: the same name at the same firm on two lists is one contact, kept as the row with a usable address.
function uniq(rows: ContactRow[]): ContactRow[] {
  const by = new Map<string, ContactRow>();
  for (const r of rows) {
    const k = `${plain(r.name)}@${plain(r.firm)}`, x = by.get(k);
    if (!x || (!x.verified && r.verified) || (!x.email && r.email)) by.set(k, r);
  }
  return [...by.values()];
}
const atFirm = (rows: ContactRow[], firm: string) => uniq(rows.filter((r) => r.firm && (sameFirm(r.firm, firm) || sameFirm(r.firm_raw, firm))));
const lineOf = (r: ContactRow) => `- ${r.name}${r.title ? `, ${r.title}` : ""}${r.email ? ` (${r.email})` : " (no email address)"}`;
const fileWord = (rows: ContactRow[]) => { const f = [...new Set(rows.map((r) => r.file))]; return f.length === 1 ? f[0] : `${f.length} lists`; };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const CONTACTED = "you already have a draft or email to them";
// Why a row can't be written to, or null when it can (draft_outreach's rule: an address that passed every check that ran,
// never anyone already written to, never the do-not-contact list).
async function heldWhy(r: ContactRow, contacted: Set<string>, dnc: Set<string>): Promise<string | null> {
  if (!r.email) return "no email address in your contacts, and I never guess one";
  if (!r.verified) {
    const c = r.check;
    return c?.syntax === "fail" ? `"${r.email}" is not a valid address` : c?.role === "flagged" ? `${r.email} is a shared inbox, not a person` : c?.disposable === "flagged" ? `${r.email} is a throwaway address` : c?.mx === "fail" ? `${r.email}'s domain has no mail server` : `${r.email} did not pass the address checks`;
  }
  if (contacted.has(r.email.toLowerCase())) return CONTACTED;
  if (dnc.has(await emailHash(r.email))) return "they asked not to be contacted";
  return null;
}
const recipientOf = (r: ContactRow): Recipient => ({ name: r.name, firm: r.firm, title: r.title, school: r.school, email: r.email!, source: `${r.file}, row ${r.row}` });

// FAMILY NETWORKING: an address the person typed for the person they named ("email Maya Chen at Stripe about a coffee
// chat, her email is maya@stripe.com"): taken out of the ask, and kept as their own contact row (never guessed, never
// a name made up for an address).
const ADDR = /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}/;
export function typedAddress(message: string): { text: string; email: string | null } {
  const m = String(message ?? "");
  const a = ADDR.exec(m);
  if (!a || (m.match(new RegExp(ADDR.source, "g")) ?? []).length > 1) return { text: m, email: null };
  const clause = new RegExp(`\\s*(?:[,;.(-]\\s*)?(?:and\\s+)?(?:(?:her|his|their|the|my contact's)\\s+)?(?:(?:e-?mail|email address|address)\\s*(?:is|:|=)?\\s*|(?:she|he|they)(?:'s| is| are)\\s+(?:at\\s+)?|at\\s+|<)?${a[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>?\\)?`, "i");
  const text = m.replace(clause, "").replace(/\s+/g, " ").trim();
  return { text, email: a[0].toLowerCase() };
}
export const TYPED_FILE = "what you typed in chat";
async function keepTyped(o: NetworkingDeps, name: string, firm: string | null, email: string): Promise<void> {
  const all = contactsOf(o.state);
  if (all.some((r) => (r.email ?? "").toLowerCase() === email)) return;
  const row = all.filter((r) => r.file === TYPED_FILE).length + 1;
  const f = firm ? normalizeFirm(firm) : "";
  const [checked] = await verifyRows([{ file: TYPED_FILE, row, name, email, firm: f, firm_raw: firm ?? "", company: f, title: "", school: "", connected_on: null }], o.mx ?? MX_NOT_WIRED);
  o.state.contacts = [...all, checked];
}

export interface NetworkingDeps {
  message: string; userId: string; threadId: string; now: number;
  state: Record<string, unknown>; // the thread's career state (ctx): the contacts working copy and the profile
  attachments?: Attachment[];
  store: OutreachStore; events?: EventStore | null;
  model: ModelFn | null; // null: drafting is not switched on here (no model call is made)
  mx?: MxResolver;
  previousAsk?: () => Promise<string | null>; // the person's message before this one (for the signature answer)
}
export interface NetworkingResult { reply: string; intent: string; status: string; parts?: string[] }

// Contacts live on the account (the outreach store), not the thread: a list imported in one thread answers in
// every thread of the same person. The turn runs on the thread state's working copy, so hydrate it from the
// account first — rows only the thread holds (kept before this, or in the same turn) are kept and join the
// account — and write the copy back when it no longer matches what the account held. A store without the
// contacts methods keeps the old thread-only behaviour exactly.
const contactKeys = (r: ContactRow) => [r.email ? `e:${r.email.toLowerCase()}` : `n:${plain(r.name)}@${plain(r.firm)}`, `${r.file}#${r.row}`];
async function hydrateContacts(o: NetworkingDeps): Promise<ContactRow[] | null> {
  if (!o.store.contacts) return null;
  const account = await o.store.contacts(o.userId).catch(() => null);
  if (!account) return null;
  const seen = new Set(account.flatMap(contactKeys));
  const merged = [...account];
  for (const r of contactsOf(o.state)) if (!contactKeys(r).some((k) => seen.has(k))) { contactKeys(r).forEach((k) => seen.add(k)); merged.push(r); }
  o.state.contacts = merged.slice(-MAX_CONTACTS);
  return account;
}
async function persistContacts(o: NetworkingDeps, account: ContactRow[] | null): Promise<void> {
  if (!account || !o.store.saveContacts) return;
  const now = contactsOf(o.state);
  if (JSON.stringify(now) !== JSON.stringify(account)) await o.store.saveContacts(o.userId, now).catch(() => {});
}

export async function networkingTurn(o: NetworkingDeps): Promise<NetworkingResult | null> {
  const account = await hydrateContacts(o);
  try {
  // PEOPLE FINDING (D-033): the LinkedIn export kept per person, Gmail correspondents, public pages, job emails, intros.
  const people = await peopleTurn(o); if (people) return people;
    return await networkingTurnInner(o);
  } finally {
    await persistContacts(o, account);
  }
}

async function networkingTurnInner(o: NetworkingDeps): Promise<NetworkingResult | null> {
  const files = (o.attachments ?? []).slice(0, MAX_FILES);
  const pasted = files.length ? null : pastedCsv(o.message);
  if (files.length || pasted) return await importTurn(o, files, pasted);
  // FAMILY NETWORKING: after the draft: marked sent by the person, replies, follow-up reminders, the list of who they
  // reached out to, a follow-up drafted, and LinkedIn automation refused (career_outreach_track.ts).
  const tracked = await trackTurn({ message: o.message, userId: o.userId, threadId: o.threadId, now: o.now, store: o.store, events: o.events,
    facts: (((o.state.profile as any)?.facts ?? []) as unknown[]), model: o.model,
    contactsWithEmail: (name) => contactsOf(o.state).filter((r) => r.email && plain(r.name).split(" ")[0] === plain(name)).map((r) => `${r.name}${r.firm ? ` at ${r.firm}` : ""}`) });
  if (tracked) return tracked;
  const typed = typedAddress(o.message);
  let ask = parseNetworkingAsk(typed.text);
  // An address with no name for it: never a name made up from the address; ask once for who it is.
  if (typed.email && !(ask?.kind === "draft" && ask.target.by === "name")) {
    ask = parseNetworkingAsk(o.message);
    if (!ask && /^\s*(?:please\s+|can you\s+|could you\s+)?(?:email|e-mail|emial|write(?: an?)?(?: email)? to|draft(?: an?)? (?:email|note|intro) to|send(?: an?)? (?:email|note|intro) to)\b/i.test(o.message))
      return { reply: `Who is ${typed.email}? Send their name and firm with the address, for example "email Maya Chen at Stripe about a coffee chat, ${typed.email}", and I'll draft it for your approval. I never make up a name for an address.`, intent: DRAFT_INTENT, status: "needs_name" };
  }
  if (ask?.kind === "who") return whoTurn(o, ask.firm, await peopleOf(o));
  if (ask?.kind === "draft") return await draftTurn(o, ask, typed.email);
  // The answer to "how do you sign your emails?": saved, then the ask that needed it runs.
  if ((await o.store.lastAssistantIntent(o.threadId).catch(() => null)) === SIGNATURE_INTENT) return await signatureTurn(o);
  return null;
}

async function importTurn(o: NetworkingDeps, files: Attachment[], pasted: string | null): Promise<NetworkingResult> {
  const stamp = new Date(o.now).toISOString().slice(0, 16).replace("T", " ");
  const inputs = pasted ? [{ name: `pasted list ${stamp} UTC`, text: pasted }] : files.map((f) => ({ name: String(f.name || "contacts.csv").slice(0, 120), mime: f.mime ?? "", text: f.text }));
  const lines: string[] = [];
  let imported = 0;
  for (const f of inputs) {
    const csv = /\.csv$/i.test(f.name) || /csv|comma-separated/i.test((f as any).mime ?? "") || !!pasted;
    if (!csv || f.text === null) { lines.push(`${f.name}: not read. I can read a CSV of contacts here; this file type isn't one.`); continue; }
    if (f.text.length > MAX_FILE_CHARS) { lines.push(`${f.name}: not read. It is over ${MAX_FILE_CHARS / 1_000_000} MB; send the connections CSV on its own.`); continue; }
    const parsed = importContactsCsv(f.name, f.text);
    const r = await importContactsFile(o.state, { name: f.name, text: f.text }, o.mx ?? MX_NOT_WIRED);
    if (!r.ok || !r.report) { lines.push(`${f.name}: no contacts imported. It needs a header row with a name column and a company or email column.`); continue; }
    const rows = contactsOf(o.state).filter((x) => x.file === f.name);
    imported += rows.length;
    const total = parsed.rows.length + parsed.duplicates + parsed.skipped.length;
    const out = [...(parsed.duplicates ? [`${plural(parsed.duplicates, "duplicate")}`] : []),
      ...summarizeSkipped(parsed.skipped)];
    const noEmail = rows.filter((x) => !x.email).length;
    const firms = r.report.by_firm.filter((x) => x.firm !== "(no company)").slice(0, 5).map((x) => `${x.firm} ${x.contacts}`).join(", ");
    lines.push([
      `${f.name}: imported ${rows.length}/${total} rows into your contacts${out.length ? ` (left out: ${out.join("; ")})` : ""}.`,
      `${rows.length - noEmail}/${rows.length} have an email address${noEmail ? `; the other ${noEmail} can be looked up by firm but not written to, since I never guess an address (LinkedIn's export includes an email only when the person allowed it)` : ""}.`,
      rows.some((x) => x.email) ? r.report.label : "",
      firms ? `Most contacts: ${firms}.` : "",
    ].filter(Boolean).join(" "));
  }
  const next = imported ? `\n\nAsk "who do I know at <firm>", or "email <name> at <firm> about <what you want to ask>" and I'll draft it for your approval. Nothing is sent without your yes on the exact email.` : `\n\n${ADD_CONTACTS}`;
  return { reply: lines.join("\n") + next, intent: IMPORT_INTENT, status: imported ? "imported" : "not_imported" };
}
function summarizeSkipped(skipped: { row: number; why: string }[]): string[] {
  const by = new Map<string, number[]>();
  for (const s of skipped) by.set(s.why, [...(by.get(s.why) ?? []), s.row]);
  return [...by.entries()].map(([why, rows]) => `${rows.length === 1 ? "row" : "rows"} ${rows.slice(0, 5).join(", ")}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}: ${why}`);
}

// Everyone the person gave Trainee: the contacts imported here, and people the router kept from an earlier export (the
// profile's connections and graph people, read the way the brain's referral map reads them), given the same free checks.
async function peopleOf(o: NetworkingDeps): Promise<ContactRow[]> {
  const p: any = o.state.profile ?? {}, g: any = o.state.graph ?? o.state.graphStore ?? {};
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const older = legacyRows([...list(g.people), ...list(p._careerGraphPeople), ...list(p.connections)]);
  return [...contactsOf(o.state), ...(older.length ? await verifyRows(older, o.mx ?? MX_NOT_WIRED) : [])];
}

function whoTurn(o: NetworkingDeps, firmAsked: string, all: ContactRow[]): NetworkingResult {
  const firm = normalizeFirm(firmAsked);
  if (!all.length) return { reply: `You haven't sent me any contacts yet, so I can't say who you know at ${firm}. ${NO_FINDER} ${ADD_CONTACTS}`, intent: AT_INTENT, status: "no_contacts" };
  const here = atFirm(all, firm);
  if (!here.length) return { reply: `None of your ${plural(all.length, "contact")} (from ${fileWord(all)}) is at ${firm}. ${NO_FINDER} ${ADD_CONTACTS}`, intent: AT_INTENT, status: "none_at_firm" };
  const withEmail = here.filter((r) => r.email).length;
  const shown = here.slice(0, LIST_MAX);
  const ex = here.find((r) => r.email) ?? here[0];
  return {
    reply: [`You have ${plural(here.length, "contact")} at ${firm} (from ${fileWord(here)}), ${withEmail} with an email address:`, ...shown.map(lineOf),
      ...(here.length > shown.length ? [`and ${here.length - shown.length} more.`] : []),
      withEmail ? `\nSay "email ${ex.name} at ${firm} about <what you want to ask>" and I'll draft it from your confirmed facts for your approval.` : `\nNone has an email address in your contacts, so I can't write to them; I never guess an address. Send a CSV with their emails (Name,Company,Email) to add them.`].join("\n"),
    intent: AT_INTENT, status: "listed",
  };
}

async function draftTurn(o: NetworkingDeps, ask: Extract<Ask, { kind: "draft" }>, typedEmail: string | null = null): Promise<NetworkingResult> {
  if (typedEmail && ask.target.by === "name") await keepTyped(o, ask.target.name.trim(), ask.target.firm, typedEmail);
  const all = await peopleOf(o), t = ask.target;
  const firmName = t.firm ? normalizeFirm(t.firm) : null;
  if (!all.length) return { reply: `You haven't sent me any contacts yet, so there's no one I can write to${firmName ? ` at ${firmName}` : ""}. ${NO_FINDER} ${ADD_CONTACTS}`, intent: DRAFT_INTENT, status: "no_contacts" };
  // Who: the rows the ask names, from the person's own contacts only.
  let pool: ContactRow[];
  let label: string;
  if (t.by === "name") {
    const want = plain(t.name), first = want.split(" ")[0];
    const scope = firmName ? atFirm(all, firmName) : uniq(all);
    const exact = scope.filter((r) => plain(r.name) === want);
    pool = exact.length ? exact : scope.filter((r) => { const n = plain(r.name); return want.includes(" ") ? n.startsWith(`${want} `) : n.split(" ")[0] === first; });
    label = `${t.name}${firmName ? ` at ${firmName}` : ""}`;
    if (!pool.length) return { reply: `No one named ${t.name}${firmName ? ` at ${firmName}` : ""} is in your contacts${firmName && atFirm(all, firmName).length ? ` (your contacts there: ${atFirm(all, firmName).slice(0, 5).map((r) => r.name).join(", ")})` : ""}. ${NO_FINDER} ${ADD_CONTACTS}`, intent: DRAFT_INTENT, status: "not_in_contacts" };
    if (pool.length > 1) return { reply: `More than one ${t.name} is in your contacts:\n${pool.slice(0, LIST_MAX).map((r) => `${lineOf(r)}${r.firm ? ` at ${r.firm}` : ""}`).join("\n")}\nSay which, with the full name and firm ("email ${pool[0].name} at ${pool[0].firm || "<firm>"}").`, intent: DRAFT_INTENT, status: "which" };
  } else {
    const here = atFirm(all, firmName!);
    const rw = t.role ? plain(t.role) : "";
    const isRecruiter = /recruit|talent|hr|people team/.test(rw);
    pool = !rw ? here : here.filter((r) => { const tt = plain(r.title); return isRecruiter ? /recruit|talent|sourc/.test(tt) : rw.split(" ").every((w) => tt.includes(w.replace(/s$/, ""))); });
    label = `${t.role ? `${t.role}s` : "your contacts"} at ${firmName}`;
    if (!pool.length) {
      const there = here.length ? ` Your contacts at ${firmName}: ${here.slice(0, 5).map((r) => `${r.name}${r.title ? ` (${r.title})` : ""}`).join(", ")}.` : "";
      return { reply: `${t.role ? `No ${t.role} at ${firmName}` : `No one at ${firmName}`} is in your ${plural(all.length, "contact")}.${there} ${NO_FINDER} ${ADD_CONTACTS}`, intent: DRAFT_INTENT, status: "none_at_firm" };
    }
  }
  const want = Math.max(1, Math.min(BATCH_MAX, t.by === "group" && t.count ? t.count : BATCH_MAX));
  const [dnc, contacted] = await Promise.all([o.store.dnc(o.userId), o.store.contacted(o.userId)]);
  // FAMILY NETWORKING: who was already written to, and how far it went. A by-name ask for someone whose only draft is
  // still waiting (never approved or sent) replaces that draft: the person changed their mind about what to say.
  const hist = o.store.history ? await o.store.history(o.userId, 500).catch(() => []) : [];
  const live = (email: string) => hist.filter((d) => d.recipient.email.toLowerCase() === email && d.status !== "skipped");
  const replace: OutreachDraft[] = [];
  const pick: ContactRow[] = [], held: { name: string; why: string }[] = [];
  for (const r of pool) {
    if (pick.length >= want) break;
    let why = await heldWhy(r, contacted, dnc);
    const mine = r.email ? live(r.email.toLowerCase()) : [];
    if (why === CONTACTED && t.by === "name" && mine.length && mine.every((d) => d.status === "shown")) { replace.push(...mine); why = null; }
    else if (why === CONTACTED && mine.some((d) => d.status === "approved")) why = `you approved an email to them that isn't sent yet (draft ${mine.find((d) => d.status === "approved")!.n}; say "cancel ${mine.find((d) => d.status === "approved")!.n}" to write a new one)`;
    else if (why === CONTACTED && mine.some((d) => ["sent", "replied"].includes(d.status))) why = `you already emailed them; say "follow up with ${r.name.split(" ")[0]}" for a follow-up`;
    if (why) held.push({ name: r.name, why }); else pick.push(r);
  }
  const considered = pick.length + held.length;
  const heldLine = held.length ? `Not drafted: ${held.map((h) => `${h.name} (${h.why})`).join("; ")}.` : "";
  if (!pick.length) return { reply: `I can't write to ${label}: ${held.map((h) => `${h.name}: ${h.why}`).join("; ")}. Nothing was drafted. To add an address, send a CSV with Name,Company,Email.`, intent: DRAFT_INTENT, status: "held" };
  const facts = confirmed(((o.state.profile as any)?.facts ?? []) as unknown[]);
  if (!facts.length) return { reply: `I write only from facts you've confirmed, and there are none on record yet, so nothing was drafted. Paste your resume here and confirm it, then ask again.`, intent: DRAFT_INTENT, status: "no_facts" };
  if (!o.model) return { reply: `Drafting emails isn't switched on here yet, so nothing was written or sent. From your contacts I would write to: ${pick.map((r) => `${r.name}${r.title ? `, ${r.title}` : ""}${r.firm ? ` at ${r.firm}` : ""} <${r.email}>`).join("; ")}.${heldLine ? ` ${heldLine}` : ""}`, intent: DRAFT_INTENT, status: "drafting_off" };
  const prefs = await o.store.prefs(o.userId);
  if (!prefs.signature) return { reply: SIGN_ASK, intent: SIGNATURE_INTENT, status: "needs_signature" };
  return await writeBatch(o, pick, held, considered, ask.topic, prefs.signature, facts, replace);
}

async function writeBatch(o: NetworkingDeps, pick: ContactRow[], held: { name: string; why: string }[], considered: number, topic: string | null, signature: string, facts: unknown[], replace: OutreachDraft[] = []): Promise<NetworkingResult> {
  const results: Drafted[] = [];
  for (let k = 0; k < pick.length; k += 5) results.push(...await Promise.all(pick.slice(k, k + 5).map((r) => draftFor({ model: o.model!, facts, r: recipientOf(r), topic }))));
  const footer = footerOf(signature), ok: Omit<OutreachDraft, "id" | "batch_id" | "thread_id">[] = [];
  const failed: { name: string; why: string }[] = [];
  for (const [k, d] of results.entries()) {
    if (!d.ok) { failed.push({ name: pick[k].name, why: d.why === "unverified" ? `I couldn't write it without saying something not on record (${d.detail.slice(0, 2).join("; ")})` : d.why === "model" ? "the writing model didn't answer" : d.detail.join("; ") }); continue; }
    const draft = { n: ok.length + 1, recipient: recipientOf(pick[k]), subject: d.subject, body: d.body, footer, shared: d.shared, status: "shown" as const, hash: "",
      approved_hash: null, approved_at: null, sent_at: null, gmail_id: null, gmail_thread: null, result: null, created_at: new Date(o.now).toISOString() };
    draft.hash = await payloadHash(messageOf(draft));
    ok.push(draft);
  }
  const notDone = [...held, ...failed];
  const notLine = notDone.length ? `Not drafted: ${notDone.map((h) => `${h.name} (${h.why})`).join("; ")}.` : "";
  if (!ok.length) return { reply: `Nothing was drafted (0/${considered}). ${notLine}`, intent: DRAFT_INTENT, status: "not_drafted" };
  const saved = await o.store.saveBatch(o.userId, o.threadId, ok, o.now);
  for (const d of saved) await recordOutreach(o.events, o.userId, "outreach_drafted", d, o.now, { from: "chat" });
  // The waiting drafts this one replaces are dropped, so only the new one can be approved.
  const gone: string[] = [];
  for (const d of replace) {
    if (!saved.some((x) => x.recipient.email.toLowerCase() === d.recipient.email.toLowerCase())) continue;
    if (await o.store.update(o.userId, { ...d, status: "skipped", approved_hash: null, approved_at: null, result: "replaced" }, { status: "shown" })) gone.push(d.recipient.name);
  }
  const head = `Drafted ${saved.length}/${considered}.${notLine ? ` ${notLine}` : ""}${gone.length ? ` This replaces your earlier draft to ${[...new Set(gone)].join(", ")}, which won't be sent.` : ""}`;
  const parts = [head, ...batchMessages(saved)];
  return { reply: parts.join("\n\n"), intent: OUTREACH_INTENT, status: "drafted", parts };
}

async function signatureTurn(o: NetworkingDeps): Promise<NetworkingResult | null> {
  const lines = String(o.message ?? "").replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sig = lines.slice(0, 4).join("\n");
  if (!sig || sig.length > 300 || lines.length > 4 || /\?\s*$/.test(sig) || /https?:/i.test(sig)) return null;
  await o.store.setPrefs(o.userId, { signature: sig });
  const before = o.previousAsk ? await o.previousAsk().catch(() => null) : null;
  const typed = before ? typedAddress(before) : null;
  const ask = typed ? parseNetworkingAsk(typed.text) : null;
  if (ask?.kind === "draft") {
    const r = await draftTurn(o, ask, typed?.email ?? null);
    return { ...r, reply: `Saved your signature.\n\n${r.reply}`, parts: r.parts ? [`Saved your signature.`, ...r.parts] : undefined };
  }
  return { reply: `Saved your signature:\n${sig}\nIt goes at the bottom of every email I draft for you.`, intent: "career_outreach_signature_saved", status: "saved" };
}
