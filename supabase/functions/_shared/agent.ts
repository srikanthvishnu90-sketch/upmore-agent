// Upmore agent system prompt + grounding rules.
// The single most important file in the product: this is what makes the agent
// trustworthy instead of a confident liar.

export const SYSTEM_PROMPT = `You are Upmore's money guide. You help regular people earn
their first bit of extra money online. You talk like a patient friend texting —
super basic, warm, never corporate, never AI-serious. Short messages. One idea
at a time.

YOUR KNOWLEDGE
You are given ROUTE CARDS: verified money-making routes. Each card has an id
(like R0119), exact steps, the official link, payout facts, catches, and a
verified_at date. This is the ONLY source of truth you may use for money claims.

GROUNDING RULES — you must obey these every single reply:
1. Every step, link, payout amount, payout timing, deadline, and eligibility
   claim MUST come from a route card. Never invent, round, or "helpfully fill in"
   a number, date, or URL.
   LINKS: copy the card's Link line character-for-character, including the
   https://. Never shorten a URL (use fetchrewards.com exactly as written, not
   fetch.com), never wrap a URL in **bold** markers, never guess an app-store
   or help-page link. If the card has no app download link, say "grab the app
   from your phone's app store" with no URL at all.
2. Only present a route as a live offer if its status is "verified" AND
   verified_at is within the last 7 days. Otherwise say plainly:
   "I haven't verified this one yet, so I can't walk you through it as live."
3. If the user asks about something with no route card, say you don't have a
   verified route for that — do not improvise one.
4. Never promise or guarantee money. Never say "you will earn $X". Talk about
   what the route's verified terms state.
5. When you mention a specific route, name its id once (e.g. "this is route
   R0119") so the claim is checkable.
6. Always surface catches and risks before the user commits time or money.
   If a route needs cash up front, say so up front.
7. Taxes: remind the user that earned money can be taxable; you are not a tax
   advisor and you don't file anything for them.
8. You never do identity/KYC steps for the user, never accept legal agreements
   for them, never ask for passwords. Those taps are always theirs.

HOW YOU WORK
- LEAD WITH SOMETHING USEFUL. When the user asks about a route, your first
  reply gives STEP 1 immediately: the exact first thing to tap/click/type,
  with the exact link. Never open with a round of setup questions.
- At most ONE question per reply, and only when you truly cannot give the
  next step without the answer. Fold eligibility into the step itself, e.g.:
  "Step 1: download the Fetch app at https://fetchrewards.com — quick check,
  Fetch needs US + 18+. Are you good on both?"
- NEVER ask for something the user already told you. Check the chat history
  and their profile above first. If they answered, use the answer and move
  on. Asking the same thing twice is the worst mistake you can make.
- When the user tells you a fact about themselves (state, age, free time,
  paycheck, cash on hand), save it so it is never asked again: end your reply
  with a final line ACTION {"type":"ask_profile","fields":{"state":"Texas"}}.
  Field names allowed: state, age, free_time_hours, paycheck_status,
  cash_available, display_name.
- Recommend exactly ONE move at a time: the simplest verified route that fits
  them right now. Say why this one.
- Walk them through it ONE step at a time. Show the current step only. Tell
  them exactly what to tap/click/type, give the exact link, and say how they'll
  know the step is done. Wait for them to confirm before moving on.
- If they're stuck: explain just that step differently, offer the smaller
  sub-step, or suggest a verified alternate route. Never rush past confusion.
- If a route expires soon or they stall, say so and offer a reminder.
- Keep replies short. Plain words. No jargon, no lectures, no hype.

ACTIONS (the app acts on a final line of your reply):
End your reply with: ACTION {"type":"...","route_id":"...","step":N}
Types: start_walkthrough (begin a route's steps; include route_id),
next_step (user finished a step, move to the next; include route_id and step),
mark_stuck (user is stuck; include route_id and step),
set_reminder (include route_id and when),
ask_profile (save a user fact; include "fields" with any of: state, age,
free_time_hours, paycheck_status, cash_available, display_name).
STEP NUMBERING: steps are 0-indexed in actions. Step 1 shown to the user is
step 0 in the action. When the user finishes "Step 1", emit next_step with
step 1 (meaning: now on Step 2). When they finish "Step 2", emit step 2.
The "currently on step N" line in your context already uses 1-indexed
display numbers; subtract 1 for the action value.
One action per reply. If no action is needed, omit the line.`;

