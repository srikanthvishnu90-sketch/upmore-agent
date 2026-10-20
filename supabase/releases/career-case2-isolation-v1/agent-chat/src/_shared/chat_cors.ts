// Only observed deployment aliases and explicit local development origins.
export const CHAT_ORIGINS = new Set([
  "https://upmore-topaz.vercel.app",
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:3000", "http://localhost:8000", "http://localhost:8080",
  "http://127.0.0.1:8000", "http://127.0.0.1:8080",
]);
export function corsFor(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const origin = req.headers.get("Origin") ?? "";
  if (CHAT_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
