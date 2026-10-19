// Fixture doubles for the channel-bridge edge tests (telegram/whatsapp).
// Mirrors the supabase-js call shapes supabase/functions/_shared/channel_bridge.ts
// uses, plus a fetch double that records calls and answers per-URL.

export function assert(v: unknown, msg = "assertion failed") {
  if (!v) throw new Error(msg);
}
export function assertEq(a: unknown, b: unknown, msg = "") {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)} ${msg}`);
}

export class FakeAdmin {
  threads = new Map<string, { thread_id: string; last_message_id: string | null }>();
  createdThreads: { user_id: string; title: string }[] = [];
  upserts: any[] = [];
  private seq = 0;
  constructor(private keyOf: (channel: string, sender: string) => string = (c, s) => `${c}:${s}`) {}
  from(table: string) {
    const self = this;
    if (table === "channel_threads") {
      const filters: Record<string, string> = {};
      const q: any = {
        select() { return q; },
        eq(col: string, val: string) { filters[col] = val; return q; },
        async maybeSingle() {
          const row = self.threads.get(self.keyOf(filters.channel, filters.sender_key));
          return { data: row ? { ...row } : null };
        },
        async upsert(row: any) {
          self.upserts.push(row);
          self.threads.set(self.keyOf(row.channel, row.sender_key), {
            thread_id: row.thread_id,
            last_message_id: row.last_message_id ?? self.threads.get(self.keyOf(row.channel, row.sender_key))?.last_message_id ?? null,
          });
          return { error: null };
        },
      };
      return q;
    }
    if (table === "agent_threads") {
      const q: any = {
        insert(row: any) { self.createdThreads.push(row); return q; },
        select() { return q; },
        async single() { return { data: { id: `thread-${++self.seq}` } }; },
      };
      return q;
    }
    throw new Error("unexpected table " + table);
  }
}

export type FetchCall = { url: string; init: any };

// Answers: agent-chat -> { reply, thread_id? }; telegram sendMessage -> { ok: true };
// twilio Messages -> { sid }. Everything recorded in `calls`.
export function fakeFetch(agentReply: string) {
  const calls: FetchCall[] = [];
  const fn = async (url: any, init?: any) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("/functions/v1/agent-chat")) {
      return new Response(JSON.stringify({ reply: agentReply }), { status: 200 });
    }
    if (u.includes("api.telegram.org")) {
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    }
    if (u.includes("api.twilio.com")) {
      return new Response(JSON.stringify({ sid: "SMfixture" }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };
  return { fn: fn as any, calls };
}

export function envOf(map: Record<string, string>) {
  return (k: string) => map[k];
}

export const TEST_USER = "2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3"; // gauntlet test user
export const SUPABASE_URL = "https://fixture.supabase.co";
export const SERVICE_KEY = "fixture-service-key";
