# WO-005: Approvals by reply, outreach, tailoring

Status: ready · Depends on: WO-002, WO-004 · Assignee: Codex · Size cap: ~700 lines excluding the architect tests

## Why
The agent must act, not just talk, and every action that leaves the person's account must be one they
approved by replying YES to the exact thing. This order adds the approval mechanism (code, not model), the
first external tool (email, through an injected sender: a simulated outbox until Gmail sending is approved),
and the writing tools that use the existing truth audit.

## Files
- `supabase/functions/_shared/agent/approvals.ts` (new)
- `supabase/functions/_shared/agent/career_tools.ts` (add 4 tools; keep the WO-002 eight unchanged)
- `supabase/functions/agent-chat/career_brain.ts` (approval step before the brain; card after it)
- `scripts/text.ts` (the simulated outbox: `/outbox` prints what "sent" in this session)
- `tests/architect/pending/wo-005-approvals.test.ts` → `tests/architect/` (do not edit)
- `tests/agent-tools-wo005.test.ts` (new, yours): one test per new tool, including the refusal cases below

## Interfaces (exact)
```ts
export const APPROVAL_TTL_MS = 30 * 60 * 1000;
export interface Approval { id: string; tool: string; input: unknown; hash: string; preview: string; created_at: number; expires_at: number;
  status: "pending" | "declined" | "expired" | "done" | "failed" }
export function addApprovals(stores: Record<string, any>, pending: { tool: string; input: unknown; summary: string }[], now: number,
  preview: (tool: string, input: any) => string): Approval[];          // appends to stores.approvals; synchronous
export function approvalCard(list: Approval[]): string;                 // "1. <preview>\n2. <preview>\nReply YES …, or NO to cancel. Expires in 30 minutes."
export function parseApprovalReply(text: string): { kind: "yes"; picks: number[] | "all" | null } | { kind: "no" } | null;
export function resolveApprovalReply(text: string, stores: Record<string, any>, tools: ToolSpec[], ctx: ToolCtx): Promise<{ reply: string } | null>;
```
- `hash` is a synchronous digest (≥16 hex chars) of tool name + the input as stored; it is re-checked before running.
- `resolveApprovalReply` returns `null` when nothing is pending or the text is not an approval reply (the brain answers).
  Otherwise it expires stale items, then: NO declines all pending; YES with one pending runs it; YES with several
  and no picks asks for YES ALL or numbers; picks run exactly those. Each approval runs at most once. A changed
  payload or a thrown tool error marks it `failed` and says so; nothing is ever claimed done that did not run.
- The preview for each external tool is written by code from the input, never by the model:
  `send_email` → `Email to <to>: "<subject>"` and, on DETAILS, the full body (add `details`/`show it` handling: reply
  with the full previews of everything pending, without approving).

## Wiring (career_brain.ts)
1. Before the brain: `resolveApprovalReply(message, stores, tools, ctx)`; if it returns a reply, that is the turn.
2. Run the brain (WO-002).
3. After the brain: `addApprovals(stores, result.pending_approvals, now, preview)`; if any were added, the reply is
   `<model reply>\n\n<approvalCard(added)>`.
4. Approvals live in the person's stores, so they survive between texts and are per person.

## New tools
| Tool | Effect | Backed by | Rules |
|---|---|---|---|
| `tailor_resume({ job_id? , posting_text? })` | read | `CareerTailor.tailorResume(profile, posting text)` (123) | Posting from `search_jobs` results (by `job_id`) or pasted text. Returns the tailored lines with their fact ids, or the audit's refusal and violations verbatim. Never edits facts. |
| `write_cover_letter({ job_id?, posting_text? })` | read | `CareerTailor.generateCoverLetter` (123) | Same truth rules; an AI-ban posting returns the outline mode the module already has. |
| `get_company_info({ company })` | read | the company records already in the bundle (`CareerPrep.findCir` / `normalizeCir`) | Returns the record with its source labels, or `{ found: false }`. Never a guess. |
| `send_email({ to, subject, body })` | **external** | `deps.sendEmail(input)` | Never runs inside the loop (WO-002). In the simulator and tests `deps.sendEmail` writes to a simulated outbox and returns `{ sent: true, simulated: true }`; the reply must say "simulated". Real Gmail sending is a later order that needs the owner's yes. |

`careerTools(deps)` gains `sendEmail?: (input) => Promise<unknown>`; when absent, `send_email` is still offered but
running it throws `email sending is not connected`.

## Acceptance
- The 9 WO-005 tests and all earlier architect tests pass; gate green.
- Your `tests/agent-tools-wo005.test.ts` proves: a tailored resume for a posting that needs a skill the person has
  not confirmed comes back refused with the violation; a cover letter never contains a banned phrase; an unknown
  company is `{ found: false }`.

## Demo (simulator, `--brain agent`, paste the transcript)
1. Give two facts and confirm them. 2. "write a cold email to the recruiter at Ramp, jordan@ramp.com, about data
analyst roles" → a draft plus a card. 3. "details" → full body, nothing sent. 4. "yes" → "Sent (simulated): Email to
jordan@ramp.com …"; `/outbox` shows it once. 5. "yes" again → nothing waiting. 6. Ask for two emails, reply "yes" → it
asks which; "yes 2" → only the second. 7. Paste a posting and "tailor my resume for this" → tailored lines with fact
ids, or a refusal naming what is unconfirmed.

## Out of scope
Real Gmail sending, applying to jobs (WO-009), PDFs (WO-008).
