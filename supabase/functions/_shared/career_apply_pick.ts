// WO-105: "apply to the second one" applies to the second posting the person was shown. The router remembers the list it
// showed (142 handleDiscovery: ctx.discovery.lastShown, in order); this turn, code's like the card and before either brain,
// resolves the person's pick against that list only, checks each posting is still open on file and passes the same checks
// as the agent's queue_applications (WO-091b: their employer, the 30-day rule), and puts it in their own apply queue
// (career_apply_wanted, WO-066). Nothing reaches an employer here: the Trainee extension prepares the form in the person's
// browser and sends only after they approve its card. A pick that cannot be resolved is said, never guessed.
import { namesEmployer, queueWants, resolvePicks, screenPicks, type Pick, type Refusal, type WantStore } from "./career_apply_want.ts";
import { recordEvent, type EventStore } from "./agent/timeline.ts";

export interface Shown { id: string; title: string; company: string | null; location?: string; url: string }
export interface LastShown { at: string; ask?: string; items: Shown[] }

const APPLY = /\b(apply|applying|submit|send (in )?(my |an )?application)\b/i;
// A question about applying is answered, never acted on ("how do I apply to the first one?", "can I apply to both?"); a
// polite ask ("can you apply to the second one?") is an ask.
const QUESTION = /\b(how (do|does|would|should|can)|what happens|should i|can i|could i|do i)\b/i;
const NEGATIVE = /\b(don'?t|do not|never|not yet|stop|cancel|hold off)\b/i;
// "apply to it" names the one role shown; after several it names none, and the person is asked which.
// Only as the object of the ask: "apply that filter" is not an application.
const POINTER = /\b(?:apply(?:ing)?\s+(?:to|for)|submit)\s+(?:it|this|that|the one|this one|that one|this role|that role|this job|that job)\b/i;
const LINK = /https?:\/\/|www\./i;
const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, one: 1, two: 2, three: 3, four: 4, five: 5 };

