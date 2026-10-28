// PEOPLE PROVIDER (D-MN-3, owner 2026-10-27): finding people at scale through a paid people/email data provider, into
// the same career_people store as the person's own sources (career_people.ts). One adapter interface, two providers:
//   hunter   Domain Search (GET https://api.hunter.io/v2/domain-search) for the people a company's domain publishes,
//            then Email Verifier (GET https://api.hunter.io/v2/email-verifier) for any address Domain Search did not
//            already mark "valid". Auth: the api_key query parameter.
//   apollo   People API Search (POST https://api.apollo.io/api/v1/mixed_people/api_search: no credits, no emails), then
//            Bulk People Enrichment (POST https://api.apollo.io/api/v1/people/bulk_match, 10 people a call, the endpoint's
//            own maximum) for the people Apollo says have an email. Auth: the x-api-key header.
// Docs read and cited: docs/architect/PEOPLE-PROVIDER-2026-10-27.md.
//
// Rules this file keeps (and the tests break each one on purpose):
//   - No key, no provider: NOT_WIRED with a plain reply, and no HTTP call. Never a made-up person or address.
//   - An address is sendable only when the provider itself verified it (Hunter "valid", Apollo "verified"). Anything else
//     (accept_all, unknown, unverified, likely_to_engage, a 202 still-checking) is stored, shown, and never sendable.
//     No address is ever built from a name and a pattern.
//   - Everything the provider wrote is someone else's text: cleaned like a CSV cell; a field that reads as an instruction
//     is dropped (a name that does: the person is dropped); a profile link (LinkedIn included) is kept as text only and
//     never fetched; nothing here writes to the person's profile or memory.
//   - Trainee sets no volume limit of its own (owner, 2026-10-27 19:55). The provider's refusal (429, out of credits) is
//     the only brake: shared through the database (career_provider_state) so every instance backs off, and said plainly.
//   - One company is looked up once for everyone within the cache window (career_provider_cache, no user id); each person
//     gets their own copy in career_people, deduped against what they already have. Every lookup is on the ledger.
import { cleanCell, cleanEmail, companyKey, isFormula, readsAsInstruction } from "./career_people_import.ts";
import { neverOpen } from "./career_people_sites.ts";

export type ProviderName = "hunter" | "apollo";
export const PROVIDERS: ProviderName[] = ["hunter", "apollo"];
export const KEY_SECRET: Record<ProviderName, string> = { hunter: "HUNTER_API_KEY", apollo: "APOLLO_API_KEY" };
export const LABEL: Record<ProviderName, string> = { hunter: "Hunter", apollo: "Apollo" };
// The providers' own page sizes (technical: the most one response carries), not a product limit.
export const HUNTER_PAGE = 100, APOLLO_PAGE = 100, APOLLO_ENRICH_BATCH = 10;
export const DEFAULT_CACHE_DAYS = 30;

export interface FindQuery {
  company?: string | null; domain?: string | null;
  titles?: string[]; seniority?: string[]; location?: string | null;
  limit?: number | null; // only when the person named a number ("10 engineering managers"); absent: everything the provider has
}
export interface ProviderPerson {
  provider: ProviderName; provider_id: string; name: string; email: string | null; email_status: string; email_confidence: number | null;
  sendable: boolean; company: string; company_key: string; position: string; location: string;
  source_ref: string; source_url: string | null; profile_text: string | null;
}
export type FindResult =
  | { status: "ok"; people: ProviderPerson[]; company: string; http_calls: number; credits: number | null; note: string | null }
  | { status: "rate_limited"; retry_after_s: number; http_calls: number; detail: string }
  | { status: "out_of_credits"; http_calls: number; detail: string }
  | { status: "not_wired"; reason: string; http_calls: number }
  | { status: "error"; detail: string; http_calls: number };
export interface PeopleProvider {
  name: ProviderName;
  supportsSchool: false; // neither provider's people search filters by school (docs); alumni come from the person's own sources
  findPeople(q: FindQuery): Promise<FindResult>;
}

