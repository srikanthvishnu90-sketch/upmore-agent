// trainee-agent-api (WO-097): other agents act for the person, with the token the person minted in Trainee
// (trainee_agent_grant_mint_own) and only within the scopes they chose. verify_jwt = false (supabase/config.toml): an
// agent token is not a Supabase JWT; the handler hashes it and every database door checks it. The service client only
// calls the trainee_agent_* doors, which take the token's hash, never a user id. Logic and tests:
// ../_shared/trainee_agent_api.ts, tests/edge/trainee-agent-api.test.ts, tests/db/trainee_agent_api.test.sql.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { handleAgentApi, linkKeyFrom, RESUME_BUCKET } from "../_shared/trainee_agent_api.ts";

serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const linkKey = await linkKeyFrom(Deno.env);
  if (!url || !key || !linkKey) {
    return new Response(JSON.stringify({ ok: false, error: "not_wired", message: "The agent API is not set up on this project." }), {
      status: 503, headers: { "content-type": "application/json" },
    });
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  return handleAgentApi(req, {
    store: {
      async rpc(fn, args) {
        const { data, error } = await admin.rpc(fn, args);
        if (error) throw new Error(`${fn}: ${error.code ?? "error"}`);
        return data;
      },
    },
    async signStorage(path, seconds) {
      const r = await admin.storage.from(RESUME_BUCKET).createSignedUrl(path, seconds);
      if (r.error || !r.data?.signedUrl) throw new Error("sign resume link failed");
      return r.data.signedUrl;
    },
    linkKey,
    baseUrl: `${url.replace(/\/+$/, "")}/functions/v1/trainee-agent-api`,
  });
});
