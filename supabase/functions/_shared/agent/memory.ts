// WO-023 part B (B1-B3): what Trainee knows about the person, built in code for every turn and put in the system prompt,
// so the model never has to remember to look. Three sources, none of them the model's words:
//   - standing instructions: what the person said must always hold ("I need visa sponsorship", "no staffing agencies"),
//     kept on the account (career_watch_kv key career:standing, wiped by an erase with the rest of the account);
//   - the profile (confirmed facts, and drafts still waiting for their yes) and their job alerts, in exact terms;
//   - the application pipeline: prepared and waiting, an open card, queued, sent against the daily limit, and each one
//     stopped on something only the person can give, with that thing named.
// The block has a size budget. Standing instructions are never dropped; past the budget the oldest facts and the
// oldest pipeline lines go first, and the block says how many it left out.
import type { AlertPrefs } from "../career_alerts.ts";
import { dailyLimit } from "../career_apply.ts";

export interface Standing { id: string; text: string; said: string; at: string }
export interface MemoryStore {
  standing(userId: string): Promise<Standing[]>;
  saveStanding(userId: string, items: Standing[]): Promise<void>;
}
export const MAX_STANDING = 20, STANDING_TEXT = 160, STANDING_QUOTE = 300;

export function memoryStandingStore(initial: Record<string, Standing[]> = {}): MemoryStore & { dump(): Record<string, Standing[]> } {
  const st: Record<string, Standing[]> = JSON.parse(JSON.stringify(initial));
  return {
    async standing(u) { return JSON.parse(JSON.stringify(st[u] ?? [])); },
    async saveStanding(u, items) { st[u] = JSON.parse(JSON.stringify(items)); },
    dump() { return JSON.parse(JSON.stringify(st)); },
  };
}
export function supabaseMemoryStore(admin: any): MemoryStore {
  return {
    async standing(u) {
      const r = await admin.from("career_watch_kv").select("value").eq("user_id", u).eq("key", "career:standing").maybeSingle();
      if (r.error) throw new Error(`read standing instructions: ${r.error.message}`);
      const items = r.data?.value?.items;
      return Array.isArray(items) ? items.filter((x: any) => x && typeof x.id === "string" && typeof x.text === "string") : [];
    },
    async saveStanding(u, items) {
      const r = await admin.from("career_watch_kv").upsert({ user_id: u, key: "career:standing", value: { items, updated_at: new Date().toISOString() } }, { onConflict: "user_id,key" });
      if (r.error) throw new Error(`save standing instructions: ${r.error.message}`);
    },
  };
}

// Words compared without case, punctuation or extra spaces: a quote is the person's when it appears in their message.
export const plain = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9$%]+/g, " ").trim();
export function quotedFrom(message: string, quote: string): boolean {
  const q = plain(quote);
  return q.split(" ").filter(Boolean).length >= 2 && ` ${plain(message)} `.includes(` ${q} `);
}
export function addStanding(items: Standing[], o: { text: string; said: string; now: number }): { ok: true; item: Standing; items: Standing[] } | { ok: false; error: string } {
  const text = String(o.text ?? "").replace(/\s+/g, " ").trim(), said = String(o.said ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > STANDING_TEXT) return { ok: false, error: `say the instruction in 1 to ${STANDING_TEXT} characters` };
  if (said.length > STANDING_QUOTE) return { ok: false, error: `quote at most ${STANDING_QUOTE} characters of their message` };
  const same = items.find((x) => plain(x.text) === plain(text));
  if (same) return { ok: true, item: same, items };
  if (items.length >= MAX_STANDING) return { ok: false, error: `${MAX_STANDING} standing instructions are kept already; ask which one to drop first` };
  const n = items.reduce((m, x) => Math.max(m, Number(/^S-(\d+)$/.exec(x.id)?.[1] ?? 0)), 0) + 1;
  const item = { id: `S-${String(n).padStart(3, "0")}`, text, said, at: new Date(o.now).toISOString() };
  return { ok: true, item, items: [...items, item] };
}

