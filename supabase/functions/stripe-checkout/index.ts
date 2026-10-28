// Upmore stripe-checkout Edge Function.
// Creates a Stripe Checkout session for the $10/mo subscription.
//
// Flow:
// - Auth required (verify_jwt=true at deploy)
// - Gets or creates a Stripe Customer for the user
// - Checks for unapplied referral credits (tolerating absent referral tables); notes them for post-checkout application
// - Creates a Checkout session for the $10/mo recurring price
// - Returns { url } for redirect
//
// Referral credits are applied to the Stripe Customer Balance by stripe-webhook
// after checkout completes (or by stripe-credits if called directly).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { billingCfgFromEnv, startCheckout, supabaseBillingStore, tolerantReferrals } from "../_shared/trainee_billing.ts";

const ALLOWED_ORIGINS = [
  "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app",
  "http://localhost:8901",
  "http://127.0.0.1:8901",
];

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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = billingCfgFromEnv(Deno.env).priceId;

    if (!stripeKey) return json({ error: "Stripe not configured" }, 503);
    if (!priceId) return json({ error: "Subscription price not configured" }, 503);

    // 1. Authenticate.
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const cfg = billingCfgFromEnv(Deno.env);

    // 2. Checkout for Trainee's own price (customer get-or-create, tagging and the already-subscribed check live in the core).
    const r = await startCheckout({ stripe, store: supabaseBillingStore(admin), cfg }, { userId: user.id, email: user.email });
    if (!r.ok) return json({ error: r.reason === "already_subscribed" ? "Already subscribed" : "Checkout unavailable" }, r.reason === "already_subscribed" ? 409 : 503);

    // 3. Unapplied referral credits, for display only. The referral tables may be absent: then there are none.
    let creditTotal = 0;
    try { creditTotal = (await tolerantReferrals(admin).unappliedCredits(user.id)).reduce((s, c) => s + c.amount, 0); } catch (e) { console.error("stripe-checkout: credits unreadable:", (e as Error).message); }

    return json({
      url: r.url,
      credits_available: creditTotal,
      credits_note: creditTotal >= 10
        ? `$${creditTotal} in referral credit will apply to your Stripe balance after checkout.`
        : null,
    });
  } catch (e) {
    console.error("stripe-checkout error:", e);
    return json({ error: "Checkout failed: " + (e as Error).message }, 500);
  }
});