// ------------------------------------------------------------------------------------------------ config
export interface ProviderConfig { provider: ProviderName | null; apiKey: string | null; cacheSeconds: number; leaseSeconds: number; asked: string | null }
// CAREER_PEOPLE_PROVIDER=hunter|apollo picks the provider; its key is read from the function secret named in KEY_SECRET
// (never logged, never returned). CAREER_PEOPLE_PROVIDER_CACHE_DAYS (default 30) is how long one company's lookup is reused.
export function providerConfig(env: (k: string) => string | undefined): ProviderConfig {
  const asked = (env("CAREER_PEOPLE_PROVIDER") ?? "").trim().toLowerCase() || null;
  const provider = (PROVIDERS as string[]).includes(asked ?? "") ? asked as ProviderName : null;
  const key = provider ? (env(KEY_SECRET[provider]) ?? "").trim() : "";
  const days = Number(env("CAREER_PEOPLE_PROVIDER_CACHE_DAYS"));
  return { provider, apiKey: key || null, asked, cacheSeconds: Math.round((Number.isFinite(days) && days >= 0 ? days : DEFAULT_CACHE_DAYS) * 86400), leaseSeconds: 120 };
}
export function notWiredReply(c: Pick<ProviderConfig, "provider" | "asked">): string {
  if (!c.provider) return "Finding new people through a people-data service isn't set up yet, so I only looked through the contacts you've given me. I won't guess names or email addresses.";
  return `Finding new people through ${LABEL[c.provider]} isn't connected yet (its key hasn't been added), so I only looked through the contacts you've given me. I won't guess names or email addresses.`;
}
export function makeProvider(c: ProviderConfig, f: typeof fetch): PeopleProvider | null {
  if (!c.provider || !c.apiKey) return null;
  return c.provider === "hunter" ? hunterProvider({ fetch: f, apiKey: c.apiKey }) : apolloProvider({ fetch: f, apiKey: c.apiKey });
}

// ------------------------------------------------------------------------------------------------ provider text, cleaned
const URLISH = /https?:|www\.|\/\//i;
// A field someone else wrote: cleaned; a formula, or text that reads as an instruction, is no field at all.
export function field(v: unknown, max: number): string {
  const raw = String(v ?? "");
  if (isFormula(raw) || readsAsInstruction(raw)) return "";
  const c = cleanCell(raw, max);
  return readsAsInstruction(c) ? "" : c;
}
// A person's name: a field, with a letter in it, and not a link.
export function personName(v: unknown): string {
  const n = field(v, 200);
  return n && /\p{L}/u.test(n) && !URLISH.test(n) ? n : "";
}
// A profile link kept as text only (never fetched, never a source_url): LinkedIn and every other one.
export function profileText(v: unknown): string | null {
  const s = cleanCell(v, 600);
  return s && /^https?:\/\/\S+$/i.test(s) && !readsAsInstruction(s) ? s : null;
}
// A public page an address was found on, as the source to cite: https, never a site Trainee never opens. Never fetched here.
export function citeUrl(v: unknown): string | null {
  const s = cleanCell(v, 2048);
  if (!/^https:\/\/\S+$/i.test(s)) return null;
  try { const u = new URL(s); return neverOpen(u.hostname) ? null : u.toString(); } catch { return null; }
}
const confidence = (v: unknown): number | null => { const n = Number(v); return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null; };
const domainOf = (v: unknown): string => { const d = String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, ""); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : ""; };

// ------------------------------------------------------------------------------------------------ refusals
// The provider refusing, by its own documented codes (docs/architect/PEOPLE-PROVIDER-2026-10-27.md):
//   Hunter  401 a key it refused; 403 its per-second/per-minute rate limit; 429 the plan's monthly credits used up.
//   Apollo  401/403 a key it refused; 429 its rate limit (error_details.context.window: minute, hour or day); a 4xx
//           body that speaks of credits is out of credits.
function refusal(provider: ProviderName, status: number, body: string, retryAfter: string | null, calls: number): FindResult | null {
  const after = Math.max(1, Math.min(Number(retryAfter) || 0, 86400));
  if (provider === "hunter") {
    if (status === 401) return { status: "not_wired", reason: "Hunter refused the key (HTTP 401)", http_calls: calls };
    if (status === 403) return { status: "rate_limited", retry_after_s: Number(retryAfter) ? after : 60, http_calls: calls, detail: "Hunter: HTTP 403 (rate limit)" };
    if (status === 429) return { status: "out_of_credits", http_calls: calls, detail: "Hunter: HTTP 429 (usage limit)" };
    return null;
  }
  if (/credit|usage limit|upgrade your plan/i.test(body.slice(0, 600)) && status >= 400 && status < 500 && status !== 401) return { status: "out_of_credits", http_calls: calls, detail: `Apollo: HTTP ${status} (credits)` };
  if (status === 429) {
    const win = /"window"\s*:\s*"(minute|hour|day)"/i.exec(body)?.[1]?.toLowerCase();
    return { status: "rate_limited", retry_after_s: Number(retryAfter) ? after : win === "day" ? 86400 : win === "hour" ? 3600 : 60, http_calls: calls, detail: `Apollo: HTTP 429${win ? ` (per ${win})` : ""}` };
  }
  if (status === 401 || status === 403) return { status: "not_wired", reason: `Apollo refused the key (HTTP ${status})`, http_calls: calls };
  return null;
}

