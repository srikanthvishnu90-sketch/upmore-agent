// FEATURE NEEDS (2026-10-26): connectors from any channel, and the one next need on every apply reply that can't go on.
// Reached from agent-chat handleChat (Telegram, web, SMS: every channel's turn) through the FEATURE NEEDS blocks, after
// the code-first turns and before the router, so it can answer a connector ask itself and say the next need on a reply
// another turn wrote.
//   "connect gmail" (also google, email, inbox; Trainee's own offer too): a one-time link, bound to this person, the
//     channel the turn came on, its thread, the connector (connectors/index.ts) and the purpose it was asked for, that
//     opens the provider's consent for only the scopes the need asks for, each explained in plain words. The link lives
//     15 minutes and works once (career_connect_links); a GET only peeks, so a message preview can never use it. Google
//     refuses sign-in inside in-app browsers (Telegram's), so on Telegram the reply says to open it in the phone's browser
//     and carries meta.link_button ({ text, url }) for the adapter's URL button (a plain link, never a web_app). The
//     callback (career_connect_flow.ts) answers in the same channel and says how to carry on.
//   "disconnect gmail": the grant revoked at the provider, the stored tokens deleted (vault and connection row), live
//     links burned; the reply says what was removed and whether the provider confirmed the revoke.
//   "what can you see?": the truth from the records: what is connected and with which permissions, what Trainee reads
//     with it, the resume on file, what it can't see.
//   An apply reply that can't proceed: exactly the one next need (career_needs.ts), not a list; nothing the person already
//     gave is asked again. An application waiting on an employer's emailed code: the Gmail connect offered once
//     (career_needs_asked), never as a blocker.
//   A feature that needs Gmail and found none (inbox check, a follow-up or an email card's send): its unsigned app link is
//     replaced by a signed one for exactly that feature's scope.
// Never a password, a code or a token through chat: the link goes to the provider's own page, and no function here
// returns a token (connectors/grant_store.ts holds them).
import { contactDraft } from "./contact_draft.ts";
import { eligibilityDraft } from "./eligibility_draft.ts";
import { hasConfirmedResume, NO_RESUME_WAIT, prepareConfigured } from "./career_apply_from_chat.ts";
import { applyAsk, applyManyAsk, APPLY_QUEUE_INTENT } from "./career_apply_chat.ts";
import { linkAsk, possessiveAsk } from "./career_apply_link.ts";
import { connectUrl } from "./agent/integrations.ts";
import { type Goal, type Known, type Need, needSentence, type NeedsState, nextNeed, READ_SCOPE, SEND_SCOPE, type Target } from "./career_needs.ts";
import { type Capability, type Connector, connectorOf } from "./connectors/index.ts";
import { deleteGrant, type Grant, readGrant as readConnectorGrant } from "./connectors/grant_store.ts";

export const CONNECT_INTENT = "career_connect";
export const LINK_MINUTES = 15;
const GOOGLE = connectorOf("google")!;
export type Purpose = "connect" | "email_code" | "track_replies" | "outreach" | "send_email";

