// The file pages' model and markup (owner, 2026-10-28): ONE decision per page, readable in 30 seconds, from Telegram.
// Pure functions: a model in, HTML or plain text out. No script (the disclosures are <details>, the actions are forms),
// so the page works with nothing but a browser and the plain-text twin carries every fact and every action's state.
//
// Rules that do not move: a fact is shown only when the posting (or a tool reading the person's confirmed resume) states it,
// each with its source; the status word is one of available / preparing / queued / submitted / confirmed / failed / unknown
// and says what is true; "applied" is never written before a submit; the logo comes only from the employer's own domain.
import { agoOf, BLOCKED_HOST, logoUrl, requirementsOf, sourceOf, type JobView, type PostingRow } from "./telegram_jobs.ts";

export type Word = "available" | "preparing" | "queued" | "submitted" | "confirmed" | "failed" | "unknown";
export interface Status { word: Word; detail: string }
export interface AppRow {
  id: string; state: string; reason: string | null; confirmation_id: string | null; created_at: string; updated_at: string;
  email_confirmed_at: string | null; payload: Record<string, unknown>; company: string; url: string;
}
export type Src = "From the posting" | "From your resume" | "Reported, not verified" | "Not listed";
export interface Fact { label: string; value: string; src: Src }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayOf = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; if (Number.isNaN(t)) return null; const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function statusOf(o: { app: AppRow | null; wanted: boolean; prepared: boolean }): Status {
  const a = o.app, who = a?.company || "The employer", on = dayOf(a?.updated_at);
  if (a) {
    const conf = a.confirmation_id ? ` (confirmation ${a.confirmation_id})` : "";
    switch (a.state) {
      case "confirmed": return { word: "confirmed", detail: `Submitted, and ${who} confirmed it${conf}.` };
      case "submitted_unconfirmed": return { word: "submitted", detail: `Submitted${on ? ` on ${on}` : ""}. ${who} has not confirmed it yet${conf}.` };
      case "queued": return { word: "queued", detail: "You approved it. It waits for the apply worker and is not submitted yet." };
      case "driving": return { word: "preparing", detail: "Being sent now; not submitted yet." };
      case "needs_user": return { word: "failed", detail: `Stopped before it was sent; it needs you: ${a.reason ?? "no reason recorded"}.` };
      case "failed": case "not_submitted": return { word: "failed", detail: `Not sent: ${a.reason ?? "no reason recorded"}.` };
      case "unknown_outcome": return { word: "unknown", detail: `I can't tell whether it reached ${who}. It will not be sent again.` };
      default: return { word: "unknown", detail: `Recorded as ${a.state}; not known to be sent.` };
    }
  }
  if (o.wanted) return { word: "preparing", detail: "Queued to be prepared. Nothing has been sent." };
  if (o.prepared) return { word: "available", detail: "Your application is prepared. Nothing is sent until you press Confirm." };
  return { word: "available", detail: "Nothing has been sent. Press Apply and I'll prepare it for you to check." };
}