// The positions a message names (1-based), in the order said: "the second one", "#2", "2nd", "number 3", "1 and 3", "the
// last one", "both", "all of them". null when it names none.
export function positionsIn(text: string, count: number): number[] | null {
  const t = String(text ?? "").toLowerCase();
  if (/\b(all of (them|these|those)|all (\d+ )?of the(se|m)?|every one|all \d+|them all)\b/.test(t)) return Array.from({ length: count }, (_, i) => i + 1);
  if (/\bboth\b/.test(t) && count >= 2) return [1, 2];
  const out: number[] = [];
  const add = (n: number) => { if (n >= 1 && n <= count && !out.includes(n)) out.push(n); };
  for (const m of t.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g)) add(ORD[m[1]]);
  for (const m of t.matchAll(/(?:#\s?|\bnumber\s|\bno\.\s?)(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)\b/g)) add(Number(m[1] ?? m[2]));
  const list = t.match(/\b(\d{1,2})((?:\s*(?:,|and|&)\s*\d{1,2})+)\b/);
  if (list) for (const n of `${list[1]}${list[2]}`.split(/\s*(?:,|and|&)\s*/)) add(Number(n));
  if (/\b(the )?last one\b/.test(t)) add(count);
  if (/\btop one\b|\bthe top\b/.test(t)) add(1);
  return out.length ? out : null;
}

// The shown postings a message refers to, by position, by the employer it names, or as "it" when one was shown. A link in
// the message is a posting of its own, never one from the list.
function referred(text: string, items: Shown[]): { picks: Shown[]; beyond?: number; which?: boolean } | null {
  if (LINK.test(text)) return null;
  const pos = positionsIn(text, items.length);
  if (pos) return { picks: pos.map((n) => items[n - 1]) };
  const named = items.filter((p) => p.company && namesEmployer(text, p.company));
  if (named.length) return { picks: named };
  // A position past the end of what was shown ("the fifth one" after three) is said, never guessed.
  const far = positionsIn(text, 99);
  if (far && far.some((n) => n > items.length)) return { picks: [], beyond: Math.max(...far) };
  if (POINTER.test(text) || /^\W*(please\W+)?apply\W*(for me\W*)?$/i.test(text)) return items.length === 1 ? { picks: [items[0]] } : { picks: [], which: true };
  return null;
}

// The shown postings a message picks. null when it is not an ask to apply to something shown (a question about applying,
// a "don't", or no reference to the list).
export function picksFrom(text: string, shown: LastShown | null | undefined): { picks: Shown[]; beyond?: number; which?: boolean } | null {
  const items = shown?.items ?? [], t = String(text ?? "");
  if (!items.length || !APPLY.test(t) || NEGATIVE.test(t) || QUESTION.test(t)) return null;
  return referred(t, items);
}

// The shown postings a question about applying refers to ("how do I apply to the first one?"). null otherwise.
export function askedAbout(text: string, shown: LastShown | null | undefined): Shown[] | null {
  const items = shown?.items ?? [], t = String(text ?? "");
  if (!items.length || !APPLY.test(t) || NEGATIVE.test(t) || !QUESTION.test(t)) return null;
  const r = referred(t, items);
  return r && r.picks.length ? r.picks : null;
}

export interface PickDeps {
  wants: WantStore;
  posting: ((jobId: string) => Promise<any | null>) | null;
  events?: EventStore | null;
  // Read only when a pick is queued, never on any other turn: the day's limit, and the person's past applications (null
  // when the read failed, and then nothing is queued).
  limits?: { daily?: number } | (() => PromiseLike<{ daily?: number }>);
  tz?: string;
  facts?: any[];
  apps?: any[] | (() => PromiseLike<any[] | null>);
}

const label = (p: { title?: string | null; company?: string | null }) => `${p.title || "the posting"} at ${p.company || "an employer not named on the posting"}`;
// A refusal in the person's words: what was not queued and the reason, never the model-facing instruction after it.
function said(r: Refusal): string {
  const reason = r.reason.split(/; nothing was queued|\. (Ask|Search|Say)\b/)[0]
    .replace(/\bthey are\b/g, "you are").replace(/\bthey\b/g, "you").replace(/\btheir\b/g, "your").replace(/\bthem\b/g, "you");
  const head = label(r.posting);
  if (/^LinkedIn and Indeed/.test(r.reason)) return `Not queued: ${head}. Trainee never applies on LinkedIn or Indeed; apply there yourself: ${r.url}`;
  if (/^not a Greenhouse, Lever, Ashby or Workday/.test(r.reason)) return `Not queued: ${head}. The extension can't open that site's form; apply there yourself: ${r.url}`;
  if (/^not found among the postings on file/.test(r.reason) || /has closed/.test(r.reason)) return `Not queued: ${head}. It is no longer listed, so it may have closed. Ask me for a fresh search.`;
  return `Not queued: ${reason.startsWith(head) ? reason : `${head}: ${reason}`}.`;
}

export interface PickResult { reply: string; status: "queued" | "already" | "refused" | "explained"; queued: number; intent: string }

const NEXT = "Then the Trainee extension opens the application, fills it from the facts you confirmed and shows you every answer. Nothing is sent until you approve that card.";
const nth = (n: number) => ORDINALS[n - 1] ? `the ${ORDINALS[n - 1]} one` : `number ${n}`;

export async function applyPickTurn(i: { message: string; userId: string; now: number; shown: LastShown | null | undefined; deps: PickDeps }): Promise<PickResult | null> {
  const items = i.shown?.items ?? [];
  const list = () => items.map((s, n) => `${n + 1}. ${label(s)}`).join("\n");
  const about = askedAbout(i.message, i.shown);
  if (about) {
    const lines = about.map((s) => { const n = items.indexOf(s) + 1; return `${label(s)} is number ${n} of the ${items.length} I showed you. Say "apply to ${nth(n)}" and I will put it in your apply queue.`; });
    return { reply: `${lines.join("\n")}\n${NEXT}\nNothing was queued yet.`, status: "explained", queued: 0, intent: "career_apply_pick" };
  }
  const p = picksFrom(i.message, i.shown);
  if (!p) return null;
  if (p.which) {
    return { reply: `Which one? I showed you ${items.length} roles:\n${list()}\nSay "apply to the second one" (or its number). Nothing was queued yet.`, status: "refused", queued: 0, intent: "career_apply_pick" };
  }
  if (!p.picks.length) {
    return { reply: `I showed you ${items.length} ${items.length === 1 ? "role" : "roles"}, so there is no number ${p.beyond}. Nothing was queued.\n${list()}\nSay "apply to the first one" (or its number).`,
      status: "refused", queued: 0, intent: "career_apply_pick" };
  }
  const apps = typeof i.deps.apps === "function" ? await i.deps.apps() : (i.deps.apps ?? []);
  if (apps === null) {
    return { reply: "I couldn't read your past applications just now, so I couldn't rule out applying twice to the same employer. Nothing was queued; send that again in a minute.", status: "refused", queued: 0, intent: "career_apply_pick" };
  }
  const limits = typeof i.deps.limits === "function" ? await i.deps.limits() : i.deps.limits;
  const asked: Pick[] = p.picks.map((s) => ({ job_id: s.id, url: s.url, company: s.company ?? "", title: s.title }));
  // Open on file now, with its employer, title and link from the record (never from the shown copy).
  const found = await resolvePicks(asked, i.deps.posting);
  // The same checks as the agent's queue: their current employer and the 30-day rule. The pick is by reference to the list
  // shown, so the shown employers stand in for "what they were shown last turn".
  const before = items.map((s) => `${s.title} at ${s.company}`).join("; ");
  const screened = screenPicks(found.ok, { message: i.message, before, apps, facts: i.deps.facts ?? [], now: i.now });
  const r = await queueWants(i.deps.wants, i.userId, screened.ok, i.now, { limits, tz: i.deps.tz });
  const refused = [...found.refused, ...screened.refused, ...r.refused];
  if (r.queued) {
    await recordEvent(i.deps.events ?? null, { user_id: i.userId, at: i.now, kind: "apply_queued", subject: `${r.queued} postings`, source: "chat",
      detail: { queued: r.queued, refused: refused.length, companies: [...new Set(r.items.map((w) => w.company).filter(Boolean))].slice(0, 5) } }).catch(() => {});
  }
  const lines: string[] = [];
  if (r.items.length) lines.push(`Queued: ${r.items.map((w) => label(w)).join("; ")}.`);
  const already = r.already;
  if (already) lines.push(already === 1 && !r.items.length ? "That one is already in your apply queue." : `${already} already in your apply queue.`);
  for (const x of refused) lines.push(said(x));
  if (r.items.length || already) {
    lines.push("Next: open the Trainee extension and press Start. It opens each application, fills it from the facts you confirmed and shows you every answer. Nothing is sent until you approve that card.");
  } else {
    lines.push("Nothing was queued.");
  }
  const status = r.items.length ? "queued" : already ? "already" : "refused";
  return { reply: lines.join("\n"), status, queued: r.queued, intent: "career_apply_pick" };
}