// ------------------------------------------------------------------------------------------------ the asks
export type ConnectorAsk = "connect" | "disconnect" | "see";
const SOURCE = "(?:my\\s+)?(?:gmail|google(?:\\s+account)?|e-?mail|inbox|mail)(?:\\s+account)?";
// "connect" never matches "connected" or "linked" (the inbox check's "I connected my Gmail"): a space must follow it.
const CONNECT = new RegExp(`\\b(?:connect|link|hook\\s+up|set\\s+up)\\s+(?:to\\s+|with\\s+)?${SOURCE}\\b`, "i");
const DISCONNECT = new RegExp(`\\b(?:disconnect|unlink|revoke|remove)\\s+(?:access\\s+to\\s+)?${SOURCE}\\b|\\b(?:turn\\s+off|stop)\\s+(?:reading\\s+)?${SOURCE}\\b`, "i");
const SEE = /\bwhat\s+(?:can|do)\s+you\s+(?:see|access|read|have\s+access\s+to)\b|\bwhat(?:'s|\s+is)\s+connected\b|\bwhat\s+(?:have\s+i|did\s+i)\s+connected\b/i;
export function connectorAsk(message: string): ConnectorAsk | null {
  const t = String(message ?? "").trim();
  if (!t || t.length > 300) return null;
  if (DISCONNECT.test(t)) return "disconnect";
  if (CONNECT.test(t)) return "connect";
  if (SEE.test(t)) return "see";
  return null;
}

// ------------------------------------------------------------------------------------------------ plain words
const capOf = (c: Connector, scope: string): Capability | null => (scope === c.scopes.read ? "read" : scope === c.scopes.send ? "send" : null);
export function scopeLines(scopes: string[], c: Connector = GOOGLE): string[] {
  return scopes.map((s) => capOf(c, s)).filter((x): x is Capability => !!x).map((k) => `- ${c.words[k]}`);
}
// Google refuses OAuth inside an app's own browser (its "disallowed_useragent" error), which is what Telegram opens links in.
export const TELEGRAM_BROWSER = "Open it in your phone's browser (Safari or Chrome): Google doesn't allow signing in inside Telegram's own browser. If it opens inside Telegram, use that page's menu to open it in your browser.";
export function connectReply(o: { scopes: string[]; url: string; lead?: string | null; channel?: string; c?: Connector }): string {
  const c = o.c ?? GOOGLE;
  return [
    o.lead ?? `Here's your link to connect ${c.label}.`,
    `It opens Google's own page and asks for only this:`,
    ...scopeLines(o.scopes, c),
    `Google also tells me which address you connected, so I can confirm it here.`,
    `The link works once, for you, and expires in ${LINK_MINUTES} minutes. I'll never ask for your password or a code in this chat.`,
    ...(o.channel === "telegram" ? [TELEGRAM_BROWSER] : []),
    "",
    o.url,
  ].join("\n");
}
const linkMeta = (url: string, channel: string, c: Connector = GOOGLE) => (channel === "telegram" ? { link_button: { text: `Connect ${c.label}`, url } } : null);

// ------------------------------------------------------------------------------------------------ the records
// deno-lint-ignore no-explicit-any
type Admin = any;
export type { Grant };
export const readGrant = (admin: Admin, userId: string) => readConnectorGrant(admin, GOOGLE, userId);

// The channel this turn came on: a channel's turn (service role) runs in the thread its contact row names; else the web.
export async function channelOf(admin: Admin, userId: string, threadId: string, bridge: boolean): Promise<string> {
  if (!bridge) return "web";
  const { data } = await admin.from("channel_contacts").select("channel").eq("user_id", userId).eq("thread_id", threadId).limit(1);
  const ch = Array.isArray(data) && data[0]?.channel ? String(data[0].channel) : "";
  return ["telegram", "imessage", "whatsapp"].includes(ch) ? ch : "home";
}

export function linkBase(env: { get(k: string): string | undefined }): string | null {
  const u = env.get("CAREER_CONNECT_URL") || (env.get("SUPABASE_URL") ? `${String(env.get("SUPABASE_URL")).replace(/\/+$/, "")}/functions/v1/career-connect` : "");
  return u || null;
}
// A fresh one-time link for exactly these scopes (plus the connector's identity scopes, to name the address), or null when
// none was made.
export async function mintLink(admin: Admin, o: { userId: string; channel: string; threadId: string | null; scopes: string[]; purpose: Purpose; now: number; base: string | null; c?: Connector }): Promise<string | null> {
  const c = o.c ?? GOOGLE;
  if (!o.base) return null;
  const scopes = [...new Set([...o.scopes.filter((s) => capOf(c, s)), ...c.identity])];
  const { data, error } = await admin.rpc("career_connect_link_issue", { p_user: o.userId, p_channel: o.channel, p_thread: o.threadId, p_scopes: scopes,
    p_now: new Date(o.now).toISOString(), p_connector: c.id, p_purpose: o.purpose });
  if (error || typeof data !== "string" || !data) { if (error) console.error("connect link:", error.message); return null; }
  return `${o.base}?t=${encodeURIComponent(data)}`;
}

// "disconnect gmail": every grant of the connector revoked at the provider, its vault entry and row deleted, live links burned.
export async function disconnectGoogle(admin: Admin, o: { userId: string; fetch: typeof fetch; now: number }): Promise<{ removed: string[]; revoked: boolean | null }> {
  const burned = await admin.rpc("career_connect_links_burn", { p_user: o.userId, p_now: new Date(o.now).toISOString() });
  if (burned.error) throw new Error("burn the live connect links");
  return await deleteGrant(admin, GOOGLE, { userId: o.userId, fetch: o.fetch });
}

// ------------------------------------------------------------------------------------------------ the person's state
interface Said { text: string; at: string; id: number }
const EMAIL_IN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const PHONE_IN = /(?:\+?\d[\d ().-]{7,}\d)/;
// The contact lines of the resume the person confirmed as theirs, read from their own upload (the message the confirmed
// entries cite): the email and phone as written there, and the name only as the line right above them, when it is a name.
export function resumeContact(upload: string): { name: string | null; email: string | null; phone: string | null } {
  const lines = String(upload ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 12);
  const at = lines.findIndex((l) => EMAIL_IN.test(l) || PHONE_IN.test(l));
  if (at < 0) return { name: null, email: null, phone: null };
  const head = lines.slice(at, at + 3).join(" | ");
  const email = head.match(EMAIL_IN)?.[0] ?? null;
  const phone = head.replace(EMAIL_IN, " ").match(PHONE_IN)?.[0]?.trim() ?? null;
  const above = at > 0 ? lines[at - 1].replace(/\s*\([^)]*\)\s*/g, " ").trim() : "";
  const name = /^[\p{Lu}][\p{L}'’-]+(?:\s+[\p{Lu}][\p{L}'’.-]*){1,3}$/u.test(above) ? above : null;
  return { name, email, phone };
}

