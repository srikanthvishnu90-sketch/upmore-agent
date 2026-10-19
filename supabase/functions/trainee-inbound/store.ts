// trainee-inbound's store over Supabase (WO-013b-2): channel_inbound (message ids claimed), channel_contacts (one person
// and one thread per contact; STOPs and closed-signup refusals kept by number), career_outbox (the reply).
import type { InboundStore, Person } from "./handler.ts";

const iso = (t: number) => new Date(t).toISOString();
const duplicate = (e: { code?: string; message: string } | null) => !!e && (e.code === "23505" || /duplicate key/i.test(e.message));
function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

// deno-lint-ignore no-explicit-any
export function supabaseInboundStore(admin: any): InboundStore {
  return {
    async claimMessage(id, at) {
      const r = await admin.from("channel_inbound").insert({ provider_message_id: id, received_at: iso(at) });
      if (duplicate(r.error)) return false;
      must(r, "claim the inbound message");
      return true;
    },
    async person(contact) {
      const r = must<any>(await admin.from("channel_contacts").select("user_id,thread_id").eq("contact", contact).maybeSingle(), "read the contact");
      return r?.user_id ? { userId: r.user_id, threadId: r.thread_id ?? null } : null;
    },
    async refusedBefore(contact, at) {
      const r = must<any[]>(await admin.from("channel_contacts").upsert({ contact, created_at: iso(at), updated_at: iso(at) }, { onConflict: "contact", ignoreDuplicates: true }).select("contact"), "record the refusal") || [];
      return r.length === 0; // nothing inserted: this number was seen before
    },
    async createPerson(contact, at): Promise<Person> {
      const created = await admin.auth.admin.createUser(contact.includes("@") ? { email: contact, email_confirm: true } : { phone: contact.slice(1), phone_confirm: true });
      if (created.error || !created.data?.user?.id) throw new Error(`create an account for a new contact: ${created.error?.message ?? "no user returned"}`);
      const userId = created.data.user.id as string;
      must(await admin.from("channel_contacts").upsert({ contact, user_id: userId, updated_at: iso(at) }, { onConflict: "contact" }), "link the contact");
      return { userId, threadId: null };
    },
    async setThread(contact, threadId) {
      must(await admin.from("channel_contacts").update({ thread_id: threadId }).eq("contact", contact), "save the texting thread");
    },
    async setOptOut(contact, out, at) {
      must(await admin.from("channel_contacts").upsert({ contact, opted_out: out, opted_out_at: out ? iso(at) : null, updated_at: iso(at) }, { onConflict: "contact" }), "save opt-out");
    },
    async enqueueReply(userId, key, text, at) {
      const r = await admin.from("career_outbox").insert({ user_id: userId, key, kind: "reply", text, deliver_at: iso(at) });
      if (duplicate(r.error)) return false;
      must(r, "queue the reply");
      return true;
    },
  };
}