// The application pipeline, from the queue's own rows (career_apply_prepared, career_apply_cards, career_apply_jobs).
export interface PipelineRows {
  prepared: { state: string }[];
  openCard: { shown_at: string; items: unknown[] } | null;
  jobs: { company: string; url: string; state: string; reason: string | null; created_at: string; updated_at: string }[];
  dailyLimit?: unknown;
  openQuestions?: number | null; // null: could not be read
}
export interface Pipeline {
  waiting: number; card: { shown_at: string; count: number } | null; queued: number;
  sent_24h: number; limit: number; questions: number | null;
  needs: { company: string; url: string; what: string }[];
  recent: { company: string; state: string; at: string }[];
}
const COUNTED = new Set(["queued", "driving", "confirmed", "submitted_unconfirmed", "needs_user", "unknown_outcome"]);
const NEEDS: Record<string, string> = {
  email_code: "the employer emailed them a code to enter",
  captcha: "a verification only they can complete",
  needs_answers: "answers to questions on the form",
};
export function summarizePipeline(r: PipelineRows, now: number): Pipeline {
  const day = now - 86400000;
  const needs = r.jobs.filter((j) => j.state === "needs_user")
    .map((j) => ({ company: j.company, url: j.url, what: NEEDS[String(j.reason)] ?? (j.reason ? `their help: ${j.reason}` : "their help") }));
  const recent = r.jobs.filter((j) => ["confirmed", "submitted_unconfirmed", "failed", "not_submitted", "unknown_outcome"].includes(j.state))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((j) => ({ company: j.company, state: j.state, at: j.updated_at }));
  return {
    waiting: r.prepared.filter((p) => p.state === "ready" || p.state === "shown").length,
    card: r.openCard && Date.parse(r.openCard.shown_at) >= day ? { shown_at: r.openCard.shown_at, count: r.openCard.items.length } : null,
    queued: r.jobs.filter((j) => j.state === "queued" || j.state === "driving").length,
    sent_24h: r.jobs.filter((j) => COUNTED.has(j.state) && Date.parse(j.created_at) > day).length,
    limit: dailyLimit({ daily: r.dailyLimit as number }),
    questions: r.openQuestions === null ? null : Number(r.openQuestions) || 0,
    needs, recent,
  };
}
export async function readPipeline(admin: any, userId: string, now: number): Promise<Pipeline> {
  const must = (r: any, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
  const since = new Date(now - 3 * 86400000).toISOString();
  const [prepared, cards, jobs, account, questions] = await Promise.all([
    admin.from("career_apply_prepared").select("state").eq("user_id", userId).in("state", ["ready", "shown"]).limit(500),
    admin.from("career_apply_cards").select("shown_at,items").eq("user_id", userId).eq("state", "open").order("shown_at", { ascending: false }).limit(1),
    admin.from("career_apply_jobs").select("company,url,state,reason,created_at,updated_at").eq("user_id", userId).or(`updated_at.gte.${since},state.in.(queued,driving,needs_user)`).limit(500),
    admin.from("career_watch_kv").select("value").eq("user_id", userId).eq("key", "career:account").maybeSingle(),
    admin.from("career_apply_questions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("state", "open"),
  ]);
  if (questions.error) console.error("agent memory: open questions", questions.error.message);
  return summarizePipeline({
    prepared: must(prepared, "read prepared applications") ?? [],
    openCard: (must(cards, "read the open card") ?? [])[0] ?? null,
    jobs: must(jobs, "read the application queue") ?? [],
    dailyLimit: must(account, "read the account")?.value?.daily_limit,
    openQuestions: questions.error ? null : questions.count ?? 0,
  }, now);
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export function alertLine(a: { prefs: AlertPrefs; tz: string } | null): string {
  if (!a) return "Job alerts: none set.";
  const p = a.prefs;
  if (!p.on) return `Job alerts: stopped (last set for ${p.keywords.join(", ") || "nothing"}${p.locations.length ? " in " + p.locations.join(" or ") : ""}).`;
  const where = [p.locations.length ? p.locations.join(" or ") : "anywhere", p.remote_ok ? "remote allowed" : "no remote"].join(", ");
  const f = p.floor || {};
  const floor = [
    f.min_pay ? `nothing under ${money(f.min_pay.amount)} a ${f.min_pay.period}` : "",
    f.levels?.length ? `levels ${f.levels.join(", ")}` : "",
    f.types?.length ? `types ${f.types.join(", ")}` : "",
    f.exclude_words?.length ? `not ${f.exclude_words.join(", ")}` : "",
    f.exclude_companies?.length ? `not at ${f.exclude_companies.join(", ")}` : "",
    f.allow_staffing === false ? "no staffing agencies" : "",
  ].filter(Boolean).join("; ");
  return `Job alerts: on, for ${p.keywords.join(", ")}; ${where}${floor ? "; " + floor : ""}; at most ${p.max_instant_per_day} instant texts a day; daily report at ${p.report_hour}:00; quiet ${p.quiet_start}:00-${p.quiet_end}:00 (${a.tz}).`;
}
const STATE: Record<string, string> = {
  confirmed: "the employer confirmed it", submitted_unconfirmed: "sent, the employer has not confirmed it yet",
  failed: "failed before sending", not_submitted: "not sent", unknown_outcome: "outcome unknown, not resent",
};

export const BLOCK_BUDGET = 4500;
export function personBlock(o: { profile?: any; standing: Standing[]; alerts: { prefs: AlertPrefs; tz: string } | null; pipeline: Pipeline | null; budget?: number }): string {
  const facts = Array.isArray(o.profile?.facts) ? o.profile.facts : [];
  const confirmed = facts.filter((f: any) => !f.needs_confirmation && f.status !== "draft");
  const drafts = facts.filter((f: any) => f.needs_confirmation || f.status === "draft");
  const head = [
    "WHAT YOU KNOW ABOUT THIS PERSON. Upmore keeps this from their account, not from this chat. Use it; never contradict it; never add to it.",
    "",
    "Standing instructions (they said these must always hold; follow every one, mention it when it shapes an answer, never ask for it again):",
    ...(o.standing.length ? o.standing.map((s) => `- ${s.id}: ${s.text} (they said: "${s.said}", ${s.at.slice(0, 10)})`) : ["- none yet"]),
  ];
  const p = o.pipeline;
  const pipeline = p
    ? [
      `Applications: ${p.waiting} prepared and waiting for their yes${p.card ? ` (a card of ${p.card.count} is open, shown ${p.card.shown_at.slice(0, 16).replace("T", " ")} UTC; their yes, "yes but not 2" or "no" answers it)` : p.waiting ? ' (texting "show my applications" shows them)' : ""}; ${p.queued} approved and waiting to run on their computer; ${p.sent_24h} of their ${p.limit} a day used in the last 24 hours.`,
      ...(p.questions === null ? ["Questions only they can answer: could not be read this turn; never guess."]
        : p.questions ? [`Questions only they can answer, holding up applications: ${p.questions} (texting "what do you need from me" shows them; never answer one for them).`] : []),
      ...(p.needs.length ? ["Stopped until they help:", ...p.needs.map((n) => `- ${n.company} (${n.url}): ${n.what}`)] : []),
      ...p.recent.map((r) => `- ${r.company}: ${STATE[r.state] ?? r.state} (${r.at.slice(0, 10)})`),
    ]
    : ["Applications: could not be read this turn; say so if they ask, never guess."];
  const optional = [
    alertLine(o.alerts),
    ...pipeline,
    "Confirmed facts (usable in applications):",
    ...(confirmed.length ? confirmed.map((f: any) => `- [${f.kind}] ${f.text}`) : ["- none yet"]),
    "Facts waiting for their yes (never use these in an application until they confirm):",
    ...(drafts.length ? drafts.map((f: any) => `- ${f.id} [${f.kind}] ${f.text}`) : ["- none"]),
  ];
  const budget = o.budget ?? BLOCK_BUDGET;
  const out = [...head, ""];
  let used = out.join("\n").length, dropped = 0;
  for (const line of optional) {
    if (used + line.length + 1 > budget) { dropped++; continue; }
    out.push(line);
    used += line.length + 1;
  }
  if (dropped) out.push(`(${dropped} more lines left out for length; read them with a tool if needed.)`);
  return out.join("\n");
}
