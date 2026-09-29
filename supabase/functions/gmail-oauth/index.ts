// Upmore gmail-oauth edge function (2026-09-28).
// Connects the user's Gmail (read-only) so the execution agent can fetch
// merchant sign-in codes itself instead of asking the user to retype them.
// Reuses the founder's existing Google OAuth client (same one Ring uses).
//
// Routes:
//   POST {action:"start"}      (JWT) -> {url}  Google consent URL; state is
//       HMAC-signed, bound to the user, 10-min expiry. Google's auth code is
//       single-use, which defeats replay.
//   GET ?code=..&state=..              Google callback -> exchange, store
//       tokens in Supabase Vault (oauth_gmail_<uid>), upsert the connection
//       row, redirect to the app. Tokens NEVER touch the client.
//   POST {action:"status"}     (JWT) -> {connected, email}
//   POST {action:"disconnect"} (JWT) -> deletes vault secret + row.
//
// Scope requested: gmail.readonly ONLY (minimal). Search is further
// restricted server-side to the merchant's otp_senders while a run is
// actively awaiting a code (see agent-exec fetch_otp).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";

const APP_URL = "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app";
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  "http://localhost:3000",
  "http://localhost:8000",
  "http://localhost:8080",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8080",
]);
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function redirectUri(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/gmail-oauth`;
}

// ---- HMAC state (CSRF + user binding) ----
async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET") || "";
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b + "=".repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0));
}
async function issueState(userId: string): Promise<string> {
  const exp = Date.now() + 10 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}
async function verifyState(state: string): Promise<string> {
  const parts = state.split(".");
  if (parts.length !== 3) throw new Error("bad state");
  const [userId, expS, sigB64] = parts;
  const exp = Number(expS);
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) throw new Error("expired state");
  const payload = `${userId}.${exp}`;
  const ok = await crypto.subtle.verify(
    "HMAC", await hmacKey(), unb64url(sigB64), new TextEncoder().encode(payload),
  );
  if (!ok) throw new Error("bad state signature");
  return userId;
}

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";

    // ---- Google callback (GET, no JWT — trust comes from signed state) ----
    const url = new URL(req.url);
    if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      const done = (ok: boolean) => Response.redirect(`${APP_URL}/#you?gmail=${ok ? "connected" : "error"}`, 302);
      try {
        if (url.searchParams.get("error")) return done(false);
        const code = url.searchParams.get("code") || "";
        const state = url.searchParams.get("state") || "";
        const userId = await verifyState(state);
        if (!clientId || !clientSecret) throw new Error("OAuth not configured");
        const tokRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code, client_id: clientId, client_secret: clientSecret,
            redirect_uri: redirectUri(), grant_type: "authorization_code",
          }),
        });
        const tok = await tokRes.json().catch(() => ({}));
        if (!tokRes.ok || !tok.access_token) {
          throw new Error(String(tok.error_description || tok.error || "token exchange failed"));
        }
        // Confirm which Gmail address granted access (also validates the token).
        const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        const me = await meRes.json().catch(() => ({}));
        const email = typeof me.email === "string" ? me.email : null;

        const admin = createClient(supabaseUrl, serviceKey);
        const vaultName = `oauth_gmail_${userId}`;
        const secret = JSON.stringify({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token || null,
          expires_at: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
          email, scopes: GMAIL_SCOPE,
        });
        const { error: verr } = await admin.rpc("oauth_vault_store", { p_name: vaultName, p_secret: secret });
        if (verr) throw new Error("could not save tokens");
        const { error: uerr } = await admin.from("user_oauth_connections").upsert({
          user_id: userId, provider: "gmail", vault_name: vaultName,
          email, scopes: GMAIL_SCOPE, connected_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider" });
        if (uerr) throw new Error("could not record connection");
        return done(true);
      } catch (e) {
        console.error("[gmail-oauth] callback failed:", String((e as Error)?.message || e));
        return done(false);
      }
    }

    // ---- Authed JSON actions ----
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Invalid session" }, 401);
    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "start") {
      if (!clientId) return json({ error: "Gmail connect is not configured yet" }, 503);
      const state = await issueState(user.id);
      const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri(),
        response_type: "code",
        scope: GMAIL_SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return json({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + q.toString() });
    }

    if (action === "status") {
      const { data } = await admin.from("user_oauth_connections")
        .select("email, connected_at").eq("user_id", user.id).eq("provider", "gmail").maybeSingle();
      return json({ connected: !!data, email: data?.email ?? null });
    }

    if (action === "disconnect") {
      await admin.rpc("oauth_vault_delete", { p_name: `oauth_gmail_${user.id}` });
      await admin.from("user_oauth_connections").delete().eq("user_id", user.id).eq("provider", "gmail");
      return json({ ok: true, disconnected: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
