// "Export my data" (chat): the person's own profile, confirmed facts, applications, messages, outreach and files as ONE json
// file, stored privately and handed back as a short-lived signed link in the same linked chat. Built from an injected
// source, so it runs against in-memory data in tests.
//
// What keeps it safe:
// - Isolation: the source is asked for one person; every Supabase query is filtered to that person (user_id, or the
//   person's own threads); the builder drops any row stamped with another user_id even if a source returned it.
// - No secrets: only named keys of career_watch_kv are read (never turn receipts or internals); token/secret/password/
//   cookie/credential-like keys are removed at any depth, and secret-looking values (API keys, bearer tokens, JWTs, card
//   numbers) are redacted. Stripe ids are never exported; the plan is status, cancel flag and end date only.
// - The file is never pasted into chat: the reply carries a link that expires in an hour.
import { isMissingTable, luhnWindow } from "./trainee_billing.ts";

export const EXPORT_BUCKET = "career-exports";
export const EXPORT_FILENAME = "trainee-data-export.json";
export const EXPORT_LINK_MINUTES = 60;
const FILE_EMBED_MAX = 2_000_000, FILES_TOTAL_MAX = 10_000_000;
const KV_KEYS = ["career:standing", "career:preferences", "career:basics", "career:resume-personas"];
const TABLES = [
  "career_apply_jobs", "career_apply_receipts", "career_apply_wanted", "career_apply_questions", "career_interviews", "career_mail_events",
  "career_outreach_drafts", "career_outreach_prefs", "career_outreach_dnc", "career_events", "career_alert_prefs", "career_digest_prefs", "user_subscriptions",
] as const;
export type ExportTable = typeof TABLES[number];

export interface ExportFileEntry { name: string; size: number; mime?: string; base64?: string }
export interface ExportSource {
  account(userId: string): Promise<any | null>; // career_watch_kv 'career:account'
  kv(userId: string): Promise<Record<string, any>>;
  rows(table: ExportTable, userId: string): Promise<any[]>;
  messages(userId: string): Promise<{ role: string; content: string; created_at?: string }[]>;
  files(userId: string): Promise<ExportFileEntry[]>;
}
export interface ExportFile { filename: string; mime: string; bytes: Uint8Array; counts: Record<string, number> }
export interface ExportDeps {
  source: ExportSource;
  publish(userId: string, file: ExportFile): Promise<{ url: string; expires_minutes: number }>;
  now?: () => number;
}

export function exportFilePath(userId: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(userId)) throw new Error("not stored: bad export path");
  return `${userId}/${EXPORT_FILENAME}`;
}

// ---------------------------------------------------------------- secrets
const SECRET_KEY = /((^|[_-])(otp|nonce)([_-]|$)|token|secret|password|passwd|api[_-]?key|access[_-]?url|cookie|authorization|credential|vault|bytes_b64|private[_-]?key|stripe_)/i;
const SECRET_VALUE: RegExp[] = [
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g, /\bwhsec_[A-Za-z0-9]{8,}/g, /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
];
function redactString(s: string): string {
  let out = s;
  for (const re of SECRET_VALUE) out = out.replace(re, "[redacted]");
  return out.replace(/\d(?:[ -]?\d){12,}/g, (m) => (luhnWindow(m.replace(/\D/g, "")) ? "[redacted]" : m));
}
export function scrubSecrets(v: any): any {
  if (typeof v === "string") return redactString(v);
  if (Array.isArray(v)) return v.map(scrubSecrets);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!SECRET_KEY.test(k)) out[k] = scrubSecrets(x);
    return out;
  }
  return v;
}

// ---------------------------------------------------------------- the builder
const mine = (rows: any[] | null | undefined, userId: string): any[] =>
  (rows ?? []).filter((r) => r && typeof r === "object" && (r.user_id === undefined || r.user_id === userId)).map(({ user_id: _u, ...rest }) => rest);
const dayOf = (s: unknown) => (typeof s === "string" && s ? s.slice(0, 10) : null);

