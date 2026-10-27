// Which web pages may read these functions' responses in a browser. Origins are the ones observed on the Vercel
// projects (2026-10-26, read from the projects' domains and deployments), plus explicit local development origins.
//
// Trainee (Vercel project "trainee", team srikanthvishnu90-sketchs-projects): its production alias, its project and
// production-branch aliases, the trunk branch alias, and each preview deployment's own URL, which is
// trainee-<9 lowercase letters or digits>-srikanthvishnu90-sketchs-projects.vercel.app (every one of the project's
// deployments listed that day has that shape). No other *.vercel.app name matches: the team's suffix is required whole.
//
// Upmore (Vercel project "upmore") serves the finance app. The career chat and the career functions do not answer it any
// more (no Upmore surface reaches Trainee users); the finance functions that still serve that app (broker-oauth-start,
// manual-connect, and the shelved finance chat handler) use FINANCE_ORIGINS.
const LOCAL = ["http://localhost:3000", "http://localhost:8000", "http://localhost:8080", "http://127.0.0.1:8000", "http://127.0.0.1:8080"];
const TEAM = "srikanthvishnu90-sketchs-projects";
export const TRAINEE_ORIGINS = new Set([
  "https://trainee-six.vercel.app",
  `https://trainee-${TEAM}.vercel.app`,
  `https://trainee-git-main-${TEAM}.vercel.app`,
  `https://trainee-git-trunk-${TEAM}.vercel.app`,
]);
const TRAINEE_PREVIEW = new RegExp(`^https://trainee-[a-z0-9]{9}-${TEAM}\\.vercel\\.app$`);
export const CHAT_ORIGINS = new Set([...TRAINEE_ORIGINS, ...LOCAL]);
export const FINANCE_ORIGINS = new Set([
  "https://upmore-topaz.vercel.app",
  `https://upmore-${TEAM}.vercel.app`,
  ...LOCAL,
]);

export function chatOriginAllowed(origin: string): boolean {
  return CHAT_ORIGINS.has(origin) || TRAINEE_PREVIEW.test(origin);
}

function headersFor(allowed: boolean, origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

// The career chat and the career functions: Trainee's pages only.
export function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return headersFor(chatOriginAllowed(origin), origin);
}

// The finance functions the Upmore app still calls.
export function financeCorsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return headersFor(FINANCE_ORIGINS.has(origin), origin);
}
