// Upmore simplefin-claim Edge Function.
// One-time claim: user pastes their SimpleFIN Setup Token, we claim it once
// against the Bridge, store the permanent Access URL in the Supabase Vault
// under a user-scoped name, and record the connection.
//
// Security:
// - verify_jwt=true at deploy; we additionally verify the JWT via Auth here.
// - Claim URL host is allowlisted to bridge.simplefin.org / beta-bridge.simplefin.org.
// - The Setup Token is claimed exactly ONCE. If the user already has a
//   connection row, we refuse before touching the Bridge.
// - The raw Access URL is never logged and never returned to the client.
// - CORS restricted to Upmore origins (no wildcard).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ORIGINS = [
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:8901",
  "http://127.0.0.1:8901",
];
const ALLOWED_HOSTS = new Set(["bridge.simplefin.org", "beta-bridge.simplefin.org"]);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
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

    // 1. Authenticate.
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Invalid session" }, 401);
    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Refuse if the user already connected (never claim twice).
    const { data: existing } = await admin.from("simplefin_connections")
      .select("user_id").eq("user_id", user.id).maybeSingle();
    if (existing) {
      return json({ error: "Bank already connected on this account. Disconnect first to reconnect." }, 409);
    }

    // 3. Parse + validate the setup token.
    const { setup_token } = await req.json().catch(() => ({}));
    if (!setup_token || typeof setup_token !== "string" || setup_token.length < 16) {
      return json({ error: "Paste the Setup Token from your SimpleFIN Bridge dashboard." }, 400);
    }
    let claimUrl: string;
    try {
      claimUrl = atob(setup_token.trim());
    } catch {
      return json({ error: "That doesn't look like a valid Setup Token (not base64)." }, 400);
    }
    let claimHost: string;
    try {
      const u = new URL(claimUrl);
      if (u.protocol !== "https:") throw new Error("bad protocol");
      claimHost = u.hostname;
    } catch {
      return json({ error: "That Setup Token doesn't decode to a valid claim URL." }, 400);
    }
    if (!ALLOWED_HOSTS.has(claimHost)) {
      return json({ error: "Setup Token points to an unknown SimpleFIN host. Tokens must come from bridge.simplefin.org." }, 400);
    }

    // 4. Claim ONCE with an empty body. The token dies after this call.
    let accessUrl: string;
    try {
      const claimRes = await fetch(claimUrl, { method: "POST", body: "" });
      if (!claimRes.ok) {
        const hint = claimRes.status === 403 || claimRes.status === 404
          ? "This Setup Token was already used or is invalid. Generate a fresh one in your SimpleFIN Bridge dashboard."
          : `SimpleFIN Bridge returned HTTP ${claimRes.status}. Try a fresh Setup Token.`;
        return json({ error: hint }, 502);
      }
      accessUrl = (await claimRes.text()).trim();
    } catch (e) {
      return json({ error: "Could not reach the SimpleFIN Bridge. Check your connection and try again." }, 502);
    }
    if (!accessUrl.startsWith("https://")) {
      return json({ error: "The Bridge returned an unexpected response. Generate a fresh Setup Token and try again." }, 502);
    }

    // 5. Sanity-check the Access URL by fetching accounts (proves the claim worked).
    let accountCount = 0;
    let institutionLabel = "SimpleFIN Bridge";
    try {
      const u = new URL(accessUrl);
      const auth = btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`);
      const probe = await fetch(`${u.protocol}//${u.host}${u.pathname}?version=2`, {
        headers: { "Authorization": `Basic ${auth}` },
      });
      if (probe.ok) {
        const pj = await probe.json();
        accountCount = (pj.accounts || []).length;
      }
    } catch { /* non-fatal: store anyway, proxy will surface bridge errors */ }

    // 6. Store in Vault under a user-scoped name. Never log or return the URL.
    const vaultName = `simplefin_access_url_${user.id}`;
    const { error: verr } = await admin.rpc("simplefin_vault_store", {
      p_name: vaultName,
      p_secret: accessUrl,
    });
    if (verr) return json({ error: "Connected, but we couldn't save it securely. Try disconnecting and reconnecting." }, 500);

    // 7. Record the connection (owner scoping for the proxy).
    const { error: cerr } = await admin.from("simplefin_connections").upsert({
      user_id: user.id,
      institution_label: institutionLabel,
      connected_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (cerr) {
      // Roll back the vault secret so we don't orphan a credential.
      await admin.rpc("simplefin_vault_delete", { p_name: vaultName }).catch(() => {});
      return json({ error: "Could not record the connection. Please try again." }, 500);
    }

    return json({ ok: true, accounts: accountCount });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
