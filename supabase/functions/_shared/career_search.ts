// Job search over real postings (WO-006): filter by the query's words, then rank by fit to the person's CONFIRMED facts
// (CareerJobs.scoreFit, 121, through the router's scoring-profile adapter), then newest first. A posting the person is
// knocked out of (a license, a clearance, a degree their confirmed facts don't show) is not hidden: it ranks last and
// carries the reason, so the agent can say what is missing instead of pretending the job doesn't exist.
import { CareerJobs, CareerProfile, CareerRouter } from "./router_core.career.js";
import { matchesWords, searchWords, titleTier } from "./career_ingest.ts";
import { payFrom } from "./posting_pay.ts";

export interface Fit { score: number | null; bucket: string | null; excluded: boolean; reasons: string[]; gaps: string[] }
export interface SearchHit { job_id: string; company: string; title: string; location: string; url: string; first_seen_at: string | null; fit: Fit | null; pay: string | null }

export function scoringProfileFor(profile: any): any | null {
  const confirmed = profile ? CareerProfile.confirmedFacts(profile) : [];
  if (!confirmed.length) return null;
  const sp: Record<string, unknown> = CareerRouter.scoringProfile({ ...profile, facts: confirmed });
  // Years of experience are known only from dated experience facts. "3 years at Acme" said in chat has no dates, and the
  // router's adapter would count it as 0, so a fit line would say "your profile is 0 yrs experience" to someone with
  // three. Unknown stays unknown: seniority and minimum-years knockouts then do not fire.
  if (!confirmed.some((f: any) => f.kind === "experience" && /\d{4}-\d{2}/.test(String(f.start || "")))) delete sp.experience_years;
  return sp;
}

export function fitOf(p: any, sp: any): Fit {
  const posting = {
    job_id: p.job_id, company: p.company, title: p.title || "", location: p.location || "", jd_text: p.description || "",
    role_family: p.role_family || CareerJobs.roleFamily(p.title || "", p.description || ""),
    seniority_band: p.seniority_band || CareerJobs.seniorityBand(p.title || "", p.description || ""),
    remote: p.remote || (/\bremote\b/i.test(p.location || "") ? "remote" : /\bhybrid\b/i.test(p.location || "") ? "hybrid" : "onsite"),
    department: p.department || "", posted_at: p.posted_at || null,
  };
  const f = CareerJobs.scoreFit(posting, sp);
  return { score: f.score, bucket: f.bucket, excluded: !!f.excluded, reasons: (f.reasons || []).slice(0, 4), gaps: (f.gaps || []).slice(0, 3) };
}

export function searchPostings(pool: any[], query: unknown, profile: any, limit = 10): { postings: SearchHit[]; total: number; title_matches: number; ranked_by: "fit" | "newest" } {
  const words = searchWords(query);
  const matched = pool.filter((p) => p && !p.closed_at && matchesWords(p, words));
  // WO-073: the role first. While any title carries a query word, a posting that only mentions the words elsewhere is not
  // offered; every word in the title ranks above some of them; fit and then newest order postings within a tier.
  const anyTitle = matched.some((p) => titleTier(p, words) < 2);
  const hits = anyTitle ? matched.filter((p) => titleTier(p, words) < 2) : matched;
  const sp = scoringProfileFor(profile);
  const scored = hits.map((p) => ({ p, tier: titleTier(p, words), fit: sp ? fitOf(p, sp) : null }));
  const newest = (a: any, b: any) => String(b.p.first_seen_at || "").localeCompare(String(a.p.first_seen_at || ""));
  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.fit && b.fit) {
      if (a.fit.excluded !== b.fit.excluded) return a.fit.excluded ? 1 : -1;
      const d = (b.fit.score ?? -1) - (a.fit.score ?? -1);
      if (d) return d;
    }
    return newest(a, b);
  });
  const n = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
  return {
    // WO-068: the pay the posting itself states (posting_pay.ts), or null: never an estimate.
    postings: scored.slice(0, n).map(({ p, fit }) => ({ job_id: p.job_id, company: p.company, title: p.title, location: p.location || "", url: p.url, first_seen_at: p.first_seen_at ?? null, fit, pay: p.pay ?? payFrom(p.description) })),
    total: hits.length, title_matches: scored.filter((x) => x.tier === 0).length, ranked_by: sp ? "fit" : "newest",
  };
}