// ------------------------------------------------------------------------------------------------ Hunter
const HUNTER = "https://api.hunter.io/v2";
const HUNTER_SENIORITY = new Set(["junior", "senior", "executive"]);
export function hunterProvider(o: { fetch: typeof fetch; apiKey: string }): PeopleProvider {
  return {
    name: "hunter", supportsSchool: false,
    async findPeople(q) {
      let calls = 0;
      const domain = domainOf(q.domain);
      const company = cleanCell(q.company, 200);
      if (!domain && !company) return { status: "error", detail: "no company or domain to look up", http_calls: 0 };
      const want = q.limit && q.limit > 0 ? Math.floor(q.limit) : Infinity;
      const raw: any[] = [];
      let org = "", offset = 0, total = Infinity;
      while (raw.length < want && offset < total) {
        const u = new URL(`${HUNTER}/domain-search`);
        if (domain) u.searchParams.set("domain", domain); else u.searchParams.set("company", company);
        u.searchParams.set("type", "personal");
        u.searchParams.set("limit", String(Math.min(HUNTER_PAGE, want - raw.length)));
        u.searchParams.set("offset", String(offset));
        const sen = (q.seniority ?? []).map((s) => s.toLowerCase()).filter((s) => HUNTER_SENIORITY.has(s));
        if (sen.length) u.searchParams.set("seniority", sen.join(","));
        if (q.titles?.length) u.searchParams.set("job_titles", q.titles.map((t) => cleanCell(t, 80)).filter(Boolean).join(","));
        u.searchParams.set("api_key", o.apiKey);
        let r: Response;
        try { calls++; r = await o.fetch(u.toString(), { headers: { accept: "application/json" } }); }
        catch (e) { return { status: "error", detail: `Hunter: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200), http_calls: calls }; }
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          return refusal("hunter", r.status, body, r.headers.get("retry-after"), calls) ?? { status: "error", detail: `Hunter: HTTP ${r.status}`, http_calls: calls };
        }
        const j: any = await r.json().catch(() => null);
        const emails = Array.isArray(j?.data?.emails) ? j.data.emails : [];
        org ||= field(j?.data?.organization, 200);
        total = Number.isFinite(Number(j?.meta?.results)) ? Number(j.meta.results) : offset + emails.length;
        raw.push(...emails);
        if (!emails.length) break;
        offset += emails.length;
      }
      const companyName = org || company || domain;
      const people: ProviderPerson[] = [];
      let note: string | null = null;
      for (const e of raw.slice(0, want)) {
        const email = cleanEmail(e?.value);
        const name = personName([e?.first_name, e?.last_name].filter((x) => x && String(x).trim()).join(" "));
        if (!email || !name) continue; // no person without a name, no Hunter row without its address
        let status = String(e?.verification?.status ?? "").toLowerCase() || "unverified";
        let score = confidence(e?.confidence);
        if (status === "unverified" && !note) {
          // Email Verifier: Hunter's own check of an address Domain Search carried no verification for (a status it
          // already gave, valid or not, is Hunter's word: not paid for twice).
          const v = new URL(`${HUNTER}/email-verifier`);
          v.searchParams.set("email", email);
          v.searchParams.set("api_key", o.apiKey);
          let r: Response | null = null;
          try { calls++; r = await o.fetch(v.toString(), { headers: { accept: "application/json" } }); } catch { r = null; }
          if (r && r.status === 202) status = "checking";
          else if (r && r.ok) { const j: any = await r.json().catch(() => null); status = String(j?.data?.status ?? "unknown").toLowerCase(); score = confidence(j?.data?.score) ?? score; }
          else if (r) {
            const ref = refusal("hunter", r.status, await r.text().catch(() => ""), r.headers.get("retry-after"), calls);
            // The rest stay unverified (stored, never sendable); the people found are kept, not thrown away.
            if (ref && (ref.status === "rate_limited" || ref.status === "out_of_credits")) note = ref.status;
          }
        }
        const src = Array.isArray(e?.sources) ? e.sources.map((s: any) => citeUrl(s?.uri)).find(Boolean) ?? null : null;
        people.push({
          provider: "hunter", provider_id: email, name, email, email_status: status.slice(0, 40), email_confidence: score, sendable: status === "valid",
          company: companyName, company_key: companyKey(companyName), position: field(e?.position, 300), location: "",
          source_ref: `Hunter Domain Search, ${domain || company}`.slice(0, 600), source_url: src, profile_text: profileText(e?.linkedin),
        });
      }
      return { status: "ok", people, company: companyName, http_calls: calls, credits: null, note };
    },
  };
}

// ------------------------------------------------------------------------------------------------ Apollo
const APOLLO = "https://api.apollo.io/api/v1";
const APOLLO_SENIORITY = new Set(["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior", "entry", "intern"]);
export function apolloProvider(o: { fetch: typeof fetch; apiKey: string }): PeopleProvider {
  const post = async (path: string, body: unknown) => o.fetch(`${APOLLO}/${path}`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json", "cache-control": "no-cache", "x-api-key": o.apiKey }, body: JSON.stringify(body),
  });
  return {
    name: "apollo", supportsSchool: false,
    async findPeople(q) {
      let calls = 0;
      const domain = domainOf(q.domain);
      const company = cleanCell(q.company, 200);
      if (!domain && !company) return { status: "error", detail: "no company or domain to look up", http_calls: 0 };
      const want = q.limit && q.limit > 0 ? Math.floor(q.limit) : Infinity;
      const ids: string[] = [];
      let page = 1, total = Infinity;
      const fail = async (r: Response) => refusal("apollo", r.status, await r.text().catch(() => ""), r.headers.get("retry-after"), calls) ?? { status: "error" as const, detail: `Apollo: HTTP ${r.status}`, http_calls: calls };
      // 1. search (free, no emails): the ids of the people Apollo says have an email
      while (ids.length < want && (page - 1) * APOLLO_PAGE < total) {
        const body: Record<string, unknown> = { page, per_page: APOLLO_PAGE };
        if (domain) body.q_organization_domains_list = [domain]; else body.q_organization_name = company;
        if (q.titles?.length) { body.person_titles = q.titles.map((t) => cleanCell(t, 80)).filter(Boolean); body.include_similar_titles = true; }
        const sen = (q.seniority ?? []).map((s) => s.toLowerCase()).filter((s) => APOLLO_SENIORITY.has(s));
        if (sen.length) body.person_seniorities = sen;
        if (q.location) body.person_locations = [cleanCell(q.location, 100)];
        let r: Response;
        try { calls++; r = await post("mixed_people/api_search", body); }
        catch (e) { return { status: "error", detail: `Apollo: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200), http_calls: calls }; }
        if (!r.ok) return await fail(r);
        const j: any = await r.json().catch(() => null);
        const ppl = Array.isArray(j?.people) ? j.people : [];
        total = Number.isFinite(Number(j?.total_entries)) ? Number(j.total_entries) : Number.isFinite(Number(j?.pagination?.total_entries)) ? Number(j.pagination.total_entries) : (page - 1) * APOLLO_PAGE + ppl.length;
        for (const p of ppl) if (p?.id && p.has_email !== false && ids.length < want) ids.push(String(p.id).slice(0, 300));
        if (ppl.length < APOLLO_PAGE) break;
        page++;
      }
      // 2. enrich (credits): name, title, email and Apollo's own email_status, 10 at a time
      const people: ProviderPerson[] = [];
      let credits = 0, sawCredits = false, companyName = company || domain, note: string | null = null;
      for (let i = 0; i < ids.length; i += APOLLO_ENRICH_BATCH) {
        let r: Response;
        try { calls++; r = await post("people/bulk_match?reveal_personal_emails=false", { details: ids.slice(i, i + APOLLO_ENRICH_BATCH).map((id) => ({ id })) }); }
        catch (e) { return { status: "error", detail: `Apollo: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200), http_calls: calls }; }
        if (!r.ok) {
          const f = await fail(r);
          // what was already enriched is kept (its credits are spent); the refusal is said
          if (people.length && (f.status === "rate_limited" || f.status === "out_of_credits")) { note = f.status; break; }
          return f;
        }
        const j: any = await r.json().catch(() => null);
        if (Number.isFinite(Number(j?.credits_consumed))) { credits += Number(j.credits_consumed); sawCredits = true; }
        for (const m of Array.isArray(j?.matches) ? j.matches : []) {
          if (!m || !m.id) continue;
          const name = personName(m.name || [m.first_name, m.last_name].filter(Boolean).join(" "));
          if (!name) continue;
          const email = cleanEmail(m.email);
          const status = email ? (String(m.email_status ?? "").toLowerCase().slice(0, 40) || "unverified") : "none";
          const org = field(m.organization?.name, 200) || companyName;
          companyName = org;
          people.push({
            provider: "apollo", provider_id: String(m.id).slice(0, 300), name, email, email_status: status, email_confidence: null,
            sendable: !!email && status === "verified",
            company: org, company_key: companyKey(org), position: field(m.title, 300),
            location: field([m.city, m.state, m.country].filter(Boolean).join(", "), 200),
            source_ref: `Apollo person ${String(m.id).slice(0, 80)}`, source_url: null, profile_text: profileText(m.linkedin_url),
          });
        }
      }
      return { status: "ok", people, company: companyName, http_calls: calls, credits: sawCredits ? credits : null, note };
    },
  };
}

// ------------------------------------------------------------------------------------------------ the store (RPC only)
export interface Job { id: number; provider: ProviderName; query_key: string; query: FindQuery & { company_key?: string }; lease_token: string; attempts: number }
export interface ProviderStore {
  request(userId: string, provider: ProviderName, key: string, query: FindQuery, cacheSeconds: number): Promise<{ state: "cached" | "queued"; job_id?: number; inserted?: number; already_known?: number }>;
  claim(n: number, leaseSeconds: number, userId: string | null): Promise<Job[]>;
  reclaim(): Promise<number>;
  complete(job: Job, company: string, people: ProviderPerson[], httpCalls: number, credits: number | null): Promise<{ state: string; results?: number }>;
  fail(job: Job, kind: "rate_limited" | "out_of_credits" | "error" | "not_wired", detail: string, retrySeconds: number, httpCalls: number, failAfter: number): Promise<{ state: string }>;
  status(userId: string, provider: ProviderName): Promise<{ waiting: number; failed: { job_id: number; outcome: string }[]; blocked_until: string | null; blocked_reason: string | null }>;
  candidates(userId: string, keys: string[], after: number, page: number): Promise<Candidate[]>;
  appliedCompanies(userId: string): Promise<string[]>;
  forget(userId: string): Promise<number>;
}
export interface Candidate {
  id: number; source: string; name: string | null; email: string | null; company: string; company_key: string; position: string; school: string;
  source_ref: string; source_url: string | null; provider: ProviderName | null; provider_id: string | null; email_status: string | null;
  email_confidence: number | null; sendable: boolean; fetched_at: string | null; same_as: number | null; connected_on: string | null;
}
// deno-lint-ignore no-explicit-any
const must = (r: { data: any; error: any }, what: string): any => { if (r.error) throw new Error(`${what}: ${r.error.message ?? r.error}`); return r.data; };
// deno-lint-ignore no-explicit-any
export function supabaseProviderStore(admin: { rpc: (f: string, a?: any) => Promise<{ data: any; error: any }> }): ProviderStore {
  return {
    async request(userId, provider, key, query, cacheSeconds) {
      return must(await admin.rpc("career_provider_request", { p_user: userId, p_provider: provider, p_query_key: key, p_query: query, p_cache_seconds: cacheSeconds }), "ask for a lookup");
    },
    async claim(n, lease, userId) { return must(await admin.rpc("career_provider_claim", { p_n: n, p_lease_seconds: lease, p_user: userId }), "claim lookups") ?? []; },
    async reclaim() { return must(await admin.rpc("career_provider_reclaim", {}), "reclaim lookups") ?? 0; },
    async complete(job, company, people, httpCalls, credits) {
      return must(await admin.rpc("career_provider_complete", { p_job: job.id, p_lease: job.lease_token, p_company: company, p_company_key: companyKey(company) || job.query.company_key || "", p_people: people, p_http_calls: httpCalls, p_credits: credits }), "save a lookup");
    },
    async fail(job, kind, detail, retry, httpCalls, failAfter) {
      return must(await admin.rpc("career_provider_fail", { p_job: job.id, p_lease: job.lease_token, p_kind: kind, p_detail: detail, p_retry_seconds: retry, p_http_calls: httpCalls, p_fail_after: failAfter }), "record a refused lookup");
    },
    async status(userId, provider) { return must(await admin.rpc("career_provider_status", { p_user: userId, p_provider: provider }), "read the lookups"); },
    async candidates(userId, keys, after, page) { return must(await admin.rpc("career_provider_candidates", { p_user: userId, p_keys: keys, p_after: after, p_page: page }), "read the people") ?? []; },
    async appliedCompanies(userId) { return must(await admin.rpc("career_provider_applied_companies", { p_user: userId }), "read your applications") ?? []; },
    async forget(userId) { return must(await admin.rpc("career_provider_forget", { p_user: userId }), "forget the people found for you") ?? 0; },
  };
}

// ------------------------------------------------------------------------------------------------ the query key
// One lookup per (provider, normalized query): the same company asked by anyone is the same key, whatever the casing.
export async function queryKey(q: FindQuery): Promise<{ key: string; norm: FindQuery & { company_key: string } }> {
  const domain = domainOf(q.domain), company = cleanCell(q.company, 200);
  const norm = {
    domain: domain || null, company: domain ? null : company || null, company_key: companyKey(company || domain.split(".")[0] || ""),
    titles: [...new Set((q.titles ?? []).map((t) => cleanCell(t, 80).toLowerCase()).filter(Boolean))].sort(),
    seniority: [...new Set((q.seniority ?? []).map((t) => t.toLowerCase()).filter(Boolean))].sort(),
    location: cleanCell(q.location, 100).toLowerCase() || null, limit: q.limit && q.limit > 0 ? Math.floor(q.limit) : null,
  };
  const canon = JSON.stringify([norm.domain, norm.company && companyKey(norm.company), norm.titles, norm.seniority, norm.location, norm.limit]);
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { key: `${(norm.company_key || domain).slice(0, 120)}|${sha.slice(0, 40)}`, norm };
}

// ------------------------------------------------------------------------------------------------ the worker
// Claims queued lookups (any instance, any number at once: SKIP LOCKED leases), runs them concurrently, and completes
// or fails each under its lease. The provider's refusal blocks that provider for every instance until it allows again.
// `batch` is how many this one call takes at a time (a worker's size, not a limit on the work: the next call takes more).
export async function runLookups(o: { store: ProviderStore; provider: PeopleProvider | null; batch: number; leaseSeconds: number; userId?: string | null; failAfter?: number }):
  Promise<{ claimed: number; done: number; refused: string | null; failed: number }> {
  await o.store.reclaim();
  const jobs = await o.store.claim(o.batch, o.leaseSeconds, o.userId ?? null);
  let done = 0, failed = 0, refused: string | null = null;
  await Promise.all(jobs.map(async (job) => {
    if (!o.provider || o.provider.name !== job.provider) {
      await o.store.fail(job, "not_wired", `${LABEL[job.provider]} is not connected`, 1, 0, 1); failed++; return;
    }
    const r = await o.provider.findPeople(job.query);
    if (r.status === "ok") { await o.store.complete(job, r.company, r.people, r.http_calls, r.credits); done++; if (r.note) refused ??= r.note; return; }
    if (r.status === "rate_limited") { refused ??= "rate_limited"; await o.store.fail(job, "rate_limited", r.detail, r.retry_after_s, r.http_calls, o.failAfter ?? 3); return; }
    if (r.status === "out_of_credits") { refused ??= "out_of_credits"; await o.store.fail(job, "out_of_credits", r.detail, 3600, r.http_calls, o.failAfter ?? 3); return; }
    if (r.status === "not_wired") { await o.store.fail(job, "not_wired", r.reason, 1, r.http_calls, 1); failed++; return; }
    const x = await o.store.fail(job, "error", r.detail, 30, r.http_calls, o.failAfter ?? 3); if (x.state === "failed") failed++;
  }));
  return { claimed: jobs.length, done, refused, failed };
}

// ------------------------------------------------------------------------------------------------ targets for the chat lane
export type TargetAsk =
  | { kind: "applied"; titles: string[]; seniority: string[] }
  | { kind: "role_at"; titles: string[]; seniority: string[]; company: string }
  | { kind: "alumni"; school: string; company: string };
const SENIORITY_WORDS: [RegExp, string][] = [[/\b(vp|vice president)s?\b/, "vp"], [/\bdirectors?\b/, "director"], [/\b(head)s? of\b/, "head"], [/\bmanagers?\b/, "manager"],
  [/\b(founder|co-?founder)s?\b/, "founder"], [/\b(cto|ceo|cfo|coo|chief)\b/, "c_suite"], [/\bsenior\b/, "senior"], [/\binterns?\b/, "intern"], [/\b(recruiter|recruiting|talent)\b/, ""]];
function rolesOf(phrase: string): { titles: string[]; seniority: string[] } {
  const p = phrase.toLowerCase().replace(/\b(people|folks|anyone|someone|everyone|the)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!p) return { titles: [], seniority: [] };
  const titles = p.split(/\s*(?:,|\bor\b|\band\b|\/)\s*/).map((t) => t.replace(/s\b$/, "").trim()).filter((t) => t.length >= 2 && t.length <= 80);
  const seniority = [...new Set(SENIORITY_WORDS.filter(([rx]) => rx.test(p)).map(([, s]) => s).filter(Boolean))];
  return { titles, seniority };
}
// "people at every company I applied to", "engineering managers at every company I've applied to", "engineering managers
// at Stripe", "find recruiters at Ramp", "alumni of DePaul at Stripe", "DePaul alumni at Stripe". Anything else: null.
export function parseTargetAsk(message: string): TargetAsk | null {
  const t = cleanCell(message, 400).replace(/[?.!]+$/, "").trim();
  const lead = String.raw`^(?:(?:please\s+)?(?:find|get|show|list|look\s+up|search\s+for|who\s+are)\s+(?:me\s+)?)?`;
  let m = new RegExp(`${lead}(.*?)\\s*(?:at|from|in)\\s+(?:every|all|each)\\s+(?:of\\s+)?(?:the\\s+)?compan(?:y|ies)\\s+(?:that\\s+)?i(?:'ve|\\s+have)?\\s+applied\\s+(?:to|for|at)$`, "i").exec(t);
  if (m) { const r = rolesOf(m[1]); return { kind: "applied", ...r }; }
  m = new RegExp(`${lead}(?:alumni|grads|graduates)\\s+(?:of|from)\\s+(.+?)\\s+(?:at|working\\s+at|who\\s+work\\s+at)\\s+(.+)$`, "i").exec(t)
    ?? new RegExp(`${lead}(.+?)\\s+(?:alumni|grads|graduates)\\s+(?:at|working\\s+at|who\\s+work\\s+at)\\s+(.+)$`, "i").exec(t);
  if (m) return { kind: "alumni", school: cleanCell(m[1], 120), company: cleanCell(m[2], 120) };
  m = new RegExp(`${lead}(.+?)\\s+(?:at|from)\\s+([\\p{L}\\p{N}][\\p{L}\\p{N} .,&'-]{0,80})$`, "iu").exec(t);
  if (m && !/\b(i|me|my|you|work|working|apply|applying|applied|jobs?|roles?\s+open|send|email|draft|write|message|intro(?:duction)?s?|contacts?|know)\b/i.test(m[1]) && m[1].split(/\s+/).length <= 8) {
    const r = rolesOf(m[1]);
    if (r.titles.length) return { kind: "role_at", ...r, company: cleanCell(m[2], 120) };
  }
  return null;
}

export interface Target { id: number; name: string; title: string; company: string; email: string | null; sendable: boolean; source: string; reason: string }
export interface TargetsResult {
  status: "ok" | "NOT_WIRED" | "waiting" | "refused" | "none" | "no_companies";
  reply: string; candidates: Target[]; companies: string[]; waiting: number;
}
export interface TargetDeps { store: ProviderStore; config: ProviderConfig; provider: PeopleProvider | null; now: () => number; workerBatch?: number }

const plainWords = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function titleMatch(title: string, ask: { titles: string[]; seniority: string[] }): string | null {
  if (!ask.titles.length && !ask.seniority.length) return "works there";
  const tl = ` ${plainWords(title)} `;
  for (const want of ask.titles) {
    const w = plainWords(want).split(" ").filter((x) => x.length > 1);
    if (w.length && w.every((x) => tl.includes(` ${x}`))) return `matches "${want}"`;
  }
  return null;
}
const fromLine = (c: Candidate) => c.source === "provider"
  ? `found by ${LABEL[c.provider as ProviderName] ?? "the data provider"}${c.fetched_at ? ` on ${c.fetched_at.slice(0, 10)}` : ""}${c.email ? (c.sendable ? `, email verified by ${LABEL[c.provider as ProviderName]}` : `, email not verified (${c.email_status}): not used for sending`) : ", no email address"}`
  : c.source === "linkedin_export" ? "from your LinkedIn export" : c.source === "gmail" ? "from your Gmail" : c.source === "company_page" ? `published on ${c.source_url}` : "from your contacts";
const reasonOf = (c: Candidate, why: string) => `${c.position ? `${c.position} at ${c.company}` : `at ${c.company}`}; ${why}; ${fromLine(c)}.`;

// findTargets(userId, ask): candidates with a reason line each (their title and why they match), for later drafting.
// The provider is asked once per company (shared cache, or one queued lookup for everyone asking); this person's own
// queued lookups run right here, concurrently; what the provider refused or hasn't answered yet is said, not hidden.
export async function findTargets(userId: string, ask: TargetAsk, d: TargetDeps): Promise<TargetsResult> {
  let companies: string[];
  if (ask.kind === "applied") companies = await d.store.appliedCompanies(userId);
  else companies = [ask.company];
  companies = [...new Map(companies.map((c) => [companyKey(c), cleanCell(c, 120)])).entries()].filter(([k]) => k).map(([, c]) => c);
  if (!companies.length) {
    return { status: "no_companies", reply: "You haven't applied anywhere I have on record yet, so there are no companies to look for people at. Tell me a company and the roles you want, like \"engineering managers at Stripe\".", candidates: [], companies: [], waiting: 0 };
  }
  const roles = ask.kind === "alumni" ? { titles: [], seniority: [] } : { titles: ask.titles, seniority: ask.seniority };
  const wired = !!(d.config.provider && d.config.apiKey && d.provider);
  const notes: string[] = [];
  if (ask.kind === "alumni") notes.push(`Neither people-data service I can use filters by school, so alumni come only from the schools on your own contacts.`);
  if (wired && ask.kind !== "alumni") {
    for (const c of companies) {
      const { key, norm } = await queryKey({ company: c, titles: roles.titles, seniority: roles.seniority });
      await d.store.request(userId, d.config.provider!, key, norm, d.config.cacheSeconds);
    }
    // This person's own queued lookups, now, many at once; other people's are the scheduled drain's.
    for (;;) {
      const r = await runLookups({ store: d.store, provider: d.provider, batch: d.workerBatch ?? 25, leaseSeconds: d.config.leaseSeconds, userId });
      if (!r.claimed || r.refused) break;
    }
  } else if (!wired && ask.kind !== "alumni") notes.push(notWiredReply(d.config));
  // Read every match, page by page (indexed keyset reads, bounded per call).
  const keys = companies.map((c) => companyKey(c));
  const out: Target[] = [];
  const seen = new Set<number>();
  for (let after = 0; ;) {
    const page = await d.store.candidates(userId, keys, after, 1000);
    if (!page.length) break;
    after = page[page.length - 1].id;
    for (const c of page) {
      if (seen.has(c.id)) continue;
      let why: string | null;
      if (ask.kind === "alumni") {
        const a = plainWords(c.school), b = plainWords(ask.school);
        why = a && b && (a.includes(b) || b.includes(a)) ? `went to ${c.school}` : null;
      } else why = titleMatch(c.position, roles);
      if (!why) continue;
      // A provider row linked to the person's own contact: one person, the own row named, the found address added.
      if (c.same_as) seen.add(c.same_as);
      seen.add(c.id);
      out.push({ id: c.id, name: c.name ?? c.email ?? "", title: c.position, company: c.company, email: c.email, sendable: c.sendable, source: c.source, reason: reasonOf(c, why) });
    }
  }
  let waiting = 0;
  if (wired) {
    const s = await d.store.status(userId, d.config.provider!);
    waiting = s.waiting;
    const label = LABEL[d.config.provider!];
    if (s.blocked_reason === "out_of_credits") notes.push(`${label} says the account is out of lookup credits, so ${s.waiting ? `${s.waiting} ${s.waiting === 1 ? "lookup is" : "lookups are"} waiting` : "new lookups wait"} until the owner adds credits; I'll finish them then.`);
    else if (s.blocked_reason === "rate_limited") notes.push(`${label} asked me to slow down, so ${s.waiting} ${s.waiting === 1 ? "lookup is" : "lookups are"} waiting; they run again after ${new Date(s.blocked_until!).toISOString().slice(11, 16)} UTC.`);
    else if (s.waiting) notes.push(`${s.waiting} ${s.waiting === 1 ? "lookup is" : "lookups are"} still running; ask again shortly for the rest.`);
    if (s.failed.length) notes.push(`${s.failed.length} ${s.failed.length === 1 ? "lookup" : "lookups"} couldn't be done by ${label}.`);
  }
  const sendable = out.filter((x) => x.sendable).length;
  const head = out.length
    ? `${out.length} ${out.length === 1 ? "person" : "people"} at ${companies.length === 1 ? companies[0] : `${companies.length} companies`}, ${sendable} with an address verified for sending.`
    : `No one matching at ${companies.length === 1 ? companies[0] : `${companies.length} companies`} yet.`;
  const status: TargetsResult["status"] = !wired && ask.kind !== "alumni" ? "NOT_WIRED" : notes.some((n) => /out of lookup credits|slow down/.test(n)) ? "refused" : waiting ? "waiting" : out.length ? "ok" : "none";
  return { status, reply: [head, ...notes].join(" "), candidates: out, companies, waiting };
}
