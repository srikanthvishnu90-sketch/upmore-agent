// WO-021 step 5, the receipt: each application that finished is said once, in one text, as it ended. Confirmed only
// with the employer's own confirmation; anything not sent says nothing reached the employer; an unknown outcome is
// said as unknown and is never resent. Every word is written here from the queue row, never by the model. The outbox
// keeps one text per key, ever (receipt:<application id>), so a run that repeats sends nothing twice.
export const FINAL_STATES = [
  "confirmed",
  "submitted_unconfirmed",
  "needs_user",
  "failed",
  "not_submitted",
  "unknown_outcome",
] as const;

// Employer and page text is other people's text: one line, bounded.
const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const httpsUrl = (u: unknown) => (/^https:\/\/\S+$/.test(String(u ?? "")) ? String(u).slice(0, 500) : "");

// Why an application did not go, in the person's words. Each says whether anything reached the employer.
const NOT_SENT: Record<string, string> = {
  CAPTCHA_AT_SUBMIT: "a verification appeared at Submit and was not completed",
  APPROVED_APPLICATION_CHANGED: "the form changed after you approved it, so it was stopped",
  APPROVED_BODY_MISMATCH: "what the page tried to send was not exactly what you approved, so it was stopped",
  RESUME_CHANGED: "your resume file is not the one you approved",
  HOST_REDIRECT_REFUSED: "the page tried to go somewhere other than the employer's own site",
  PERSON_DID_NOT_SUBMIT: "Submit was not pressed in the window within 10 minutes",
  IDENTITY_NUMBER_REQUESTED: "the form asks for an ID number, which Trainee never fills in",
  ACCOUNT_LOGIN_REQUIRED: "the employer's site needs you to sign in to an account first",
  needs_answers: "the form has questions you have not answered yet",
};
const NEEDS_YOU: Record<string, string> = {
  captcha: "the page asks you to complete a verification",
  email_code: "the employer emailed you a code to finish it",
  // WO-039: the cloud met a verification check, which Trainee never solves or gets around. The link is theirs to finish.
  bot_check: "a verification check appeared, and Trainee never solves one, so finish this one yourself at this link",
};

// WO-032: a row is confirmed only by the employer's email matched to it (career_apply_confirm.ts); its receipt says whose
// email and when. A page's "thank you for applying" is kept as evidence and said as what it is, never as confirmation.
// The date is the person's own (their alert time zone), UTC when it is not known or not a zone.
const emailDay = (iso: unknown, tz?: unknown) => {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "";
  const day = (timeZone: string) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  try { return day(typeof tz === "string" && tz ? tz : "UTC"); } catch { return day("UTC"); }
};
export function receiptText(
  row: {
    company?: unknown; url?: unknown; state: string; reason?: unknown; confirmation_id?: unknown;
    email_confirmed_at?: unknown; evidence?: { page_confirmation?: unknown } | null; source?: unknown; tz?: unknown;
  },
): string {
  const company = clean(row.company, 80) || "the employer", url = httpsUrl(row.url);
  const tail = url ? ` ${url}` : "";
  const reason = clean(row.reason, 200);
  switch (row.state) {
    case "confirmed": {
      if (row.email_confirmed_at) {
        const when = emailDay(row.email_confirmed_at, row.tz);
        return `Applied to ${company}: confirmed by ${company}'s email${when ? ` on ${when}` : ""}.${tail}`;
      }
      const id = clean(row.confirmation_id, 60);
      return `Applied to ${company}: the employer confirmed it on their page${
        id ? ` (confirmation ${id})` : ""
      }.${tail}`;
    }
    case "submitted_unconfirmed":
      if (row.source === "email") return `Emailed your application to ${company} from your Gmail. Their reply is the proof; I'll mark it confirmed when it comes.${tail}`;
      if (row.evidence?.page_confirmation === true) {
        return `Sent to ${company}. Their page said it was received; their confirmation email is the proof, and I'll mark it confirmed when it comes.${tail}`;
      }
      return `Sent to ${company}. The employer has not confirmed it yet; their confirmation email is the proof.${tail}`;
    case "needs_user":
      return `${company} is not finished: ${NEEDS_YOU[reason] ?? "it needs you"}. Nothing else was sent.${tail}`;
    case "failed":
      return `${company} did not accept it${reason ? `: their form said "${reason}"` : ""}.${tail}`;
    case "not_submitted":
      return `Not sent to ${company}: ${
        NOT_SENT[reason] ?? `it stopped before sending${reason ? ` (${reason})` : ""}`
      }. Nothing reached the employer.${tail}`;
    case "unknown_outcome":
      return `${company}: Trainee cannot tell whether it went through, and will not send it again. If they email you a confirmation, it did.${tail}`;
    default:
      throw Error("not a finished application: " + row.state);
  }
}