// deno-lint-ignore no-explicit-any
export async function readNeedsState(admin: Admin, o: { userId: string; profile: any; stated?: any[]; situation: any | null }): Promise<NeedsState> {
  const profile = o.profile ?? {};
  const facts: any[] = Array.isArray(profile.facts) ? profile.facts : [];
  let resume: NeedsState["resume"] = hasConfirmedResume(profile) ? "confirmed" : facts.some((f) => f?.source === "resume-ingest") ? "drafts" : "none";
  if (resume !== "confirmed") {
    // Confirmed in another thread: the profile the server prepares from (its most recent thread's). A read that fails
    // leaves "none" unknown (it decides nothing); drafts here stay drafts.
    const r = await admin.rpc("career_apply_profile_for", { p_user: o.userId }).then((x: any) => x, () => ({ error: true }));
    if (!r?.error && hasConfirmedResume(r?.data)) resume = "confirmed";
    else if (r?.error && resume === "none") resume = "unknown";
  }
  // The person's own words, newest first, from every one of their threads; and the resume upload the confirmed entries cite.
  const threads = await admin.from("agent_threads").select("id").eq("user_id", o.userId).limit(200);
  const ids: string[] = (threads.data ?? []).map((t: any) => String(t.id));
  let said: Said[] = [];
  if (ids.length) {
    const m = await admin.from("agent_messages").select("id,content,created_at").in("thread_id", ids).eq("role", "user").order("id", { ascending: false }).limit(200);
    said = (m.data ?? []).map((r: any) => ({ id: Number(r.id), text: String(r.content ?? ""), at: String(r.created_at ?? "") }));
  }
  const uploadId = facts.filter((f) => f?.status === "confirmed" && f?.confirmation_event_id).map((f) => String(f?.source_ref?.upload ?? "")).find((u) => /^agent_messages:\d+$/.test(u));
  const upload = uploadId ? said.find((s) => s.id === Number(uploadId.split(":")[1]))?.text ?? "" : "";
  const fromResume = resume === "confirmed" && upload ? resumeContact(upload) : { name: null, email: null, phone: null };
  const basics = profile.basics && typeof profile.basics === "object" ? profile.basics : {};
  const words = said.map(({ text, at }) => ({ text, at }));
  const pick = (fromProfile: unknown, draft: { value: string } | null, resumeValue: string | null): Known | null =>
    typeof fromProfile === "string" && fromProfile.trim() ? { value: fromProfile.trim(), from: "profile" }
      : draft ? { value: draft.value, from: "said" } : resumeValue ? { value: resumeValue, from: "resume" } : null;
  const nameDraft = contactDraft("full_name", words) ?? (() => {
    const f = contactDraft("first_name", words), l = contactDraft("last_name", words);
    return f && l ? { value: `${f.value} ${l.value}` } : null;
  })();
  // What the person stated in chat, as the router kept it (ctx.statedFacts: "I don't need sponsorship" lands there).
  const stated: any[] = Array.isArray(o.stated) ? o.stated : [];
  const statedKind = (k: string) => stated.find((f) => f?.kind === k)?.value ?? null;
  const elig = (k: "work_authorization" | "sponsorship"): Known | null => {
    const d = eligibilityDraft(k, words);
    if (d) return { value: d.value, from: "said" };
    const c = profile.constraints ?? {};
    if (k === "sponsorship" && typeof c.needsSponsorship === "boolean") return { value: c.needsSponsorship ? "Yes" : "No", from: "said" };
    if (k === "work_authorization" && typeof c.workAuthorization === "string" && c.workAuthorization && !/sponsorship/i.test(c.workAuthorization)) return { value: c.workAuthorization, from: "said" };
    const v = statedKind(k);
    return v ? { value: String(v), from: "said" } : null;
  };
  const grant = await readGrant(admin, o.userId).catch(() => null);
  const asked = await admin.from("career_needs_asked").select("need").eq("user_id", o.userId).limit(100);
  const tasks: any[] = Array.isArray(o.situation?.tasks) ? o.situation.tasks : [];
  return {
    resume,
    contact: { name: pick(basics.name, nameDraft, fromResume.name), email: pick(basics.email, contactDraft("email", words), fromResume.email), phone: pick(basics.phone, contactDraft("phone", words), fromResume.phone) },
    eligibility: { work_authorization: elig("work_authorization"), sponsorship: elig("sponsorship") },
    scopes: grant?.scopes ?? [],
    pending: tasks.filter((t) => t?.kind === "application").map((t) => ({ id: String(t.id), company: t.company ?? null, title: t.title ?? null, state: String(t.state), reason: t.evidence?.reason ?? null })),
    offered: (asked.data ?? []).map((r: any) => String(r.need)),
  };
}

