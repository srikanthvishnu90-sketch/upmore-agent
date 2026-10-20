// WO-024: where mail tracking keeps what it found (20261020100000_career_mail_tracking.sql) and where it reads the
// person's applications from: the apply queue (career_apply_jobs) and the tracker they keep by text (the career state's
// trackStore in agent_flow_state). The run writes events, drafts and the read cursor; it never writes the queue or the
// tracker, so a chat turn and the scheduled run never race on the same row.
import { type Draft, mergeApps, type StatusEvent, type TrackedApp } from "./career_mail.ts";

export interface MailPerson { user_id: string; read_through: string | null; tz?: string | null; quiet_start?: number; quiet_end?: number }
export interface MailStore {
  // People with the career Google grant, the least recently read first.
  people(limit: number): Promise<MailPerson[]>;
  applications(userId: string): Promise<TrackedApp[]>;
  events(userId: string): Promise<StatusEvent[]>;
  // The message hashes stored by this call; one already stored (an earlier run) is not in the set.
  record(userId: string, events: StatusEvent[]): Promise<Set<string>>;
  // false: that draft was made before (once per application and kind, ever).
  saveDraft(userId: string, d: Draft): Promise<boolean>;
  saveCursor(userId: string, readThrough: number): Promise<void>;
}

// Applications that reached the employer, or may have. One that never went (failed, not sent, still queued or waiting on
// the person) has no mail to match.
const WENT = new Set(["confirmed", "submitted_unconfirmed", "unknown_outcome"]);
export function appsFromQueue(rows: any[]): TrackedApp[] {
  return (rows ?? []).filter((r) => WENT.has(r.state) && r.company).map((r) => ({
    ref: `job:${r.id}`, company: String(r.company), role: r.title ? String(r.title) : undefined, url: r.url ?? undefined,
    applied_at: r.updated_at ?? r.created_at, stage: "Submitted", source: "queue" as const, events: [],
  }));
}
// The tracker's own words for what happened, as mail kinds; anything else is left out.
const TRACK_KIND: Record<string, StatusEvent["kind"]> = {
  confirmation: "received", rejection: "rejection", interview_invite: "interview", oa_invite: "assessment", offer: "offer", recruiter_other: "recruiter_reply",
};
export function appsFromTracker(rows: any[]): TrackedApp[] {
  return (rows ?? []).filter((r) => r && r.app_id && r.company).map((r) => ({
    ref: `track:${r.app_id}`, company: String(r.company), role: r.role ? String(r.role) : undefined, url: r.url || undefined,
    applied_at: r.applied_at ?? undefined, stage: String(r.stage || "Submitted"), source: "tracker" as const,
    events: (r.events ?? []).filter((e: any) => TRACK_KIND[e?.type] && e.at).map((e: any) => ({ kind: TRACK_KIND[e.type], at: String(e.at) })),
  }));
}

// ------------------------------------------------------------------------------------------------ memory (tests)
export interface MemoryMail {
  people: MailPerson[]; queue: Record<string, any[]>; tracker: Record<string, any[]>;
  events: Record<string, StatusEvent[]>; drafts: Record<string, Draft[]>; cursors: Record<string, number>;
}
export function memoryMailStore(init: Partial<MemoryMail> = {}): MailStore & { dump(): MemoryMail } {
  const st: MemoryMail = { people: [], queue: {}, tracker: {}, events: {}, drafts: {}, cursors: {}, ...JSON.parse(JSON.stringify(init)) };
  return {
    async people(limit) {
      return st.people.map((p) => ({ ...p, read_through: st.cursors[p.user_id] ? new Date(st.cursors[p.user_id]).toISOString() : p.read_through }))
        .sort((a, b) => String(a.read_through ?? "").localeCompare(String(b.read_through ?? ""))).slice(0, limit);
    },
    async applications(u) { return mergeApps(appsFromQueue(st.queue[u] ?? []), appsFromTracker(st.tracker[u] ?? [])); },
    async events(u) { return JSON.parse(JSON.stringify(st.events[u] ?? [])); },
    async record(u, evs) {
      const mine = (st.events[u] ??= []), fresh = new Set<string>();
      for (const e of evs) if (!mine.some((x) => x.hash === e.hash)) { mine.push(JSON.parse(JSON.stringify(e))); fresh.add(e.hash); }
      return fresh;
    },
    async saveDraft(u, d) {
      const mine = (st.drafts[u] ??= []);
      if (mine.some((x) => x.key === d.key)) return false;
      mine.push(JSON.parse(JSON.stringify(d)));
      return true;
    },
    async saveCursor(u, at) { st.cursors[u] = at; },
    dump() { return JSON.parse(JSON.stringify(st)); },
  };
}

