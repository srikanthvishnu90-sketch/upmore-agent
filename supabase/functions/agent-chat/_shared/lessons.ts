// Upmore chat learning helpers — pure, dependency-free TypeScript.
//
// The chat side of the agent's failure memory: detect user corrections,
// decide which past lessons are relevant to a message, and render the
// prompt block that makes the model apply them.
//
// Like execution-guards.ts, this module is imported by BOTH:
//   - supabase/functions/agent-chat/index.ts (the deployed edge function), and
//   - tests/execution/real-trust fixtures (Node, via type-stripping).
//
// The fixtures exercise THIS code — the same functions the deployed chat
// calls. Deterministic throughout: no model, no network.

export type ChatLesson = {
  id: string;
  category: string;
  scope: string;
  title: string;
  what_to_do_instead: string;
  times_seen: number;
};

/**
 * Decide whether an open lesson is relevant to the user's message.
 * Route-scoped lessons match on the route id; merchant-scoped on merchant
 * words; everything else on significant title words. Pure and explainable.
 */
export function lessonRelevant(
  lesson: Pick<ChatLesson, "scope" | "title">,
  message: string,
): boolean {
  const msg = message.toLowerCase();
  if (lesson.scope.startsWith("route:")) {
    const rid = lesson.scope.slice(6).toLowerCase();
    if (rid && msg.includes(rid)) return true;
  }
  if (lesson.scope.startsWith("merchant:")) {
    const words = lesson.scope.slice(9).toLowerCase().split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);
    if (words.some((w) => msg.includes(w))) return true;
  }
  const titleWords = lesson.title.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4);
  return titleWords.some((w) => msg.includes(w));
}

/**
 * Detect "you're wrong"-style corrections: the message reads as a
 * correction AND the assistant spoke previously in this thread. Bare "no"
 * is deliberately NOT a correction (it often answers a yes/no question).
 */
export function detectUserCorrection(
  message: string,
  hist: { role: string; content: string }[],
): { correction: string; prevReply: string } | null {
  const t = message.trim().toLowerCase();
  const isCorrection =
    /^(wrong|incorrect)\b/.test(t) ||
    /(that's|thats|you're|you are|this is|it is|its)\s+(wrong|incorrect|not right)\b/.test(t) ||
    /not what i (meant|asked for|asked)\b/.test(t) ||
    /you (misunderstood|got it wrong|are wrong)\b/.test(t);
  if (!isCorrection) return null;
  const prev = [...hist].reverse().find((m) => m.role === "assistant");
  if (!prev) return null;
  return {
    correction: message.trim().slice(0, 300),
    prevReply: String(prev.content ?? "").slice(0, 300),
  };
}

/** Render the prompt block that makes the model apply past lessons. */
export function renderLessonsBlock(lessons: ChatLesson[]): string {
  if (!lessons.length) return "";
  const lines = lessons.map((l, i) =>
    `${i + 1}. [${l.category}] ${l.title}\n   → ${l.what_to_do_instead}`);
  return (
    `\n\nPAST LESSONS — real mistakes you made before and what you learned. ` +
    `Apply them to this reply; do not repeat the mistake. ` +
    `If a lesson changes what you say, acknowledge it briefly in plain words ` +
    `(e.g. "Learned from last time: ...").\n` + lines.join("\n")
  );
}