// ------------------------------------------------------------------------------------------------ the apply gate
// The resume comes first for any application: with no confirmed resume, an apply ask queues nothing and says the one
// thing needed. With the server prepare configured the apply turn already refuses with its own no_resume reply (which
// asks only for the resume), so the gate stands aside; without it the apply turn queues a want nothing can be prepared
// from (FEATURE 1's design, which its tests hold), so the gate runs only with CAREER_NEEDS_RESUME_FIRST=on (the owner's
// "no queue row before the resume"). Only the resume holds an apply ask: every other need is said after it is queued.
export function gateNeed(state: NeedsState, target: Target | null): Need | null {
  const need = nextNeed(state, "apply", target);
  return need && (need.id === "resume" || need.id === "resume_confirm") ? need : null;
}
export async function applyGate(d: { admin: Admin; message: string; userId: string; profile: any; stated?: any[]; situation: any | null;
  env: { get(k: string): string | undefined }; shortlist?: unknown[] | null }): Promise<NeedsTurnOut | null> {
  const m = d.message;
  const link = linkAsk(m), one = link ? null : applyAsk(m) ?? possessiveAsk(m);
  const many = link || one ? null : (Array.isArray(d.shortlist) && d.shortlist.length ? applyManyAsk(m) : null);
  if (!link && !one && !many) return null;
  if (d.env.get("CAREER_NEEDS_RESUME_FIRST") !== "on" || prepareConfigured(d.env)) return null;
  const target = one ? { company: one.company, title: one.role } : null;
  const need = gateNeed(await readNeedsState(d.admin, { userId: d.userId, profile: d.profile, stated: d.stated, situation: d.situation }), target);
  if (!need) return null;
  const what = one ? `${one.role ? `the ${one.role} role at ` : ""}${one.company}` : link ? "that posting" : "those postings";
  return { reply: `I haven't put ${what} on your apply list yet. ${needSentence(need)} Then ask me again and I'll queue it.`, intent: APPLY_QUEUE_INTENT, resultStatus: "needs_resume", handler: "apply_queue" };
}