export interface Model {
  job: JobView; kind: "match" | "proof"; token: string; proofToken: string | null;
  logo: string | null; facts: Fact[]; reasons: string[]; gaps: string[];
  requirements: string | null; fullPosting: string | null;
  status: Status; passed: boolean; hasApp: boolean; byHand: boolean; hasPrepared: boolean;
  app: AppRow | null; sent: string[];
}
export function factsOf(job: JobView, row: PostingRow | null, now: number): Fact[] {
  const f: Fact[] = [];
  const nl = (label: string): Fact => ({ label, value: "not listed", src: "Not listed" });
  const loc = row?.location ? { v: String(row.location), s: "From the posting" as Src } : job.location ? { v: job.location, s: "Reported, not verified" as Src } : null;
  f.push(loc ? { label: "Location", value: loc.v, src: loc.s } : nl("Location"));
  const mode = row?.remote === "remote" ? "Remote" : row?.remote === "hybrid" ? "Hybrid" : row?.remote === "onsite" ? "On-site" : null;
  if (mode) f.push({ label: "Work mode", value: mode, src: "From the posting" });
  else if (job.remote) f.push({ label: "Work mode", value: job.remote === "remote" ? "Remote" : job.remote === "hybrid" ? "Hybrid" : "On-site", src: "Reported, not verified" });
  f.push(row?.pay ? { label: "Pay", value: String(row.pay), src: "From the posting" } : job.pay ? { label: "Pay", value: job.pay, src: "Reported, not verified" } : nl("Pay"));
  if (row?.seniority_band) f.push({ label: "Level", value: String(row.seniority_band), src: "From the posting" });
  else if (job.level) f.push({ label: "Level", value: job.level, src: "Reported, not verified" });
  const posted = row?.posted_at ? agoOf(row.posted_at, now) : job.posted_at ? agoOf(job.posted_at, now) : null;
  f.push(posted ? { label: "Posted", value: posted, src: row?.posted_at ? "From the posting" : "Reported, not verified" } : nl("Posted"));
  const dl = row?.deadline ?? job.deadline;
  f.push(dl && dayOf(dl) ? { label: "Apply by", value: dayOf(dl)!, src: row?.deadline ? "From the posting" : "Reported, not verified" } : nl("Apply by"));
  if (job.source) f.push({ label: "Listed on", value: job.source, src: "From the posting" });
  return f;
}
export const blockedByHand = (url: string) => { try { return BLOCKED_HOST.test(new URL(url).hostname); } catch { return false; } };
export const fullPostingOf = (row: PostingRow | null): string | null => {
  const r = requirementsOf(row?.description);
  return r ? clip(r.label === "Requirements" ? String(row?.description ?? "").replace(/<\/(p|li|h\d|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim() : r.text, 12000) : null;
};

// ---------------------------------------------------------------- html
const CSS = `
:root{--bg:#f6f5f1;--card:#fff;--ink:#14161a;--mute:#4a505a;--line:#d5d2c9;--accent:#0b4fd6;--accent-ink:#fff;--ok:#0a6b34;--warn:#8a4b00;--bad:#a4161a;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--card:#1a1d22;--ink:#f2f3f5;--mute:#b4bac4;--line:#3a3f48;--accent:#7aa7ff;--accent-ink:#0a0f1a;--ok:#5fd68a;--warn:#f0b35a;--bad:#ff8d8f}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:16px}
.skip{position:absolute;left:-999px}.skip:focus{left:16px;top:8px;background:var(--card);padding:8px}
header{display:flex;gap:14px;align-items:center;padding:8px 0 16px}
.logo{position:relative;flex:none;width:64px;height:64px;border-radius:14px;overflow:hidden;background:var(--card);border:1px solid var(--line)}
.lettermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:var(--accent)}
.logo img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;color:transparent;font-size:0}
.eyebrow{margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
h1{margin:2px 0;font-size:24px;line-height:1.25}.company{margin:0;color:var(--mute)}
h2{font-size:17px;margin:0 0 8px}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0}
.status{margin:0;padding:10px 12px;border-radius:10px;border:2px solid var(--line)}
.status strong{text-transform:uppercase;letter-spacing:.04em}
.s-confirmed,.s-submitted{border-color:var(--ok)}.s-queued,.s-preparing,.s-available{border-color:var(--accent)}.s-failed,.s-unknown{border-color:var(--bad)}
dl{margin:0}.fact{display:grid;grid-template-columns:7.5em 1fr;gap:2px 10px;padding:8px 0;border-top:1px solid var(--line)}.fact:first-child{border-top:0}
dt{color:var(--mute)}dd{margin:0;font-weight:600}.src{grid-column:2;font-size:13px;font-weight:400;color:var(--mute)}
ul{margin:0;padding-left:20px}li{margin:6px 0}li .src{display:block;font-size:13px;color:var(--mute)}
details{border-top:1px solid var(--line);padding:4px 0}summary{min-height:48px;display:flex;align-items:center;cursor:pointer;font-weight:600}
.body{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 10px;color:var(--ink)}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px}.actions form{margin:0}
.btn,button{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;padding:10px 16px;border-radius:12px;border:2px solid var(--accent);background:transparent;color:var(--accent);font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
.primary{background:var(--accent);color:var(--accent-ink)}
a{color:var(--accent)}.linkrow{display:block;min-height:44px;padding:10px 0}
footer{color:var(--mute);font-size:14px;padding:8px 0 24px}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
@media (max-width:420px){.actions{grid-template-columns:1fr}.fact{grid-template-columns:1fr}.src{grid-column:1}}
`;
export function layout(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(clip(title, 90))}</title><style>${CSS}</style></head>
<body><a class="skip" href="#main">Skip to the file</a><div class="wrap">${inner}</div></body></html>`;
}
const head = (m: { job: JobView; logo: string | null }, eyebrow: string) => {
  const initial = esc((m.job.company.trim()[0] ?? "?").toUpperCase());
  const img = m.logo ? `<img src="${esc(m.logo)}" alt="${esc(m.job.company)} logo" width="64" height="64" loading="lazy" referrerpolicy="no-referrer">` : "";
  return `<header><div class="logo"><span class="lettermark" aria-hidden="true">${initial}</span>${img}</div><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(m.job.title || "Job posting")}</h1><p class="company">${esc(m.job.company)}</p></div></header>`;
};
const statusP = (s: Status) => `<p class="status s-${s.word}" role="status"><strong>${s.word}</strong> ${esc(s.detail)}</p>`;
const hidden = (token: string, action: string, extra = "") => `<input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="action" value="${action}">${extra}`;
const REVIEW_NOTE = "Nothing is sent until you press Confirm.";

export function renderMatch(m: Model): string {
  const facts = m.facts.map((f) => `<div class="fact"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd><span class="src">${esc(f.src)}</span></div>`).join("");
  const why = m.reasons.length ? `<section aria-labelledby="why"><h2 id="why">Why this fits you</h2><ul>${m.reasons.slice(0, 3).map((r) => `<li>${esc(r)}<span class="src">From your resume</span></li>`).join("")}</ul></section>` : "";
  const gaps = m.gaps.length ? `<section aria-labelledby="gaps"><h2 id="gaps">Not on your resume yet</h2><ul>${m.gaps.slice(0, 2).map((r) => `<li>${esc(r)}<span class="src">From your resume</span></li>`).join("")}</ul></section>` : "";
  const more = `${m.requirements ? `<details><summary>Requirements</summary><p class="body">${esc(m.requirements)}</p></details>` : ""}${m.fullPosting ? `<details><summary>Full posting</summary><p class="body">${esc(m.fullPosting)}</p></details>` : ""}`;
  let act: string;
  if (m.hasApp) act = `<p>This posting is already in your applications.</p>${m.proofToken ? `<a class="btn primary" href="?t=${esc(m.proofToken)}">Open the proof file</a>` : ""}`;
  else {
    const pass = m.passed ? `<p>You passed on this posting. Nothing was sent.</p>` : `<form method="post">${hidden(m.token, "pass")}<button type="submit">Pass</button></form>`;
    const apply = m.byHand ? `<p>I don't apply on LinkedIn, Indeed or Handshake for you. Apply there yourself.</p><a class="btn primary" href="${esc(m.job.url)}" rel="noopener noreferrer">Open the posting</a>`
      : `<form method="post">${hidden(m.token, "apply")}<button type="submit" class="primary">Apply</button></form>`;
    act = m.passed && !m.byHand ? `${pass}<div class="actions">${apply}</div>` : `<div class="actions">${pass}${apply}</div>${m.byHand ? "" : `<p>${REVIEW_NOTE} Apply shows you the exact application first.</p>`}`;
  }
  const link = m.job.url && !m.byHand ? `<a class="linkrow" href="${esc(m.job.url)}" rel="noopener noreferrer">Open the original posting</a>` : "";
  const inner = `${head(m, "Job match file")}<main id="main">
<section aria-labelledby="st"><h2 id="st">Status</h2>${statusP(m.status)}</section>
<section aria-labelledby="job"><h2 id="job">The job</h2><dl>${facts}</dl></section>${why}${gaps}
<section aria-labelledby="more"><h2 id="more">Details</h2>${more || "<p>The full posting text is not on file.</p>"}${link}</section>
<section aria-labelledby="go"><h2 id="go">Your decision</h2>${act}</section></main>
<footer>This link is only for you and expires. <a href="?t=${esc(m.token)}&amp;format=text">Plain-text version</a></footer>`;
  return layout(`${m.job.title} at ${m.job.company} - Trainee`, inner);
}

