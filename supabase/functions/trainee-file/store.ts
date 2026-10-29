// The jobs page's store over Supabase: the Telegram job store plus the application row and the "to be prepared" check.
import { supabaseJobStore } from "../_shared/telegram_jobs.ts";
import type { FileStore } from "./handler.ts";

// deno-lint-ignore no-explicit-any
export function supabaseFileStore(admin: any): FileStore {
  const base = supabaseJobStore(admin);
  // deno-lint-ignore no-explicit-any
  const must = (r: any, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
  return {
    ...base,
    async appRow(u, jobId) {
      const rows = must(await admin.from("career_apply_jobs").select("id,state,reason,confirmation_id,created_at,updated_at,email_confirmed_at,payload,company,url").eq("user_id", u).eq("job_id", jobId).limit(1), "read the application");
      return rows?.[0] ?? null;
    },
    // A link token id is taken once: the insert's unique (user_id, key) refuses a second take. Any other error is surfaced, never treated as unused.
    async claimLink(u, jti, at) {
      const r = await admin.from("career_watch_kv").insert({ user_id: u, key: `tf:used:${jti}`, value: { at: new Date(at).toISOString() }, updated_at: new Date(at).toISOString() });
      if (!r.error) return true;
      if (r.error.code === "23505") return false;
      throw new Error(`claim link: ${r.error.message}`);
    },
    async wanted(u, url) {
      const rows = must(await admin.from("career_apply_wanted").select("posting_key").eq("user_id", u).eq("url", url).limit(1), "read the queue");
      return !!rows?.length;
    },
  };
}

// The linked account of a Telegram identity (channel_contacts: contact 'tg:<id>').
// deno-lint-ignore no-explicit-any
export const supabaseUserOfTelegram = (admin: any) => async (telegramId: string): Promise<string | null> => {
  const r = await admin.from("channel_contacts").select("user_id").eq("contact", `tg:${telegramId}`).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return r.data?.user_id ?? null;
};