// ------------------------------------------------------------------------------------------------ the turn
export interface NeedsTurnOut { reply: string; intent: string; resultStatus: string; handler: string; meta?: Record<string, unknown> | null; parts?: string[] }
// What the other code-first turns of this request answered (each null when it did not).
export interface Answered {
  // deno-lint-ignore no-explicit-any
  queued?: any; stood?: any; status?: any; f08?: any; outreach?: any; emailed?: any; other?: boolean;
  // The apply gate's answer (applyGate), when it held an apply ask for the resume.
  gate?: NeedsTurnOut | null;
}
export interface NeedsTurnDeps {
  admin: Admin; message: string; userId: string; threadId: string; bridge: boolean; now: number;
  // deno-lint-ignore no-explicit-any
  profile: any; stated?: any[]; situation: any | null; answered: Answered;
  env: { get(k: string): string | undefined }; fetch: typeof fetch;
}

const UNSIGNED = connectUrl("gmail");
const replaceLink = (text: string, url: string) => String(text).split(UNSIGNED).join(url);
const withMeta = (a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null) => (a || b ? { ...(a ?? {}), ...(b ?? {}) } : null);

export async function needsTurn(d: NeedsTurnDeps): Promise<NeedsTurnOut | null> {
  const a = d.answered;
  if (a.gate) return a.gate;
  const anyAnswer = !!(a.other || a.queued || a.stood || a.status || a.f08 || a.outreach || a.emailed);
  const ask = anyAnswer ? null : connectorAsk(d.message);
  const base = linkBase(d.env);
  let channel: string | null = null;
  const chan = async () => (channel ??= await channelOf(d.admin, d.userId, d.threadId, d.bridge));
  const link = async (scopes: string[], purpose: Purpose) => mintLink(d.admin, { userId: d.userId, channel: await chan(), threadId: d.threadId, scopes, purpose, now: d.now, base });

  if (ask === "connect") {
    const grant = await readGrant(d.admin, d.userId);
    const wanted = /\b(?:send|sending|outreach)\b/i.test(d.message) && !/\bread\b/i.test(d.message) ? [SEND_SCOPE] : /\bread\b/i.test(d.message) && !/\bsend\b/i.test(d.message) ? [READ_SCOPE] : [READ_SCOPE, SEND_SCOPE];
    const missing = wanted.filter((s) => !(grant?.scopes ?? []).includes(s));
    if (grant && grant.scopes.length && !missing.length) {
      return { reply: `Gmail is already connected${grant.email ? `: ${grant.email}` : ""}, with:\n${scopeLines(wanted).join("\n")}\nSay "disconnect gmail" to remove it.`, intent: CONNECT_INTENT, resultStatus: "already", handler: "connectors" };
    }
    const url = await link(missing, "connect");
    if (!url) return { reply: "I couldn't make a connect link just now, so nothing was connected. Try \"connect gmail\" again in a minute.", intent: CONNECT_INTENT, resultStatus: "unavailable", handler: "connectors" };
    return { reply: connectReply({ scopes: missing, url, channel: await chan() }), intent: CONNECT_INTENT, resultStatus: "link", handler: "connectors", meta: linkMeta(url, await chan()) };
  }
  if (ask === "disconnect") {
    let r: { removed: string[]; revoked: boolean | null };
    try { r = await disconnectGoogle(d.admin, { userId: d.userId, fetch: d.fetch, now: d.now }); }
    catch (e) {
      console.error("disconnect:", (e as Error)?.message ?? e);
      return { reply: "I couldn't finish disconnecting Gmail just now, so it may still be connected. Say \"disconnect gmail\" again, and you can also remove Trainee at myaccount.google.com/permissions.", intent: CONNECT_INTENT, resultStatus: "failed", handler: "connectors" };
    }
    if (!r.removed.length) return { reply: "Gmail isn't connected, so there was nothing to disconnect. Nothing of yours is stored from Google.", intent: CONNECT_INTENT, resultStatus: "none", handler: "connectors" };
    const google = r.revoked === true ? "Google confirmed the access is revoked" : "Google didn't confirm the revoke, so you can also remove Trainee at myaccount.google.com/permissions";
    return { reply: `Gmail disconnected. The stored tokens are deleted and ${google}. I can't read or send anything from your Gmail now, and any connect link I sent you no longer works.`, intent: CONNECT_INTENT, resultStatus: "disconnected", handler: "connectors" };
  }
  if (ask === "see") return { reply: await seeReply(d), intent: CONNECT_INTENT, resultStatus: "shown", handler: "connectors" };

  // A Gmail feature that found no grant: its unsigned app link becomes a signed one for exactly that feature's scope.
  const reading = a.f08?.intent === "career_inbox_check";
  for (const [turn, scope, handler, purpose] of [[a.f08, reading ? READ_SCOPE : SEND_SCOPE, "followup", reading ? "track_replies" : "send_email"], [a.outreach, SEND_SCOPE, "outreach", "outreach"]] as const) {
    if (turn && typeof turn.reply === "string" && turn.reply.includes(UNSIGNED)) {
      const url = await link([scope], purpose);
      if (!url) return null;
      const text = replaceLink(turn.reply.replace(/connect it in the Trainee app[^,.]*|Connect Gmail in the Trainee app[^,.]*/g, (m: string) => m.replace(/in the Trainee app/, "with the link below")), url);
      return { reply: `${text}\n${scopeLines([scope]).join("\n")}${(await chan()) === "telegram" ? `\n${TELEGRAM_BROWSER}` : ""}`,
        intent: turn.intent, resultStatus: turn.status, handler, meta: withMeta(turn.meta, linkMeta(url, await chan())), ...(turn.parts ? { parts: turn.parts } : {}) };
    }
  }

  // The apply reply: exactly the one next need, when there is one.
  if (a.queued && ["queued", "already", "no_resume"].includes(a.queued.status) && !a.queued.ask?.length) {
    const state = await readNeedsState(d.admin, { userId: d.userId, profile: d.profile, stated: d.stated, situation: d.situation });
    const p = a.queued.posting ?? a.queued.queued?.[0] ?? a.queued.refused?.[0] ?? null;
    const target: Target | null = p ? { company: p.company ?? null, title: p.title ?? null, ...targetForm(d.situation, p.company) } : null;
    const need = nextNeed(state, "apply", target);
    if (!need) {
      if (state.resume !== "confirmed" || a.queued.status === "no_resume") return null;
      const from = [state.contact.name, state.contact.email].every((k) => k?.from === "resume") ? " (your name and email are on your resume)" : "";
      return { reply: `${a.queued.reply}\nThere's nothing else I need from you for it right now${from}.`, intent: a.queued.intent, resultStatus: a.queued.status, handler: "apply_queue" };
    }
    if (a.queued.status === "no_resume" && need.id === "resume") return null; // its own reply already asks only for the resume
    // The apply turn's own words stand (what was queued, what was not, what happens next); its resume sentence becomes
    // the one need, said once.
    const said = await needReply(d, need, link, chan);
    if (said === null) return null;
    const reply = a.queued.reply.includes(NO_RESUME_WAIT) ? a.queued.reply.replace(NO_RESUME_WAIT, said.text) : `${a.queued.reply}\n${said.text}`;
    return { reply, intent: a.queued.intent, resultStatus: a.queued.status, handler: "apply_queue", meta: said.meta };
  }
  // A status reply while an employer's emailed code waits: the Gmail offer, once.
  const statusTurn = a.stood ?? a.status;
  if (statusTurn && typeof statusTurn.reply === "string") {
    const state = await readNeedsState(d.admin, { userId: d.userId, profile: d.profile, stated: d.stated, situation: d.situation });
    const need = nextNeed(state, "email_code");
    if (!need || need.id !== "gmail_read") return null;
    const said = await needReply(d, need, link, chan);
    if (said === null) return null;
    return { reply: `${statusTurn.reply}\n${said.text}`, intent: statusTurn.intent, resultStatus: statusTurn.status, handler: a.stood ? "standing" : "status", meta: said.meta };
  }
  return null;
}

