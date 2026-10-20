// WO-039: the person turns the cloud on and off in chat. Code's, like the card: the model never decides it.
//
// "apply for me in the cloud" shows the terms in exact words: which postings (only what they approve on a card, on
// Greenhouse, Lever and Ashby, on a site whose hand submissions employers have confirmed), how many a day (their own
// daily limit, one per company every 30 days), that each one still needs their yes on its card, and that a
// verification check comes back to them. A "yes" turns it on only while those terms are the thread's last word, and only
// if they are still word for word what would be shown now. One text turns it off ("cloud off"), at any time.
//
// Off is never "stop": over SMS, STOP is the carrier's opt-out keyword (trainee-inbound silences every text on it).

export const CLOUD_INTENT = "career_cloud_optin";

export type CloudCommand = { kind: "ask" } | { kind: "off" } | { kind: "status" };
export function parseCloudCommand(text: string): CloudCommand | null {
  const t = String(text ?? "").toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  if (/^(turn off|switch off|disable|pause|end|stop using) (the )?cloud( apply(ing)?| applications| sending)?$|^cloud off$|^no (more )?cloud$|^(don'?t|do not) (apply|send) (for me )?(in|from) the cloud( anymore| any more)?$/.test(t)) {
    return { kind: "off" };
  }
  if (/^(is (the )?cloud on|cloud status|is the cloud applying( for me)?)$/.test(t)) return { kind: "status" };
  if (
    /^(please )?(apply|send (my )?applications|submit (my )?applications) (for me )?(in|from|through|via) the cloud( for me)?( please)?$/.test(t) ||
    /^(turn on|switch on|enable) (the )?cloud( apply(ing)?| applications| sending)?$|^cloud on$/.test(t)
  ) return { kind: "ask" };
  return null;
}
const YES = /^(yes|yep|yeah|y|yes please|yes turn it on|turn it on|ok|okay|sure)$/;

export function termsText(daily: number): string {
  return [
    "Here is exactly what turning on the cloud means:",
    "1. Which postings: only applications you approve on a card, on Greenhouse, Lever and Ashby, and only on a site where applications sent by hand have already been confirmed by the employers' own emails.",
    `2. How many a day: up to ${daily} a day, your own daily limit, and never two to the same company within 30 days.`,
    "3. Each one still needs your yes on its card, one at a time or as a batch. Nothing you have not approved is ever sent.",
    "4. If a site shows a verification check, Trainee does not solve it. It stops and sends you the link to finish that one yourself.",
    'Reply "yes" to turn it on. Text "cloud off" any time to turn it off.',
  ].join("\n");
}

export interface CloudOptinStore {
  dailyLimit(userId: string): Promise<number>;
  get(userId: string): Promise<{ enabled: boolean; daily?: number | null }>;
  set(userId: string, on: boolean, terms: string | null): Promise<{ enabled: boolean; daily?: number }>;
  lastAssistant(threadId: string): Promise<{ intent: string | null; content: string | null }>;
}

// One turn, before any brain. Null when the text is not about the cloud, so the turn goes on as before.
export async function cloudTurn(
  o: { message: string; userId: string; threadId: string; store: CloudOptinStore },
): Promise<{ reply: string; status: string; intent: string } | null> {
  const cmd = parseCloudCommand(o.message);
  if (cmd?.kind === "off") {
    await o.store.set(o.userId, false, null);
    return {
      reply: "The cloud is off. Nothing more will be sent from it. Your approved applications wait for your own computer.",
      status: "off",
      intent: "career_cloud_off",
    };
  }
  if (cmd?.kind === "status") {
    const s = await o.store.get(o.userId);
    return {
      reply: s.enabled
        ? `The cloud is on, up to ${s.daily ?? 25} a day, and only for applications you approve on a card. Text "cloud off" to turn it off.`
        : `The cloud is off. Text "apply for me in the cloud" to see exactly what turning it on means.`,
      status: s.enabled ? "on" : "off",
      intent: "career_cloud_status",
    };
  }
  if (cmd?.kind === "ask") {
    return { reply: termsText(await o.store.dailyLimit(o.userId)), status: "shown", intent: CLOUD_INTENT };
  }
  const t = String(o.message ?? "").toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  if (!YES.test(t)) return null;
  // A yes counts only when the terms were this thread's last word, and only to the terms as they would be shown now.
  const last = await o.store.lastAssistant(o.threadId);
  if (last.intent !== CLOUD_INTENT) return null;
  const terms = termsText(await o.store.dailyLimit(o.userId));
  if (!last.content || !last.content.includes(terms)) {
    return { reply: "Your settings changed since I showed you the terms, so the cloud is still off.\n" + terms, status: "changed", intent: CLOUD_INTENT };
  }
  const r = await o.store.set(o.userId, true, terms);
  return {
    reply: `The cloud is on, up to ${r.daily ?? 25} a day. Each application still waits for your yes on its card. Text "cloud off" any time to turn it off.`,
    status: "on",
    intent: "career_cloud_on",
  };
}

// The store over the edge function's service client: every call names the person.
export function supabaseCloudOptinStore(admin: any): CloudOptinStore {
  const must = (r: any, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  };
  return {
    async dailyLimit(userId) {
      const n = Number(must(await admin.rpc("career_apply_daily_limit", { p_user: userId }), "read the daily limit"));
      return Number.isInteger(n) && n >= 1 && n <= 50 ? n : 25;
    },
    async get(userId) {
      return must(await admin.rpc("career_apply_cloud_optin_get", { p_user: userId }), "read the cloud setting") ?? { enabled: false };
    },
    async set(userId, on, terms) {
      return must(await admin.rpc("career_apply_cloud_optin_as", { p_user: userId, p_on: on, p_terms: terms }), "set the cloud");
    },
    async lastAssistant(threadId) {
      const rows = must(
        await admin.from("agent_messages").select("content,meta").eq("thread_id", threadId).eq("role", "assistant")
          .order("id", { ascending: false }).limit(1),
        "read the last reply",
      );
      return { intent: rows?.[0]?.meta?.intent ?? null, content: typeof rows?.[0]?.content === "string" ? rows[0].content : null };
    },
  };
}
