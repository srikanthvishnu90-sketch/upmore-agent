// WO-032: a posting whose application is "email your resume to X", found in ingestion (career_ingest.ts) and stored on
// the posting (career_postings.apply_email). Pure: the posting's own words decide, never a guess.
//   - A sentence that tells applicants to email or send their resume, CV, cover letter or application to an address.
//   - On a posting with no ATS application form (its link is not a Greenhouse, Lever, Ashby, SmartRecruiters or other
//     ATS page), a sentence about applying that names an address.
// Never an address for something else: accommodations, questions, privacy, scams, agencies, "do not send", or a no-reply.

const EMAIL = String.raw`([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})`;
const SEND = String.raw`(?:e-?mail|send|submit|forward|direct)`;
const DOC = String.raw`(?:resumes?|résumés?|cvs?|curriculum vitae|cover letters?|applications?|portfolios?)`;
const STRICT = [
  // "Email your resume and cover letter to jobs@acme.com", "send a CV to hr@acme.com", "submit your application to ..."
  new RegExp(String.raw`\b${SEND}\b(?:\s+(?:us|in))?\s+(?:(?:your|a|an|the|their|both|updated|current|copy of your)\s+){0,3}${DOC}\b[^.\n]{0,100}?\b(?:to|at)\s*:?\s*${EMAIL}`, "i"),
  // "To apply, please email jobs@acme.com with your resume", "Applications should be sent to jobs@acme.com"
  new RegExp(String.raw`\b(?:to apply|apply|applications?|applicants?|candidates?|interested)\b[^.\n]{0,100}?\b${SEND}\w*\b[^.\n]{0,60}?(?:\b(?:to|at)\s*:?\s*)?${EMAIL}[^.\n]{0,80}\b${DOC}`, "i"),
  new RegExp(String.raw`\b${DOC}\b[^.\n]{0,40}?\b(?:should|can|may|must)\s+be\s+(?:e-?mailed|sent|submitted|forwarded|directed)\s+to\s*:?\s*${EMAIL}`, "i"),
];
const LOOSE = new RegExp(String.raw`\b(?:apply|applying|application|applications|resumes?|cvs?)\b[^.\n]{0,120}?${EMAIL}`, "i");
const NOT_APPLY = /accommodat|disabilit|assistance|question|inquir|enquir|scam|fraud|phish|privacy|personal (?:data|information)|data (?:request|protection)|gdpr|ccpa|unsubscribe|report|never ask|will not ask|agenc|third[- ]party|recruiters? (?:may|should|must)|\b(?:do not|don'?t|never|please don'?t)\s+(?:send|e-?mail|submit|forward)|technical (?:issue|difficult|problem)|trouble|reasonable adjustment/i;
const NOREPLY = /^(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|privacy|security|abuse|accommodations?|accessibility)\b/i;
const ATS_HOST = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|myworkday\.com|workable\.com|icims\.com|taleo\.net|successfactors\.(com|eu)|jobvite\.com|bamboohr\.com|breezy\.hr|recruitee\.com|jazzhr\.com|applytojob\.com|rippling\.com|teamtailor\.com|pinpointhq\.com|dayforcehcm\.com|ultipro\.com|paylocity\.com|oraclecloud\.com|eightfold\.ai)$/i;

export function hasAtsForm(url: unknown): boolean {
  try { return ATS_HOST.test(new URL(String(url ?? "")).hostname); } catch { return false; }
}
const sentences = (text: string) => String(text ?? "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9])|\s*\n+\s*/).filter(Boolean);
const ok = (addr: string) => addr.length <= 254 && !NOREPLY.test(addr.split("@")[0]);

// The address the posting asks applications to be emailed to, or null.
export function applyEmailOf(p: { description?: unknown; url?: unknown }): string | null {
  const text = String(p.description ?? "").slice(0, 20000);
  if (!text.includes("@")) return null;
  const open = !hasAtsForm(p.url);
  for (const s of sentences(text)) {
    if (!s.includes("@") || NOT_APPLY.test(s)) continue;
    for (const re of [...STRICT, ...(open ? [LOOSE] : [])]) {
      const m = re.exec(s);
      if (m) {
        const addr = m[1].replace(/\.$/, "").toLowerCase();
        if (ok(addr)) return addr;
      }
    }
  }
  return null;
}
