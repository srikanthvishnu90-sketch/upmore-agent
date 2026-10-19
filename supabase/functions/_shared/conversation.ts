// One conversation interface for every channel (WO-004): the text simulator now, LoopMessage last (WO-013).
// A person is their contact (phone or email). The first text creates them (no web account). The brain answers with
// the person's history and state; the reply is split into texting-sized bubbles. Agent-initiated messages (alerts,
// reports, nudges) are queued per person, delivered once each, and become part of the conversation.
export interface Attachment { name: string; mime: string; bytes: Uint8Array }
export interface Inbound { contact: string; text: string; at: number; attachments?: Attachment[] }
export interface Outbound { contact: string; kind: "reply" | "proactive"; bubbles: string[] }
export type Turn = { role: "user" | "assistant"; content: string };
export type Brain = (a: {
  userId: string; message: string; history: Turn[]; stores: Record<string, unknown>;
  attachments: { name: string; mime: string; text: string | null }[];
}) => Promise<{ reply: string; stores: Record<string, unknown> }>;
export interface Person { id: string; contact: string; created: number }
export interface ConversationStore {
  userFor(contact: string): Promise<Person | null>;
  ensureUser(contact: string, at: number): Promise<Person>;
  history(userId: string): Promise<Turn[]>;
  append(userId: string, m: Turn): Promise<void>;
  stores(userId: string): Promise<Record<string, unknown>>;
  setStores(userId: string, s: Record<string, unknown>): Promise<void>;
  enqueueProactive(userId: string, m: { key: string; text: string; at: number }): Promise<void>;
  drainProactive(now: number): Promise<Outbound[]>;
}

export const SAFE_ERROR_REPLY = "Something went wrong on my side, so nothing was saved, sent or submitted. Send that again in a minute.";
export const HISTORY_TURNS = 20;
const MAX_BUBBLES = 4;
const BUBBLE_CHARS = 700;

