// /file -> the trainee-file edge function, served as a real HTML page. Supabase answers an edge function's HTML as
// text/plain on its own domain, so this thin proxy (no logic, no secrets beyond the function's public URL) returns the same
// body as HTML with the page's security headers. The signed token in the link is the only credential.
const UPSTREAM = process.env.TRAINEE_FILE_UPSTREAM; // e.g. https://<project>.supabase.co/functions/v1/trainee-file
const KEEP = ["cache-control", "referrer-policy", "x-robots-tag", "x-content-type-options", "content-security-policy"];
const PASS_REQ = ["cookie", "user-agent"];

async function pass(request) {
  if (!UPSTREAM || !/^https:\/\//.test(UPSTREAM)) return new Response("File pages are not set up yet.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const src = new URL(request.url), up = new URL(UPSTREAM);
  up.search = src.search;
  const headers = { "content-type": request.headers.get("content-type") || "application/x-www-form-urlencoded" };
  for (const k of PASS_REQ) { const v = request.headers.get(k); if (v) headers[k] = v; }
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method === "POST") init.body = await request.text();
  const r = await fetch(up, init);
  const body = await r.text();
  const wantsText = src.searchParams.get("format") === "text";
  const h = new Headers({ "content-type": wantsText ? "text/plain; charset=utf-8" : "text/html; charset=utf-8" });
  for (const k of KEEP) { const v = r.headers.get(k); if (v) h.set(k, v); }
  const sc = r.headers.get("set-cookie"); if (sc) h.append("set-cookie", sc);
  if (r.status >= 300 && r.status < 400 && r.headers.get("location")) h.set("location", "/file"); // the clean URL on this site, never the upstream path
  return new Response(r.status >= 300 && r.status < 400 ? null : body, { status: r.status, headers: h });
}
export const GET = pass;
export const POST = pass;