// The open questions on file for a company's application, as the form's requirements (never guessed).
// deno-lint-ignore no-explicit-any
function targetForm(situation: any, company: string | null): { open_questions?: string[] } {
  const qs = (Array.isArray(situation?.tasks) ? situation.tasks : []).filter((t: any) => t?.kind === "question" && company && String(t.company ?? "").toLowerCase() === String(company).toLowerCase());
  return qs.length ? { open_questions: qs.map((q: any) => String(q.title)) } : {};
}
// The need in words, with its link when it is a Gmail need. An offer made without being asked is made once: the mark in
// career_needs_asked is the one record (two turns at once both reach here; only the first mark is true). null: already
// offered, so nothing is added.
async function needReply(d: NeedsTurnDeps, need: Need, link: (scopes: string[], purpose: Purpose) => Promise<string | null>, chan: () => Promise<string>): Promise<{ text: string; meta: Record<string, unknown> | null } | null> {
  const text = needSentence(need);
  if (!need.scopes?.length) return { text, meta: null };
  if (need.offer_once) {
    const first = await d.admin.rpc("career_needs_mark", { p_user: d.userId, p_need: need.offer_once, p_now: new Date(d.now).toISOString() });
    if (first.error || first.data !== true) return null;
  }
  const url = await link(need.scopes, need.id === "gmail_read" && need.offer_once ? "email_code" : need.id === "gmail_send" ? "outreach" : "track_replies");
  if (!url) return { text: `${text} Say "connect gmail" when you want the link.`, meta: null };
  const ch = await chan();
  return { text: `${text}\n${scopeLines(need.scopes).join("\n")}\nThe link works once and expires in ${LINK_MINUTES} minutes.${ch === "telegram" ? ` ${TELEGRAM_BROWSER}` : ""}\n${url}`, meta: linkMeta(url, ch) };
}