export async function buildExport(a: { source: ExportSource; userId: string; now?: number }): Promise<ExportFile> {
  const { source: s, userId } = a, now = a.now ?? Date.now();
  const [account, kvAll, msgs, files, ...tableRows] = await Promise.all([
    s.account(userId), s.kv(userId), s.messages(userId), s.files(userId), ...TABLES.map((t) => s.rows(t, userId)),
  ]);
  const t = Object.fromEntries(TABLES.map((name, i) => [name, mine(tableRows[i], userId)])) as Record<ExportTable, any[]>;
  const kv = Object.fromEntries(Object.entries(kvAll ?? {}).filter(([k]) => KV_KEYS.includes(k)));

  const memory = account?.memory ?? {};
  const profile = memory.profile ?? {};
  const facts = (Array.isArray(profile.facts) ? profile.facts : []).map((f: any) => ({ ...f, confirmed: !f.needs_confirmation }));
  const confirmed = facts.filter((f: any) => f.confirmed).map((f: any) => ({ id: f.id, kind: f.kind, text: f.text }));
  const sub = t.user_subscriptions[0];
  const outreachDnc = t.career_outreach_dnc.length;

  const doc = {
    format: "trainee-data-export-v1",
    exported_at: new Date(now).toISOString(),
    note: "Your own data from Trainee. It holds no passwords, tokens or other people's accounts. Facts marked confirmed are the ones you confirmed.",
    profile: { ...profile, facts: facts.map(({ needs_confirmation: _x, ...f }: any) => f) },
    confirmed_facts: confirmed,
    standing_instructions: kv["career:standing"]?.items ?? [],
    preferences: {
      basics: kv["career:basics"] ?? null, search: kv["career:preferences"] ?? null, resume_personas: kv["career:resume-personas"] ?? null,
      job_alerts: t.career_alert_prefs[0] ?? null, weekly_digest: t.career_digest_prefs[0] ?? null,
    },
    applications: {
      queue: t.career_apply_jobs.map(({ evidence: _e, ...r }) => r), receipts: t.career_apply_receipts, wanted: t.career_apply_wanted,
      answers_asked: t.career_apply_questions, tracker: memory.tracker ?? null, interviews: t.career_interviews, mail_events: t.career_mail_events,
    },
    messages: (msgs ?? []).map((m) => ({ role: m.role, content: m.content, created_at: m.created_at ?? null })),
    outreach: { drafts: t.career_outreach_drafts, preferences: t.career_outreach_prefs[0] ?? null, do_not_contact_count: outreachDnc },
    timeline: t.career_events,
    subscription: sub ? { status: sub.status, cancel_at_period_end: !!sub.cancel_at_period_end, ends_on: dayOf(sub.current_period_end) } : null,
    files: (files ?? []).map((f) => ({ name: f.name, size: f.size, mime: f.mime ?? null, included: typeof f.base64 === "string", ...(typeof f.base64 === "string" ? { base64: f.base64 } : {}) })),
    counts: {
      facts: facts.length, confirmed_facts: confirmed.length, applications: t.career_apply_jobs.length + (Array.isArray(memory.tracker?.items) ? memory.tracker.items.length : 0),
      messages: (msgs ?? []).length, outreach_drafts: t.career_outreach_drafts.length, files: (files ?? []).length,
    },
  };
  // Files are embedded as given (their bytes are not text to scrub); everything else is scrubbed.
  const { files: fileList, ...rest } = doc;
  const clean = { ...scrubSecrets(rest), files: fileList };
  return { filename: EXPORT_FILENAME, mime: "application/json", bytes: new TextEncoder().encode(JSON.stringify(clean, null, 2)), counts: doc.counts };
}

// ---------------------------------------------------------------- Supabase source and publisher
// deno-lint-ignore no-explicit-any
export function supabaseExportSource(admin: any): ExportSource {
  const ok = async (q: any, what: string, tolerateMissing = false): Promise<any[]> => {
    const r = await q;
    if (r.error) { if (tolerateMissing && isMissingTable(r.error)) return []; throw new Error(`export: ${what}: ${r.error.message}`); }
    return r.data ?? [];
  };
  return {
    async account(userId) {
      const rows = await ok(admin.from("career_watch_kv").select("key,value").eq("user_id", userId).eq("key", "career:account"), "account");
      return rows[0]?.value ?? null;
    },
    async kv(userId) {
      const rows = await ok(admin.from("career_watch_kv").select("key,value").eq("user_id", userId).in("key", KV_KEYS), "settings");
      return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    },
    rows: (table, userId) => ok(admin.from(table).select("*").eq("user_id", userId).limit(5000), table, true),
    async messages(userId) {
      const threads = await ok(admin.from("agent_threads").select("id").eq("user_id", userId), "threads");
      const ids = threads.map((t: any) => t.id);
      if (!ids.length) return [];
      return await ok(admin.from("agent_messages").select("role,content,created_at").in("thread_id", ids).order("created_at", { ascending: true }).limit(20000), "messages");
    },
    async files(userId) {
      const bucket = admin.storage.from("career-resumes");
      const listed = await bucket.list(userId, { limit: 1000 });
      if (listed.error) throw new Error(`export: files: ${listed.error.message}`);
      const out: ExportFileEntry[] = [];
      let total = 0;
      for (const o of listed.data ?? []) {
        if (!o?.name) continue;
        const size = Number(o.metadata?.size ?? 0), mime = o.metadata?.mimetype as string | undefined;
        const e: ExportFileEntry = { name: o.name, size, ...(mime ? { mime } : {}) };
        if (size <= FILE_EMBED_MAX && total + size <= FILES_TOTAL_MAX) {
          const d = await bucket.download(`${userId}/${o.name}`);
          if (!d.error && d.data) {
            const buf = new Uint8Array(await d.data.arrayBuffer());
            let bin = "";
            for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
            e.base64 = btoa(bin); e.size = buf.length; total += buf.length;
          }
        }
        out.push(e);
      }
      return out;
    },
  };
}

// One file per person (overwritten each time), private bucket, signed link that lives EXPORT_LINK_MINUTES.
// deno-lint-ignore no-explicit-any
export function supabaseExportPublisher(admin: any): ExportDeps["publish"] {
  return async (userId, file) => {
    const path = exportFilePath(userId), b = admin.storage.from(EXPORT_BUCKET);
    const up = await b.upload(path, file.bytes, { contentType: file.mime, upsert: true });
    if (up.error) throw new Error(`export not stored: ${up.error.message}`);
    const signed = await b.createSignedUrl(path, EXPORT_LINK_MINUTES * 60, { download: EXPORT_FILENAME });
    if (signed.error || !signed.data?.signedUrl) throw new Error(`export link not made: ${signed.error?.message ?? "no url"}`);
    const url = String(signed.data.signedUrl);
    if (!/^https:\/\//.test(url) || /\/object\/public\//.test(url)) throw new Error("export link refused: not a private signed link");
    return { url, expires_minutes: EXPORT_LINK_MINUTES };
  };
}