// ------------------------------------------------------------------
// H7 — the chat loop's readback texts (lane muse/2026-10-22-e2e-h7;
// root cause: docs/e2e/H7-LOOP-CLOSURE-ROOT-CAUSE.md). The proactive
// outbox above says a finished application once, on a schedule. The
// chat loop needs the same honesty at ask time: a status turn during
// the apply loop (queued -> driving -> submitted_unconfirmed ->
// confirmed) is answered from the recorded row, and the confirmed
// state earns a full receipt. Both composers below are pure functions
// of the row — every rendered field is the row's own recorded value,
// never a paraphrase, never another row's.

export const APPLY_LOOP_STATES = [
  "queued",
  "driving",
  "submitted_unconfirmed",
  "confirmed",
] as const;

export interface ApplyLoopRow {
  company?: unknown;
  job_id?: unknown;
  url?: unknown;
  state: string;
  reason?: unknown;
  confirmation_id?: unknown;
  payload_hash?: unknown;
  email_confirmed_at?: unknown;
  evidence?: {
    page_confirmation?: unknown;
    confirmation_id?: unknown;
    confirmation_number?: unknown;
  } | null;
  source?: unknown;
  tz?: unknown;
}

// The full chat receipt for a confirmed application. Confirmed means
// ONE thing in this product — the employer's own email matched to the
// row (career_apply_confirm_as stamps email_confirmed_at) — so a row
// without that stamp gets NO receipt here, however it reached the
// "confirmed" label: page evidence alone never produces one. Every
// field renders verbatim from the row; a field the row does not carry
// is omitted, never invented or truncated into place (the payload
// hash renders only whole, exactly as recorded).
export function confirmedReceiptText(row: ApplyLoopRow): string | null {
  if (!row || row.state !== "confirmed" || !row.email_confirmed_at) return null;
  const company = clean(row.company, 80) || "the employer";
  const jobId = clean(row.job_id, 200);
  const confNo = clean(row.confirmation_id, 60) ||
    clean(row.evidence?.confirmation_id, 60) ||
    clean(row.evidence?.confirmation_number, 60);
  const hash = /^[a-f0-9]{64}$/.test(String(row.payload_hash ?? "")) ? String(row.payload_hash) : "";
  const at = clean(row.email_confirmed_at, 40);
  const url = httpsUrl(row.url);
  const lines = [
    `Receipt — ${company}${jobId ? ` (${jobId})` : ""}: confirmed by ${company}'s email at ${at}.`,
    ...(confNo ? [`Confirmation: ${confNo}`] : []),
    ...(hash ? [`Payload hash: ${hash}`] : []),
    ...(url ? [url] : []),
  ];
  return lines.join("\n");
}

// The status answer for one loop stage, composed from the row alone.
// Null for any state outside the loop — a finished row's wording
// belongs to receiptText / the proactive path, not to this readback.
export function applyLoopText(row: ApplyLoopRow): string | null {
  if (!row || !(APPLY_LOOP_STATES as readonly string[]).includes(row.state)) return null;
  const company = clean(row.company, 80) || "the employer";
  const jobId = clean(row.job_id, 200);
  const head = `${company}${jobId ? ` (${jobId})` : ""}`;
  switch (row.state) {
    case "confirmed":
      return confirmedReceiptText(row) ?? receiptText(row);
    case "submitted_unconfirmed":
      return `Status — ${head}: submitted_unconfirmed. ${receiptText(row)}`;
    case "queued":
      return `Status — ${head}: queued. Your approval is recorded and the application is waiting for the worker — nothing has been sent to the employer yet.`;
    case "driving":
      return `Status — ${head}: driving. The worker is filling in the employer's form now — nothing is confirmed yet.`;
    default:
      return null;
  }
}

export interface ReceiptRow {
  id: string;
  user_id: string;
  company?: string;
  url?: string;
  state: string;
  reason?: string | null;
  confirmation_id?: string | null;
  email_confirmed_at?: string | null;
  evidence?: { page_confirmation?: boolean } | null;
  source?: string | null;
}
export function planReceipts(rows: ReceiptRow[], now: number) {
  return rows
    .filter((r) => (FINAL_STATES as readonly string[]).includes(r.state))
    .map((r) => ({
      userId: r.user_id,
      key: `receipt:${r.id}`,
      kind: "receipt" as const,
      text: receiptText(r),
      at: now,
    }));
}
