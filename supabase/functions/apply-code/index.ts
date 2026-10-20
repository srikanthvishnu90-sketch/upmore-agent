// apply-code (WO-084, D-029): the extension asks for the code an application site emailed the signed-in person. Their own
// session only (verify_jwt = true in supabase/config.toml; Supabase Auth reads the person from it, the career-essay-draft
// pattern); their own career Gmail grant (gmail.readonly, careerToken). The code goes back to their extension only, with
// cache-control: no-store, and is never stored or logged. Logic and tests: ../_shared/apply_code.ts,
// tests/architect/wo-084-emailed-codes.test.ts.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { corsFor } from "../agent-chat/_shared/chat_cors.ts";
import { careerToken, type TokenDeps } from "../_shared/career_mail_gmail.ts";
import { handleApplyCode, NOT_YET } from "../_shared/apply_code.ts";

serve((req) => {
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cors = corsFor(req);
  if (!url || !anon || !key) {
    return new Response(JSON.stringify({ ok: false, why: "not_yet", message: NOT_YET }), { status: 503, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  // The career Google grant (vault oauth_google_career_<uid>), read as career-proactive reads it.
  const grant: TokenDeps = {
    env: Deno.env, fetch, now: Date.now,
    connection: async (u) => {
      const { data, error } = await admin.from("user_oauth_connections").select("vault_name,scopes").eq("user_id", u).eq("provider", "google_career").maybeSingle();
      if (error) throw new Error("read the career grant");
      return data ?? null;
    },
    readVault: async (name) => {
      const { data, error } = await admin.rpc("oauth_vault_read", { p_name: name });
      if (error) throw new Error("read the career grant's vault entry");
      return data ? String(data) : null;
    },
    writeVault: async (name, secret) => {
      const { error } = await admin.rpc("oauth_vault_store", { p_name: name, p_secret: secret });
      if (error) throw new Error("save the refreshed career grant");
    },
  };
  return handleApplyCode(req, {
    cors,
    user: async (token) => {
      const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
      const { data } = await client.auth.getUser(token);
      return data?.user ? { id: data.user.id } : null;
    },
    code: { token: careerToken(grant), fetch, now: Date.now },
  });
});
