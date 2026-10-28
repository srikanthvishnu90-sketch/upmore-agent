// The file pages' store over Supabase: the Telegram job store plus Pass, the application row and the "to be prepared" check.
// Passes live in career_watch_kv beside the remembered cards (no new table).
import { supabaseJobStore } from "../_shared/telegram_jobs.ts";
import type { FileStore } from "./handler.ts";

// deno-lint-ignore no-explicit-any
export function supabaseFileStore(admin: any): FileStore {
  const base = supabaseJobStore(admin);
  // deno-lint-ignore no-explicit-any
  const must = (r: any, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
  const key = (ref: string) => `tg:pass:${ref}`;
  const read = async (u: string, ref: string) => must(await admin.from("career_watch_kv").select("value").eq("user_id", u).eq("key", key(ref)).maybeSingle(), "read pass");
  return {
    ...base,
    async passed(u, ref) { return !!(await read(u, ref)); },
    async pass(u, ref, at) {
      if (await read(u, ref)) return "already";
      must(await admin.from("career_watch_kv").upsert({ user_id: u, key: key(ref), value: { passed_at: new Date(at).toISOString() }, updated_at: new Date(at).toISOString() }, { onConflict: "user_id,key" }), "save pass");
      return "passed";
    },
    async appRow(u, jobId) {
      const rows = must(await admin.from("career_apply_jobs").select("id,state,reason,confirmation_id,created_at,updated_at,email_confirmed_at,payload,company,url").eq("user_id", u).eq("job_id", jobId).limit(1), "read the application");
      return rows?.[0] ?? null;
    },
    async wanted(u, url) {
      const rows = must(await admin.from("career_apply_wanted").select("posting_key").eq("user_id", u).eq("url", url).limit(1), "read the queue");
      return !!rows?.length;
    },
  };
}
