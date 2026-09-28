// Upmore exec-vault-store edge function.
// Stores a merchant login in Supabase Vault (server-side only).
// POST /functions/v1/exec-vault-store  { merchant_key, username, password, label? }
// Auth: Supabase JWT. The client never sees the secret after storing.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm";

const ALLOWED_ORIGINS = new Set([
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:3000",
  "http://localhost:8000",
  "http://localhost:8080",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8080",
]);
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

// Merchants the agent has a playbook for. Never accept arbitrary keys.
const MERCHANT_ALLOWLIST = new Set(["devin"]);

serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: "Invalid session" }, 401);
    const admin = createClient(supabaseUrl, serviceKey);

    const { merchant_key, username, password, label } = await req.json().catch(() => ({}));
    if (!merchant_key || !MERCHANT_ALLOWLIST.has(merchant_key)) {
      return json({ error: "Unsupported merchant" }, 400);
    }
    if (!username || !password || String(password).length < 1) {
      return json({ error: "Username and password required" }, 400);
    }

    const vaultName = `exec_cred_${user.id}_${merchant_key}`;
    const secret = JSON.stringify({ username: String(username), password: String(password) });

    const { error: verr } = await admin.rpc("exec_vault_store", {
      p_name: vaultName,
      p_secret: secret,
    });
    if (verr) return json({ error: "Could not save login" }, 500);

    await admin.from("exec_credential_refs").upsert({
      user_id: user.id,
      merchant_key,
      vault_name: vaultName,
      label: label || merchant_key,
    }, { onConflict: "user_id,merchant_key" });

    // Never return the secret.
    return json({ ok: true, merchant_key, saved: true });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