// ------------------------------------------------------------------------------------------------ Supabase
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}
// deno-lint-ignore no-explicit-any
export function supabaseMailStore(admin: any): MailStore {
  return {
    async people(limit) {
      const conns = must<any[]>(await admin.from("user_oauth_connections").select("user_id").eq("provider", "google_career").limit(5000), "read career grants") ?? [];
      const ids = [...new Set(conns.map((c) => c.user_id))];
      if (!ids.length) return [];
      const cur = must<any[]>(await admin.from("career_mail_cursors").select("user_id,read_through").in("user_id", ids), "read mail cursors") ?? [];
      const prefs = must<any[]>(await admin.from("career_alert_prefs").select("user_id,tz,prefs").in("user_id", ids), "read quiet hours") ?? [];
      const at = new Map(cur.map((c) => [c.user_id, c.read_through])), pref = new Map(prefs.map((p) => [p.user_id, p]));
      return ids.map((u) => {
        const p: any = pref.get(u);
        return { user_id: u, read_through: at.get(u) ?? null, tz: p?.tz ?? null, quiet_start: p?.prefs?.quiet_start, quiet_end: p?.prefs?.quiet_end };
      }).sort((a, b) => String(a.read_through ?? "").localeCompare(String(b.read_through ?? ""))).slice(0, limit);
    },
    async applications(u) {
      const queue = must<any[]>(await admin.from("career_apply_jobs").select("id,company,url,state,created_at,updated_at,title:payload->>title")
        .eq("user_id", u).order("created_at", { ascending: false }).limit(1000), "read applications") ?? [];
      const threads = must<any[]>(await admin.from("agent_flow_state").select("rows:state->career->trackStore->rows").eq("user_id", u).limit(200), "read the tracker") ?? [];
      const tracked = threads.flatMap((t) => (Array.isArray(t.rows) ? t.rows : []));
      return mergeApps(appsFromQueue(queue), appsFromTracker(tracked));
    },
    async events(u) {
      const rows = must<any[]>(await admin.from("career_mail_events").select("application_ref,kind,company,role,stage,flagged,evidence,message_hash,mail_at")
        .eq("user_id", u).order("mail_at", { ascending: true }).limit(2000), "read status events") ?? [];
      return rows.map((r) => ({ hash: r.message_hash, ref: r.application_ref, kind: r.kind, company: r.company, role: r.role ?? undefined, stage: r.stage, flagged: r.flagged, evidence: r.evidence, at: r.mail_at, new_app: false }));
    },
    async record(u, evs) {
      if (!evs.length) return new Set();
      const rows = evs.map((e) => ({ user_id: u, application_ref: e.ref, kind: e.kind, company: e.company.slice(0, 200), role: e.role?.slice(0, 200) ?? null, stage: e.stage, flagged: e.flagged, evidence: e.evidence, message_hash: e.hash, mail_at: e.at }));
      const got = must<any[]>(await admin.from("career_mail_events").upsert(rows, { onConflict: "user_id,message_hash", ignoreDuplicates: true }).select("message_hash"), "record status events") ?? [];
      return new Set(got.map((r) => r.message_hash));
    },
    async saveDraft(u, d) {
      const r = await admin.from("career_mail_drafts").insert({ user_id: u, draft_key: d.key, application_ref: d.ref, kind: d.kind, company: d.company.slice(0, 200), role: d.role?.slice(0, 200) ?? null, text: d.text, basis: d.basis });
      if (r.error && (r.error.code === "23505" || /duplicate key/i.test(r.error.message))) return false;
      must(r, "save a draft");
      return true;
    },
    async saveCursor(u, at) {
      must(await admin.from("career_mail_cursors").upsert({ user_id: u, read_through: new Date(at).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" }), "save the mail cursor");
    },
  };
}
