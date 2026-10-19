# WO-004: One conversation interface + the text simulator

Status: ready · Depends on: WO-001 · Assignee: Claude (was Muse; D-012) · Size cap: ~500 lines excluding the architect tests

## Why
The product is a text-message agent, but the real channel (LoopMessage, D-009) is built last (WO-013).
Every capability must be testable now, exactly as a person will experience it by text. So all channels go
through one interface, and a simulator drives that interface from a terminal: same signup, same bubbles,
same attachments, same history, same agent-initiated messages. LoopMessage later is a thin adapter over the
same function.

## Files
- `supabase/functions/_shared/conversation.ts` (new)
- `scripts/text.ts` (new): the simulator
- `.gitignore`: add `.simulator/`
- `supabase/functions/imessage-inbound/index.ts`: import `toBubbles` from `conversation.ts` instead of its own copy (no other change)
- `tests/architect/pending/wo-004-conversation.test.ts` → `tests/architect/` (do not edit)

## Interfaces (exact)
```ts
export interface Attachment { name: string; mime: string; bytes: Uint8Array }
export interface Inbound { contact: string; text: string; at: number; attachments?: Attachment[] }
export interface Outbound { contact: string; kind: "reply" | "proactive"; bubbles: string[] }
export type Brain = (a: {
  userId: string; message: string;
  history: { role: "user" | "assistant"; content: string }[];
  stores: Record<string, unknown>;
  attachments: { name: string; mime: string; text: string | null }[];
}) => Promise<{ reply: string; stores: Record<string, unknown> }>;
export interface ConversationStore {
  userFor(contact: string): Promise<{ id: string; contact: string; created: number } | null>;
  ensureUser(contact: string, at: number): Promise<{ id: string; contact: string; created: number }>;
  history(userId: string): Promise<{ role: "user" | "assistant"; content: string }[]>;
  append(userId: string, m: { role: "user" | "assistant"; content: string }): Promise<void>;
  stores(userId: string): Promise<Record<string, unknown>>;
  setStores(userId: string, s: Record<string, unknown>): Promise<void>;
  enqueueProactive(userId: string, m: { key: string; text: string; at: number }): Promise<void>; // one per (user, key), ever
  drainProactive(now: number): Promise<Outbound[]>; // due items in time order, each once; appended to history as assistant turns
}
export const SAFE_ERROR_REPLY: string; // honest, says nothing was saved, sent or submitted
export function toBubbles(reply: string): string[]; // moved from imessage-inbound unchanged (≤4 bubbles, ≤700 chars, bare link alone, HTML comments stripped)
export function memoryStore(): ConversationStore;
export function handleInbound(i: Inbound, d: { brain: Brain; store: ConversationStore }): Promise<Outbound>;
```
Rules the tests pin: an unknown contact is created on its first text (no web account); contacts are normalized
(`+1 (555) 123-0001` = `+15551230001`, emails lowercased); people are isolated; `text/*` attachments are decoded to
text, every other file reaches the brain with `text: null` (PDF/DOCX/image reading is WO-008); a brain failure
returns `SAFE_ERROR_REPLY` and leaves stores unchanged; history keeps user and assistant turns, including
proactive messages once delivered. The history passed to the brain is the last 20 turns.

## The simulator (`scripts/text.ts`)
`deno run -A scripts/text.ts [--brain router|agent] [--as +15550000001] [--transcript <file>]`
- Each line you type is an inbound text from `--as`; replies print as bubbles, one per line, like Messages.
- Commands: `/attach <path>` (attach a file to the next text), `/as <contact>` (switch person), `/clock +2h|+1d`
  (advance the fake clock, then print any due proactive messages), `/state` (print the person's stores as JSON),
  `/reset` (forget this person), `/quit`.
- `--brain router` drives today's CareerHost chain; `--brain agent` drives WO-002's `agentTurn` (until it lands, prints
  `NOT BUILT`). State lives in a JSON file under `.simulator/` (gitignored) so a session can be resumed.
- `--transcript` writes the session as Markdown (inbound, bubbles, proactive marked as such).

## Acceptance
- The 8 WO-004 tests pass; gate green.
- `deno run -A scripts/text.ts --brain router` works end to end; paste a 6-turn transcript in the PR, including one
  `/attach` of a `.txt` resume and one `/clock +1d`.

## Out of scope
LoopMessage delivery and webhooks (WO-013), reading PDFs/images (WO-008), the Supabase-backed store (WO-013).