async function seeReply(d: NeedsTurnDeps): Promise<string> {
  const grant = await readGrant(d.admin, d.userId);
  const state = await readNeedsState(d.admin, { userId: d.userId, profile: d.profile, stated: d.stated, situation: d.situation });
  const lines: string[] = [];
  if (grant && grant.scopes.length) {
    const can = [grant.scopes.includes(READ_SCOPE) ? "read" : null, grant.scopes.includes(SEND_SCOPE) ? "send" : null].filter(Boolean).join(" and ");
    lines.push(`Gmail: connected${grant.email ? ` as ${grant.email}` : ""}${can ? ` (${can})` : ""}.`);
    if (grant.scopes.includes(READ_SCOPE)) lines.push("- When I check your mail for employers' replies, I read the sender, subject, date and Google's short preview of new mail, not the full messages. During an application you approved, I read only the code email from that application system.");
    if (grant.scopes.includes(SEND_SCOPE)) lines.push("- I send only a message you approved word for word here.");
  } else lines.push(`Gmail: not connected, so I can't see any of your email. Say "connect gmail" if you want me to read employers' replies and codes.`);
  lines.push(state.resume === "confirmed" ? "Your resume: on file, confirmed by you." : state.resume === "drafts" ? "Your resume: read, but you haven't told me it's yours yet." : state.resume === "none" ? "Your resume: not on file." : "Your resume: I couldn't read that record just now.");
  const apps = state.pending.length;
  lines.push(`Your applications through Trainee: ${apps ? `${apps} on record` : "none on record"}.`);
  lines.push("I can't see your LinkedIn, Indeed, passwords, files on your devices, or anything you haven't sent me or connected.");
  return lines.join("\n");
}

export type { Goal };
