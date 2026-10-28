// Task intelligence, the hand-off to the reply writer. The planner writes no prose: it hands the turn's verified facts to
// the writer V1 owns (feat/texting-voice-20261027). Until V1 lands, the interim writer is one model call through the same
// gateway, given ONLY the facts, with a claim check: a sentence claiming something was sent, submitted, applied or queued
// that no fact supports is removed (the brain's unbacked-claim guard, generalized: spec §4.8, TI-S6). The card's items are
// code's text, appended verbatim (the person approves exactly what they read).
// deno-lint-ignore-file no-explicit-any
import type { TurnFacts } from "./planner.ts";

export type ReplyWriter = (facts: TurnFacts, o: { message: string; channel: string }) => Promise<{ text: string; parts?: string[] }>;

export function cardText(facts: TurnFacts): string | null {
  if (!facts.card?.items.length) return null;
  return facts.card.items.map((it) => [`${it.n}.`, ...it.display.map((l) => `   ${l}`)].join("\n")).join("\n\n");
}

// What the facts support saying happened this turn.
export function supported(facts: TurnFacts): { sent: boolean; submitted: boolean; queued: boolean } {
  const res = facts.answer?.results ?? [];
  const sent = res.some((r) => r.state === "done" && /^(email|outreach|followup|calendar)\./.test(r.capability));
  const submitted = res.some((r) => (r.state === "done" || r.state === "queued") && r.capability.startsWith("apply."));
  const queued = res.some((r) => r.state === "queued") || facts.steps.some((s) => s.capability === "apply.queue" && s.status === "done");
  return { sent, submitted, queued };
}
const CLAIM = { sent: /\b(i(?:'ve| have)?\s+(?:just\s+)?(?:sent|emailed)|(?:was|were|has been|have been)\s+sent)\b/i, submitted: /\b(i(?:'ve| have)?\s+(?:submitted|applied)|(?:was|were|has been|have been)\s+submitted)\b/i, queued: /\b(i(?:'ve| have)?\s+queued|(?:was|were|has been|have been)\s+queued)\b/i };
export function claimCheck(text: string, facts: TurnFacts): string {
  const ok = supported(facts);
  return text.split(/(?<=[.!?])\s+/).filter((s) => !(Object.keys(CLAIM) as (keyof typeof CLAIM)[]).some((k) => CLAIM[k].test(s) && !/\b(not|nothing|no|never|n't)\b/i.test(s) && !ok[k])).join(" ").trim();
}

const SYSTEM = "You are Trainee, a career agent, replying by text. Write a short, plain reply using ONLY the JSON facts given: what was done (only steps whose status is done, with what their state says), what is waiting and on whom, and what you need from the person (each ask once, offering its ladder options in plain words; include any link exactly). Never say something was sent, submitted or queued unless the facts say so. Never show internal names or codes. If a card is present, end by saying the numbered items follow and how to answer: yes, yes except a number, only some numbers, or no.";
export function interimModelWriter(model: (payload: any) => Promise<{ content: any[] }>): ReplyWriter {
  return async (facts, o) => {
    const res = await model({ system: SYSTEM, max_tokens: 500, messages: [{ role: "user", content: `FACTS: ${JSON.stringify({ ...facts, card: facts.card ? { count: facts.card.items.length } : null })}\nTHEIR MESSAGE: ${o.message}` }] });
    const said = claimCheck((res.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("").trim(), facts);
    const card = cardText(facts);
    return card ? { text: `${said}\n\n${card}`, parts: [said, card] } : { text: said };
  };
}