export function renderProof(m: Model): string {
  const a = m.app!;
  const rows: [string, string][] = [["Approved", dayOf(a.created_at) ?? "not recorded"], ["Last update", dayOf(a.updated_at) ?? "not recorded"], ["Employer confirmation", a.confirmation_id ?? "none yet"]];
  const inner = `${head(m, "Application proof file")}<main id="main">
<section aria-labelledby="st"><h2 id="st">Status</h2>${statusP(m.status)}</section>
<section aria-labelledby="tl"><h2 id="tl">What happened</h2><dl>${rows.map(([k, v]) => `<div class="fact"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>
<section aria-labelledby="sent"><h2 id="sent">What was approved to send</h2>${m.sent.map((l) => `<p class="body">${esc(l)}</p>`).join("")}</section>
<section aria-labelledby="back"><h2 id="back">More</h2><a class="btn" href="?t=${esc(m.token)}&amp;view=match">Back to the job</a></section></main>
<footer>This link is only for you and expires. <a href="?t=${esc(m.token)}&amp;format=text">Plain-text version</a></footer>`;
  return layout(`Application proof: ${m.job.title} at ${m.job.company} - Trainee`, inner);
}

export function renderReview(m: Model, lines: string[], tag: string): string {
  const inner = `${head(m, "Check the application")}<main id="main">
<section aria-labelledby="pay"><h2 id="pay">Exactly what will be sent</h2>${lines.map((l) => `<p class="body">${esc(l)}</p>`).join("")}<p><strong>${REVIEW_NOTE}</strong></p></section>
<section aria-labelledby="go"><h2 id="go">Your decision</h2><div class="actions">
<form method="post">${hidden(m.token, "confirm", `<input type="hidden" name="tag" value="${esc(tag)}">`)}<button type="submit" class="primary">Confirm</button></form>
<a class="btn" href="?t=${esc(m.token)}">Cancel</a></div>
<p>To change an answer, the cover note or the resume, tell Trainee in Telegram. The new version gets a fresh Confirm and this one stops working.</p></section></main>
<footer>This link is only for you and expires.</footer>`;
  return layout(`Check: ${m.job.title} at ${m.job.company} - Trainee`, inner);
}

// A short result page: a line of what happened, the status when it matters, a way back.
export function renderMessage(o: { m: Pick<Model, "job" | "logo" | "token">; eyebrow: string; paras: string[]; status?: Status; again?: boolean }): string {
  const inner = `${head(o.m, o.eyebrow)}<main id="main"><section aria-labelledby="r"><h2 id="r">${o.status ? "Status" : "Result"}</h2>${o.status ? statusP(o.status) : ""}${o.paras.map((p) => `<p>${esc(p)}</p>`).join("")}
<a class="btn" href="?t=${esc(o.m.token)}">Back to the job</a></section></main><footer>This link is only for you and expires.</footer>`;
  return layout(`${o.eyebrow}: ${o.m.job.title} - Trainee`, inner);
}

// A link that cannot be used: says why, shows nothing about any job, offers no action.
export function renderLinkState(title: string, paras: string[]): string {
  return layout(`${title} - Trainee`, `<header><div><p class="eyebrow">Trainee</p><h1>${esc(title)}</h1></div></header><main id="main"><section aria-labelledby="w"><h2 id="w">What to do</h2>${paras.map((p) => `<p>${esc(p)}</p>`).join("")}</section></main>`);
}

// ---------------------------------------------------------------- plain text twin
export function renderText(m: Model): string {
  const L: string[] = [];
  const a = m.app;
  L.push(m.kind === "proof" ? "Application proof file" : "Job match file", m.job.title, m.job.company, "", `Status: ${m.status.word}`, m.status.detail, "");
  if (m.kind === "proof" && a) {
    L.push(`Approved: ${dayOf(a.created_at) ?? "not recorded"}`, `Last update: ${dayOf(a.updated_at) ?? "not recorded"}`, `Confirmation: ${a.confirmation_id ?? "none yet"}`, "", "What was approved to send:", ...m.sent, "");
    return L.join("\n");
  }
  for (const f of m.facts) L.push(`${f.label}: ${f.value} (${f.src})`);
  if (m.reasons.length) L.push("", "Why this fits you:", ...m.reasons.slice(0, 3).map((r) => `• ${r} (From your resume)`));
  if (m.gaps.length) L.push("", "Not on your resume yet:", ...m.gaps.slice(0, 2).map((r) => `• ${r} (From your resume)`));
  if (m.requirements) L.push("", "Requirements:", clip(m.requirements, 4000));
  if (m.fullPosting) L.push("", "Full posting:", clip(m.fullPosting, 6000));
  L.push("", "Actions:");
  L.push(`Pass: ${m.hasApp ? "closed (already in your applications)" : m.passed ? "done (you passed)" : "available"}`);
  L.push(`Apply: ${m.byHand ? "not automated on this site; apply there yourself" : m.hasApp ? "closed (already in your applications)" : "available"}`);
  L.push(`${REVIEW_NOTE} Apply shows the exact application first.`);
  if (m.job.url) L.push("", `Posting: ${m.job.url}`);
  L.push("", "To act, open this link in a browser, or tell Trainee in Telegram.");
  return L.join("\n");
}