// A contact is normalized once: emails lowercased; phone numbers to +digits. Never guess a country code.
export function normalizeContact(contact: string): string {
  const t = String(contact || "").trim().toLowerCase();
  if (t.includes("@")) return t;
  const digits = t.replace(/[^0-9]/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("Invalid contact.");
  return "+" + digits;
}

// ---- bubble formatting (moved unchanged from imessage-inbound) ----
// Short texting-sized bubbles on sentence boundaries; each bare URL gets its
// own bubble so iMessage renders a link preview card; at most 4 bubbles.
const URL_RE = /https?:\/\/[^\s<>"']+/g;
const isLinkBubble = (s: string) => /^https?:\/\/\S+$/.test(s.trim());

function splitLong(text: string, max: number): string[] {
  const t = text.trim();
  if (t.length <= max) return [t];
  // Chunk on existing line breaks first (the model structures replies with
  // newlines), then word-wrap overlong lines. Cuts happen ONLY at spaces,
  // so numbers (15.49), domains (netflix.com) and URLs are never split.
  const out: string[] = [];
  for (const line of t.split("\n")) {
    let rest = line.trim();
    if (!rest) continue;
    while (rest.length > max) {
      let cut = rest.lastIndexOf(" ", max);
      if (cut < max * 0.4) cut = max; // no good break: hard cut (rare)
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out.length ? out : [t.slice(0, max)];
}

export function toBubbles(reply: string): string[] {
  // Strip hidden markers (exec-offer etc.) — they'd render as raw text in iMessage.
  const clean = reply.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!clean) return [];
  const urls = clean.match(URL_RE) ?? [];
  if (urls.length > 2) return splitLong(clean, BUBBLE_CHARS).slice(0, MAX_BUBBLES);
  const raw: string[] = [];
  for (const para of clean.split(/\n\s*\n/)) {
    let buf = "";
    const flush = () => {
      const t = buf.trim();
      if (t) raw.push(t);
      buf = "";
    };
    for (const line of para.split("\n")) {
      const lineUrls = line.match(URL_RE);
      if (!lineUrls) {
        buf += (buf ? "\n" : "") + line;
        continue;
      }
      let rest = line;
      for (const u of lineUrls) {
        const i = rest.indexOf(u);
        const before = rest.slice(0, i).replace(/[\s:–—-]+$/, "").trim();
        if (before) buf += (buf ? "\n" : "") + before;
        flush();
        raw.push(u);
        rest = rest.slice(i + u.length).replace(/^[\s.,;)]+/, "");
      }
      if (rest.trim()) buf += (buf ? "\n" : "") + rest.trim();
    }
    flush();
  }
  const sized: string[] = [];
  for (const b of raw) {
    if (isLinkBubble(b) || b.length <= BUBBLE_CHARS) sized.push(b);
    else sized.push(...splitLong(b, BUBBLE_CHARS));
  }
  while (sized.length > MAX_BUBBLES) {
    let k = -1;
    for (let i = 0; i < sized.length - 1; i++) {
      if (!isLinkBubble(sized[i]) && !isLinkBubble(sized[i + 1])) {
        k = i;
        break;
      }
    }
    if (k < 0) break;
    sized.splice(k, 2, sized[k] + "\n\n" + sized[k + 1]);
  }
  return sized;
}

const TEXT_MIME = /^text\/|^application\/(json|csv)$/;
const decode = (a: Attachment) => (TEXT_MIME.test(a.mime) ? new TextDecoder().decode(a.bytes) : null);

export async function handleInbound(i: Inbound, d: { brain: Brain; store: ConversationStore }): Promise<Outbound> {
  const person = await d.store.ensureUser(i.contact, i.at);
  const history = (await d.store.history(person.id)).slice(-HISTORY_TURNS);
  const stores = await d.store.stores(person.id);
  const attachments = (i.attachments || []).map((a) => ({ name: a.name, mime: a.mime, text: decode(a) }));
  let reply: string;
  try {
    const r = await d.brain({ userId: person.id, message: i.text, history, stores: JSON.parse(JSON.stringify(stores)), attachments });
    reply = String(r.reply || "").trim() || SAFE_ERROR_REPLY;
    await d.store.setStores(person.id, r.stores);
  } catch (e) {
    console.error("conversation: brain failed:", e instanceof Error ? e.message : String(e));
    reply = SAFE_ERROR_REPLY;
  }
  await d.store.append(person.id, { role: "user", content: i.text });
  await d.store.append(person.id, { role: "assistant", content: reply });
  return { contact: person.contact, kind: "reply", bubbles: toBubbles(reply) };
}

// In-memory store (tests and the simulator). dump()/load() make it serializable so a simulator session can resume.
export interface MemoryState {
  people: Person[]; history: Record<string, Turn[]>; stores: Record<string, Record<string, unknown>>;
  queue: { userId: string; key: string; text: string; at: number }[]; delivered: string[]; seq: number;
}
export function memoryStore(initial?: MemoryState): ConversationStore & { dump(): MemoryState } {
  const st: MemoryState = initial ? JSON.parse(JSON.stringify(initial)) : { people: [], history: {}, stores: {}, queue: [], delivered: [], seq: 0 };
  const byContact = (c: string) => st.people.find((p) => p.contact === c) || null;
  const store = {
    async userFor(contact: string) { return byContact(normalizeContact(contact)); },
    async ensureUser(contact: string, at: number) {
      const c = normalizeContact(contact);
      let p = byContact(c);
      if (!p) { p = { id: `u${++st.seq}`, contact: c, created: at }; st.people.push(p); }
      return p;
    },
    async history(userId: string) { return (st.history[userId] || []).map((m) => ({ ...m })); },
    async append(userId: string, m: Turn) { (st.history[userId] ||= []).push({ role: m.role, content: m.content }); },
    async stores(userId: string) { return JSON.parse(JSON.stringify(st.stores[userId] || {})); },
    async setStores(userId: string, s: Record<string, unknown>) { st.stores[userId] = JSON.parse(JSON.stringify(s || {})); },
    async enqueueProactive(userId: string, m: { key: string; text: string; at: number }) {
      const k = `${userId}|${m.key}`;
      if (st.delivered.includes(k) || st.queue.some((q) => q.userId === userId && q.key === m.key)) return;
      st.queue.push({ userId, key: m.key, text: m.text, at: m.at });
    },
    async drainProactive(now: number) {
      const due = st.queue.filter((q) => q.at <= now).sort((a, b) => a.at - b.at);
      st.queue = st.queue.filter((q) => q.at > now);
      const out: Outbound[] = [];
      for (const q of due) {
        st.delivered.push(`${q.userId}|${q.key}`);
        await store.append(q.userId, { role: "assistant", content: q.text });
        const p = st.people.find((x) => x.id === q.userId);
        if (p) out.push({ contact: p.contact, kind: "proactive", bubbles: toBubbles(q.text) });
      }
      return out;
    },
    dump() { return JSON.parse(JSON.stringify(st)); },
  };
  return store;
}
