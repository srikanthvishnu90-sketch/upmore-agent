// The agent speaks first: an hourly run (pg_cron -> pg_net POST with PROACTIVE_SECRET) that delivers alerts, the weekly
// recap, the monthly close, the morning brief and the person's standing reports into their "Updates from Upmore" chat
// thread. Deploy with --no-verify-jwt (the secret header is the authentication). Logic and tests: _shared/proactive.ts,
// tests/edge/proactive.test.ts.
// The same run checks guided manual connect sessions that are due (every 6 hours each) and tells the person once when
// they are signed out or the page changed (_shared/manual_connect.ts runManualHealth, tests/edge/manual-connect.test.ts);
// without Browserbase keys it checks nothing and says not_wired in the counts.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { handleProactive, supabaseProactiveStore } from "../_shared/proactive.ts";
import { manualDb, runManualHealth } from "../_shared/manual_connect.ts";
import { browserbaseBrowser } from "../_shared/manual_browser.ts";

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const manualHealth = (now: number) => {
  const a = admin(), store = supabaseProactiveStore(a);
  return runManualHealth({
    db: manualDb(a), browser: browserbaseBrowser(Deno.env), now: () => now, limit: 20, deadline: Date.now() + 60000,
    deliver: async (userId, msg) => (await store.deliver(userId, [msg as any], [])).length > 0,
  });
};

serve((req) => handleProactive(req, { env: Deno.env, store: supabaseProactiveStore(admin()), extra: manualHealth }));
