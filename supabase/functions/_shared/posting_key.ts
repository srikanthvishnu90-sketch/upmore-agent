// Which application form a link is, and the one key of its posting (WO-031's, moved here by WO-066 so the chat side
// keys a posting exactly as the extension does: imported, never copied).
export type Family = "greenhouse" | "lever" | "ashby" | "workday";
export interface Portal { family: Family; embedded: boolean }

// The application forms the extension recognizes, by host. Greenhouse also embeds its form in an employer's own page as an
// iframe from boards.greenhouse.io/embed/job_app; the content script runs in that frame. Workday is recognized only to say
// what it cannot do (D-013: the person signs in on the employer's site themselves).
const GREENHOUSE = /^(job-boards|boards)(\.eu)?\.greenhouse\.io$/;
const LEVER = /^jobs(\.eu)?\.lever\.co$/;
const ASHBY = /^jobs\.ashbyhq\.com$/;
const WORKDAY = /(^|\.)(myworkdayjobs\.com|myworkdaysite\.com|myworkday\.com)$/;
export function detectPortal(href: string): Portal | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (GREENHOUSE.test(h)) return { family: "greenhouse", embedded: /^\/embed\//.test(u.pathname) };
  if (LEVER.test(h)) return { family: "lever", embedded: false };
  if (ASHBY.test(h)) return { family: "ashby", embedded: false };
  if (WORKDAY.test(h)) return { family: "workday", embedded: false };
  return null;
}

// One posting, one key, the engine's shape (scripts/apply.ts posting()): family:tenant:id. Null when the link is not a
// posting (a board's list page, a search).
export function postingKey(href: string): string | null {
  const p = detectPortal(href);
  if (!p) return null;
  const u = new URL(href), seg = u.pathname.split("/").filter(Boolean);
  if (p.family === "greenhouse") {
    const tenant = u.searchParams.get("for") || seg[0] || "", id = u.pathname.match(/\/jobs\/(\d+)/)?.[1] || u.searchParams.get("token");
    return tenant && id && /^\d+$/.test(id) ? `greenhouse:${tenant}:${id}` : null;
  }
  if (p.family === "lever" || p.family === "ashby") {
    return seg[0] && seg[1] && /^[0-9a-f-]{8,}$/i.test(seg[1]) ? `${p.family}:${seg[0]}:${seg[1].toLowerCase()}` : null;
  }
  // WO-048: every step of one application is one posting. The posting is the segment before "apply" (a step's own path
  // under it, such as ".../apply/applyManually" or a step page, is not another posting).
  const at = seg.findIndex((s) => /^apply$/i.test(s));
  const last = at > 0 ? seg[at - 1] : seg.filter((s) => !/^(apply|applyManually|autofillWithResume)$/i.test(s)).at(-1);
  return last ? `workday:${u.hostname.toLowerCase()}:${last}` : null;
}

// The page that holds the form: a Lever or Ashby posting link opens its description; the form is one step on.
export function applyUrl(href: string): string {
  const p = detectPortal(href);
  if (!p) return href;
  const u = new URL(href), seg = u.pathname.split("/").filter(Boolean);
  if (p.family === "lever" && seg.length === 2) u.pathname = `/${seg[0]}/${seg[1]}/apply`;
  if (p.family === "ashby" && seg.length === 2) u.pathname = `/${seg[0]}/${seg[1]}/application`;
  return u.href;
}
export const tenantOf = (key: string) => key.split(":")[1] || "";