export interface RouteCard {
  route_id: string;
  name: string;
  provider: string;
  provider_url: string;
  category: string;
  difficulty: string;
  lane: string;
  payout_text: string | null;
  payout_timing: string | null;
  min_age: number | null;
  geo_notes: string | null;
  steps: Array<{ text: string; done_when?: string; warn?: string }>;
  catches: string[];
  exclusions: string | null;
  tax_note: string | null;
  status: string;
  verified_at: string | null;
  expires_at: string | null;
}

// DB stores catches as a jsonb string; the card type says string[].
// Normalize at every use so a string row can never crash the function.
const catchesOf = (r: RouteCard): string[] =>
  Array.isArray(r.catches) ? r.catches : r.catches ? [String(r.catches)] : [];

// Render route cards into the prompt. Only verified-fresh routes are marked LIVE;
// everything else is context the agent must NOT present as an offer.
export function renderRouteCards(routes: RouteCard[]): string {
  const fresh = (r: RouteCard) =>
    r.status === "verified" &&
    r.verified_at &&
    Date.now() - new Date(r.verified_at).getTime() < 7 * 24 * 3600 * 1000;
  return routes
    .map((r) => {
      const live = fresh(r) ? "LIVE (verified " + r.verified_at + ")" : "NOT LIVE — do not present as an offer";
      const steps = r.steps
        .map((s, i) => `  ${i + 1}. ${s.text}` + (s.done_when ? ` [done when: ${s.done_when}]` : ""))
        .join("\n");
      return [
        `ROUTE ${r.route_id} — ${r.name} (${r.provider}) [${live}]`,
        `Link: ${r.provider_url}`,
        `Category: ${r.category} | Difficulty: ${r.difficulty} | Lane: ${r.lane}`,
        `Payout: ${r.payout_text ?? "not stated"} | Timing: ${r.payout_timing ?? "not stated"}`,
        r.min_age != null ? `Minimum age: ${r.min_age}+` : null,
        r.geo_notes ? `Availability: ${r.geo_notes}` : null,
        r.expires_at ? `Expires: ${r.expires_at}` : null,
        `Steps:\n${steps}`,
        catchesOf(r).length ? `Catches: ${catchesOf(r).join("; ")}` : null,
        r.exclusions ? `Exclusions: ${r.exclusions}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

// True when a reply names a scam pattern — it is debunking, not promising.
export function isDebunkReply(reply: string): boolean {
  return /\b(scam|red flag|too good|warning sign|pyramid|ponzi|stay away|not legit)\b/i.test(reply);
}

// Hard post-check: scan a reply for money claims not present in the cards.
// Returns a list of violations (empty = clean). This runs server-side on every
// reply before it reaches the user; any violation → the reply is replaced with
// a safe fallback.
//
// Quoting the USER's own message is not inventing: when the agent debunks a
// scam it must be free to repeat the scammer's numbers/URLs to warn about
// them. So amounts/URLs that appear in the user's message are allowed.
export function checkGrounding(
  reply: string,
  routes: RouteCard[],
  userMessage = ""
): string[] {
  const violations: string[] = [];
  const lowered = reply.toLowerCase();
  // A reply that names the scam pattern is debunking, not promising. And quoting
  // the USER's own wording is not originating a promise. So the guarantee check
  // only fires when the reply INTRODUCES absolute guarantee language the user
  // never used and shows no debunk markers — i.e. the model promising on its own.
  //
  // "You will earn points / cash back / money" must NOT fire: describing a
  // verified route's mechanics is the product's core job. Specific money claims
  // are policed by the invented_amount check below, which is the precise tool
  // for them. This check is only for absolutes: guaranteed, risk-free, no risk.
  const isDebunk = isDebunkReply(reply);
  const GUARANTEE_WORD_RX = /\bguarantee[sd]?\b|\bguaranteeing\b|\brisk-free\b|\bno risk\b/gi;
  const norm = (w: string) => w.toLowerCase().replace(/(ing|d|s)$/, "");
  const userWords = new Set(
    (userMessage.toLowerCase().match(GUARANTEE_WORD_RX) ?? []).map(norm)
  );
  const replyWords = (lowered.match(GUARANTEE_WORD_RX) ?? []).map(norm);
  const newWords = [...new Set(replyWords)].filter((w) => !userWords.has(w));
  // 1. Banned guarantee language (model-originated absolutes only)
  if (!isDebunk && newWords.length) {
    violations.push(`guarantee_language:${newWords.join(",")}`);
  }
  // 2. Dollar amounts must appear in some card's full text OR the user's
  // message. Compared numerically ("$5,000" == "$5000") so reformatting
  // isn't "inventing". The whole card counts (steps, exclusions, catches):
  // quoting any verified fact is faithful, not invented.
  const normAmt = (m: string) => m.replace(/[^0-9.]/g, "");
  const allowedMoney = new Set<string>();
  for (const r of routes) {
    const t = JSON.stringify(r);
    for (const m of t.match(/\$[\d,]+(\.\d+)?/g) ?? []) allowedMoney.add(normAmt(m));
  }
  for (const m of userMessage.match(/\$[\d,]+(\.\d+)?/g) ?? []) {
    allowedMoney.add(normAmt(m));
  }
  for (const m of lowered.match(/\$[\d,]+(\.\d+)?/g) ?? []) {
    if (!allowedMoney.has(normAmt(m))) violations.push(`invented_amount:${m}`);
  }
  // 3. URLs must be a card's URL (or its domain) OR quoted from the user.
  // Trailing sentence punctuation ("at https://x.com.") is stripped before
  // comparing — the URL regex sweeps it in and it used to false-positive
  // every natural sentence ending in a link.
  const cleanHost = (raw: string): string | null => {
    try {
      // Strip markdown bold/italic markers the model wraps around links
      // ("**https://x.com**") plus trailing sentence punctuation.
      const u = new URL(raw.replace(/[*_]+/g, "").replace(/[.,;:!?]+$/, ""));
      return u.hostname.replace(/^www\./, "").replace(/\.$/, "") || null;
    } catch {
      return null;
    }
  };
  const allowedHosts = new Set<string>();
  for (const r of routes) {
    for (const m of JSON.stringify(r).match(/https?:\/\/[^\s)"']+/g) ?? []) {
      const h = cleanHost(m);
      if (h) allowedHosts.add(h);
    }
  }
  for (const m of userMessage.match(/https?:\/\/[^\s)"']+/g) ?? []) {
    try {
      allowedHosts.add(new URL(m).hostname.replace(/^www\./, ""));
    } catch {
      /* ignore */
    }
  }
  for (const m of reply.match(/https?:\/\/[^\s)"']+/g) ?? []) {
    const host = cleanHost(m);
    if (host && ![...allowedHosts].some((d) => d && (host === d || host.endsWith("." + d)))) {
      violations.push(`unlisted_url:${host}`);
    }
  }
  return violations;
}

export const SAFE_FALLBACK =
  "I want to be careful here — I can't verify that claim right now, so I won't " +
  "state it as fact. Tell me which route you're asking about and I'll walk you " +
  "through exactly what's verified.";

// Used when a debunk attempt trips the grounding check (usually because the
// model invented an example amount/URL while warning about a scam). The user
// asked about something scammy, so the reply still warns — it names the
// pattern without inventing any amounts or URLs.
export const SCAM_FALLBACK =
  "I can't verify any of the money claims in that offer — and I want to be " +
  "straight with you: guaranteed daily money with no experience is a classic " +
  "scam pattern. I'd stay away from this one. If you want, I can walk you " +
  "through a verified route instead.";
