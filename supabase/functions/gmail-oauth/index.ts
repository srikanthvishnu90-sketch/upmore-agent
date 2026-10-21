// Upmore gmail-oauth edge function (2026-09-28; career grant added 2026-10-12, ACCS-001/002).
// Connects the user's Gmail so the execution agent can fetch merchant sign-in
// codes itself instead of asking the user to retype them, and (career grant)
// so the career agent can send outreach from the user's OWN Gmail and read /
// create Google Calendar entries. Reuses the founder's existing Google OAuth
// client (same one Ring uses).
//
// Routes:
//   POST {action:"start"}        (JWT) -> {url}  legacy consent, gmail.readonly
//       ONLY (minimal), stored as provider "gmail" / oauth_gmail_<uid>.
//   POST {action:"start_career"} (JWT) -> {url}  career consent: gmail.readonly
//       + gmail.send + calendar.freebusy + calendar.events, stored separately
//       as provider "google_career" / oauth_google_career_<uid>. The signed
//       state's purpose routes the callback; the two grants never overwrite
//       each other. The user's own Gmail via this grant is THE send rail.
//   GET ?code=..&state=..                Google callback -> exchange, store
//       tokens in Supabase Vault under the purpose's name, upsert that
//       purpose's connection row, redirect to the app. Tokens NEVER touch
//       the client.
//   GET ?t=<token>                       WO-101: a Trainee connect link. Consumes the single-use token once
//       (connect_link_consume) and redirects to the career consent for the token's user; a bad, expired or used
//       token ends on Trainee's own page (./link.ts). A career consent's callback ends on Trainee's own page too;
//       the legacy gmail grant still lands on the app.
//   POST {action:"status"}       (JWT) -> legacy {connected, email} plus
//       per-source detail (gmail scope set, calendar connected, granted
//       scope list, connected email) — see career.ts buildStatus.
//   POST {action:"disconnect"}   (JWT) -> legacy behaviour (gmail row only).
//   POST {action:"disconnect", source}   per source: "gmail" | "calendar" |
//       "google_career"/"career" | "all" — see career.ts disconnectPlan for
//       the atomic-grant notes returned to the caller.
//
// Pure helpers (scopes, state, status, disconnect plans) live in ./career.ts
// so they are unit-tested without starting the server (tests/edge/gmail-oauth-career.test.ts).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";
import {
  buildStatus,
  disconnectPlan,
  GMAIL_SCOPE,
  providerForPurpose,
  purposeForAction,
  scopesForPurpose,
  vaultNameFor,
  verifyState,
} from "./career.ts";
import { consentUrl, page, startFromLink } from "./link.ts";

const APP_URL = "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app";
const ALLOWED_ORIGINS = new Set([
  APP_URL,
  "http://localhost:3000",
  "http://localhost:8000",
  "http://localhost:8080",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8080",
]);

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
    const stateSecret = Deno.env.get("OAUTH_STATE_SECRET") || "";

    // ---- Google callback (GET, no JWT — trust comes from signed state) ----
    const url = new URL(req.url);
    // ---- WO-101: a Trainee connect link (GET ?t=<token>, no JWT — trust comes from the single-use token) ----
    if (req.method === "GET" && url.searchParams.has("t") && !url.searchParams.has("code") && !url.searchParams.has("error")) {
      const admin = createClient(supabaseUrl, serviceKey);
      return await startFromLink(url.searchParams.get("t") || "", {
        consume: async (t, purpose) => {
          const { data, error } = await admin.rpc("connect_link_consume", { p_nonce: t, p_purpose: purpose, p_now: new Date().toISOString() });
          if (error) throw new Error("connect link unreadable");
          return data ?? {};
        },
        clientId, stateSecret, redirectUri: redirectUri(),
      });
    }
    if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      // Legacy landings keep ?gmail=.. on the app. A career grant (started only from a Trainee link) ends on Trainee's
      // own page, never on the finance app.
      let purpose: "gmail" | "career" = "gmail";
      const done = (ok: boolean) =>
        purpose === "career"
          ? page(ok ? "connected" : "error")
          : Response.redirect(`${APP_URL}/#you?gmail=${ok ? "connected" : "error"}`, 302);
      try {
        if (url.searchParams.get("error")) {
          // Declined on Google's page: the signed state, when it verifies, says which grant was asked for.
          const v = await verifyState(url.searchParams.get("state") || "", stateSecret).catch(() => null);
          return v?.purpose === "career" ? page("declined") : done(false);
        }
        const code = url.searchParams.get("code") || "";
        const state = url.searchParams.get("state") || "";
        const verified = await verifyState(state, stateSecret);
        purpose = verified.purpose;
        const userId = verified.userId;
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
        // Confirm which Google address granted access (also validates the token).
        const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        });
        const me = await meRes.json().catch(() => ({}));
        const email = typeof me.email === "string" ? me.email : null;

        const provider = providerForPurpose(purpose);
        const vaultName = vaultNameFor(userId, purpose);
        // Scopes actually granted (Google echoes them on the token response) win over scopes requested.
        const grantedScopes = typeof tok.scope === "string" && tok.scope.trim()
          ? tok.scope.split(/\s+/).filter(Boolean).join(" ")
          : scopesForPurpose(purpose).join(" ");
        const admin = createClient(supabaseUrl, serviceKey);
        const secret = JSON.stringify({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token || null,
          expires_at: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
          email, scopes: grantedScopes,
        });
        const { error: verr } = await admin.rpc("oauth_vault_store", { p_name: vaultName, p_secret: secret });
        if (verr) throw new Error("could not save tokens");
        const { error: uerr } = await admin.from("user_oauth_connections").upsert({
          user_id: userId, provider, vault_name: vaultName,
          email, scopes: grantedScopes, connected_at: new Date().toISOString(),
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

    const startPurpose = purposeForAction(action);
    if (startPurpose) {
      if (!clientId) return json({ error: startPurpose === "career" ? "Google connect is not configured yet" : "Gmail connect is not configured yet" }, 503);
      return json({ url: await consentUrl({ userId: user.id, purpose: startPurpose, clientId, stateSecret, redirectUri: redirectUri() }) });
    }

    if (action === "status") {
      const { data } = await admin.from("user_oauth_connections")
        .select("provider, email, scopes, connected_at").eq("user_id", user.id)
        .in("provider", ["gmail", "google_career"]);
      return json(buildStatus(data || []));
    }

    if (action === "disconnect") {
      const plan = disconnectPlan(user.id, typeof body.source === "string" ? body.source : undefined);
      for (const name of plan.vault_names) await admin.rpc("oauth_vault_delete", { p_name: name });
      // Row deletes also fire the vault-cleanup trigger (20261012060000); the explicit delete above keeps the
      // pre-career behaviour on projects where that migration has not landed yet.
      await admin.from("user_oauth_connections").delete().eq("user_id", user.id).in("provider", plan.providers);
      return json({
        ok: true, disconnected: true, source: plan.source,
        removed_providers: plan.providers, also_affects: plan.also_affects, note: plan.note,
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

// Re-exported for tests / future callers; GMAIL_SCOPE keeps its pre-career meaning (the legacy grant).
export { GMAIL_SCOPE };
