// trainee-inspect (2026-10-26; the owner's iMessage experience spec, section 7): the link on an approval ask that shows
// the exact answers and the exact resume file that would go out, and the link on a receipt that shows exactly what was
// sent. The link carries the card's 128-bit inspect token (20261026235017); everything shown is read by
// career_apply_inspect_for, which says whether each payload, hashed again by the database, is the hash the card showed.
// A page that does not match says so first, in words; it never shows a changed application as the approved one.
//
// Plain text, not HTML: Supabase serves HTML only on a custom domain ("Serving of HTML content is only supported with
// custom domains. Otherwise GET requests that return text/html will be rewritten to text/plain":
// https://supabase.com/docs/guides/functions/limits), and Trainee has no web domain yet. The resume is the file itself.
//   GET ?t=<token>            the application exactly as the card shows it (prepared), and what was queued, if approved
//   GET ?t=<token>&f=sent     exactly what the queue holds (what was sent, or is being sent)
//   GET ?t=<token>&f=resume   the resume file, served only when its bytes hash to the payload's resume_sha256
// Deploy with --no-verify-jwt: the token is the gate (a phone's browser carries no Supabase session).
export interface InspectDeps {
  now: () => number;
  inspect: (token: string, now: number) => Promise<any | null>; // career_apply_inspect_for
  // The resume file the payload names: its bytes and type, or null (a person's uploaded file, or the tailored render).
  resume: (userId: string, sha256: string) => Promise<{ bytes: Uint8Array; mime: string; name: string } | null>;
}
const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const text = (body: string, status = 200) => new Response(body, { status, headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" } });
const NOT_FOUND = "This link isn't valid or has expired, so there is nothing to show. Text Trainee \"show my applications\" for a current one.";
const sha256hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
const line = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : JSON.stringify(v)).replace(/\s+/g, " ").trim().slice(0, 2000);

export function renderPayload(payload: any): string[] {
  const out: string[] = [];
  const fields = Array.isArray(payload?.fields) ? payload.fields : [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const label = line(f.label ?? f.name ?? "field") || "field";
    if (f.name === "_systemfield_resume" || /resume|cv/i.test(String(f.kind ?? ""))) continue;
    out.push(`- ${label}: ${line(f.value) || "(left empty)"}`);
  }
  if (!out.length) out.push("- (this form asks no questions beyond the resume)");
  return out;
}

export async function handleInspect(req: Request, d: InspectDeps): Promise<Response> {
  if (req.method !== "GET") return text("Method not allowed", 405);
  const u = new URL(req.url);
  const token = u.searchParams.get("t") ?? "", what = u.searchParams.get("f") ?? "";
  if (!/^[0-9a-f]{32}$/.test(token) || !["", "sent", "resume"].includes(what)) return text(NOT_FOUND, 404);
  let data: any;
  try { data = await d.inspect(token, d.now()); } catch (e) { console.error("inspect:", e instanceof Error ? e.message : String(e)); return text("This page couldn't be read just now. Try the link again in a minute.", 503); }
  const item = data?.items?.[0];
  if (!data || !item) return text(NOT_FOUND, 404);
  const prepared = item.prepared, sent = item.sent;
  if (what === "resume") {
    const payload = (sent?.matches ? sent.payload : prepared?.matches ? prepared.payload : null);
    if (!payload) return text("This application changed after the card was shown, so its resume isn't shown here as the approved one. Nothing from this card will be sent.", 409);
    const sha = String(payload.resume_sha256 ?? "");
    if (!/^[0-9a-f]{64}$/.test(sha)) return text("This application has no resume file bound to it, so it can't be sent.", 404);
    const file = await d.resume(String(data.user_id), sha).catch(() => null);
    if (!file || await sha256hex(file.bytes) !== sha) return text(`The resume file with sha256 ${sha} is not on record here, so it can't be shown.`, 404);
    const name = file.name.replace(/[^A-Za-z0-9._ -]/g, "").slice(0, 100) || "Resume.pdf";
    return new Response(file.bytes as BodyInit, { headers: { ...HEADERS, "content-type": file.mime || "application/pdf", "content-disposition": `inline; filename="${name}"`, "x-content-sha256": sha } });
  }
  const view = what === "sent" ? sent : prepared;
  const company = line(prepared?.company ?? sent?.payload?.company ?? "the employer");
  const url = line(prepared?.url ?? sent?.payload?.url ?? "");
  const out: string[] = [];
  if (what === "sent") {
    if (!sent) return text(`Nothing from this card has been approved or sent to ${company}.`, 404);
    out.push(`Exactly what Trainee queued for ${company}${url ? ` (${url})` : ""}. Its state: ${line(sent.state)}.`);
    out.push(sent.matches ? `Check: it hashes to ${item.card_hash}, the hash on the card you approved.` : "WARNING: what the queue holds does not match the card you approved; it is never sent as approved.");
  } else {
    if (!prepared) return text(NOT_FOUND, 404);
    out.push(`The application to ${company}${url ? ` (${url})` : ""}, exactly as your card shows it.`);
    out.push(prepared.matches ? `Check: it hashes to ${item.card_hash}, the hash on the card.` : "WARNING: this application changed after the card was shown, so the card can't approve it. Nothing from this card will be sent.");
    out.push(data.state === "open" ? "The card is still waiting for your answer." : sent ? `You approved it; its state: ${line(sent.state)}.` : "The card was answered; this one was not approved.");
  }
  const payload = view?.payload ?? {};
  out.push("", "The answers that go to the employer:", ...renderPayload(payload));
  const sha = String(payload?.resume_sha256 ?? "");
  const base = `${u.origin}${u.pathname}?t=${token}`;
  out.push("", /^[0-9a-f]{64}$/.test(sha) ? `The resume file (sha256 ${sha}): ${base}&f=resume` : "No resume file is bound to it.");
  if (what !== "sent" && sent) out.push(`Exactly what was queued: ${base}&f=sent`);
  return text(out.join("\n"));
}

// The production reads, over the service client.
// deno-lint-ignore no-explicit-any
export function supabaseInspectDeps(admin: any): Omit<InspectDeps, "now"> {
  return {
    async inspect(token, now) {
      const { data, error } = await admin.rpc("career_apply_inspect_for", { p_token: token, p_now: new Date(now).toISOString() });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    async resume(userId, sha) {
      // The person's own file sent on a channel (career_resume_uploads), else the tailored render in storage.
      const up = await admin.from("career_resume_uploads").select("content_b64,mime,filename").eq("user_id", userId).eq("sha256", sha).limit(1);
      const row = up.data?.[0];
      if (row?.content_b64) return { bytes: Uint8Array.from(atob(row.content_b64), (c) => c.charCodeAt(0)), mime: row.mime || "application/pdf", name: row.filename || "Resume.pdf" };
      const got = await admin.storage.from("career-resumes").download(`${userId}/${sha}.pdf`);
      if (got.error || !got.data) return null;
      return { bytes: new Uint8Array(await got.data.arrayBuffer()), mime: "application/pdf", name: "Resume.pdf" };
    },
  };
}
