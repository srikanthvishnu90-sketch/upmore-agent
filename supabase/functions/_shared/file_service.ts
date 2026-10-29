// File service: create (validate against the kind, store for ONE user, mint the link), read (expiry and revocation), revoke.
// The link is minted here, in code. The agent tool never sees it and the model never writes it. Tests: tests/architect/file-kinds.test.ts.
import { feedUrlsFor } from "./file_link.ts";
import { KIND_LABEL, tagOf, validateKind, type FileRecord, type KindId } from "./file_kinds.ts";

export const DEFAULT_TTL_HOURS = 168; // a week; TRAINEE_FILE_TTL_HOURS sets it (1 to 720)
// Every read and write is keyed by the user id, so one person can never read, change or revoke another's file.
export interface FileKindStore {
  put(rec: FileRecord): Promise<void>;
  get(userId: string, id: string): Promise<FileRecord | null>;
  patch(userId: string, id: string, state: Record<string, unknown>): Promise<void>; // merges into the record's state
  revoke(userId: string, id: string, at: number): Promise<boolean>;
}
export type FileRead = { state: "ok"; rec: FileRecord } | { state: "expired" | "revoked"; rec: FileRecord } | { state: "missing" };
export type Env = { get(k: string): string | undefined };
export interface FileService {
  create(userId: string, kind: string, data: unknown): Promise<{ ok: true; id: string; kind: KindId; title: string; url: string | null; webApp: string | null } | { ok: false; error: string }>;
  get(userId: string, id: string): Promise<FileRead>;
  patchState(userId: string, id: string, state: Record<string, unknown>): Promise<void>;
  revoke(userId: string, id: string): Promise<boolean>;
  ttlHours(): number;
}

export function createFileService(o: { store: FileKindStore; env: Env; now: () => number }): FileService {
  const ttlHours = () => { const n = Number(o.env.get("TRAINEE_FILE_TTL_HOURS")); return Number.isFinite(n) && n >= 1 && n <= 720 ? Math.floor(n) : DEFAULT_TTL_HOURS; };
  return {
    ttlHours,
    async create(userId, kind, data) {
      if (!userId) return { ok: false, error: "not created: no person to make it for" };
      const v = validateKind(kind, data);
      if (!v.ok) return { ok: false, error: `not created: ${v.errors.join("; ")}` };
      const id = [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const now = o.now();
      const links = await feedUrlsFor(o.env, userId, id, now);
      if (!links.url && !links.webApp) return { ok: false, error: "not created: file links aren't set up yet, so the person could not open it. Tell them it isn't available yet; do not claim it was made." };
      await o.store.put({ id, userId, kind: kind as KindId, data: v.data, state: {}, tag: await tagOf(kind, v.data), created_at: now, expires_at: now + ttlHours() * 3600_000, revoked_at: null });
      return { ok: true, id, kind: kind as KindId, title: String(v.data.title ?? KIND_LABEL[kind as KindId]), url: links.url, webApp: links.webApp };
    },
    async get(userId, id) {
      const rec = userId && /^[0-9a-f]{10}$/.test(id) ? await o.store.get(userId, id) : null;
      if (!rec || rec.userId !== userId) return { state: "missing" };
      if (rec.revoked_at !== null) return { state: "revoked", rec };
      return o.now() >= rec.expires_at ? { state: "expired", rec } : { state: "ok", rec };
    },
    patchState: (userId, id, state) => o.store.patch(userId, id, state),
    revoke: (userId, id) => o.store.revoke(userId, id, o.now()),
  };
}

// In-memory store (tests, and any caller without a database).
export function memoryFileStore(): FileKindStore & { size(): number; all(): FileRecord[] } {
  const m = new Map<string, FileRecord>();
  const k = (u: string, id: string) => `${u}|${id}`;
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  return {
    size: () => m.size, all: () => [...m.values()].map(copy),
    async put(r) { m.set(k(r.userId, r.id), copy(r)); },
    async get(u, id) { const r = m.get(k(u, id)); return r ? copy(r) : null; },
    async patch(u, id, state) { const r = m.get(k(u, id)); if (r) r.state = { ...r.state, ...copy(state) }; },
    async revoke(u, id, at) { const r = m.get(k(u, id)); if (!r || r.revoked_at !== null) return false; r.revoked_at = at; return true; },
  };
}

// Supabase store: one career_watch_kv row per file, key "tf:file:<id>", scoped by user_id (the table's unique (user_id, key)).
// deno-lint-ignore no-explicit-any
export function supabaseFileKindStore(admin: any): FileKindStore {
  const key = (id: string) => `tf:file:${id}`;
  // deno-lint-ignore no-explicit-any
  const must = (r: any, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
  const read = async (u: string, id: string): Promise<FileRecord | null> => {
    const rows = must(await admin.from("career_watch_kv").select("value").eq("user_id", u).eq("key", key(id)).limit(1), "read the file");
    const v = rows?.[0]?.value;
    return v && v.userId === u && v.id === id ? v as FileRecord : null;
  };
  const write = async (r: FileRecord) => { must(await admin.from("career_watch_kv").upsert({ user_id: r.userId, key: key(r.id), value: r, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" }), "save the file"); };
  return {
    put: write, get: read,
    async patch(u, id, state) { const r = await read(u, id); if (r) await write({ ...r, state: { ...r.state, ...state } }); },
    async revoke(u, id, at) { const r = await read(u, id); if (!r || r.revoked_at !== null) return false; await write({ ...r, revoked_at: at }); return true; },
  };
}
