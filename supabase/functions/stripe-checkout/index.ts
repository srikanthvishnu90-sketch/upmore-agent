// Upmore stripe-checkout Edge Function.
// Creates a Stripe Checkout session for the $10/mo subscription.
//
// Flow:
// - Auth required (verify_jwt=true at deploy)
// - Gets or creates a Stripe Customer for the user
// - Checks for unapplied referral credits; notes them for post-checkout application
// - Creates a Checkout session for the $10/mo recurring price
// - Returns { url } for redirect
//
// Referral credits are applied to the Stripe Customer Balance by stripe-webhook
// after checkout completes (or by stripe-credits if called directly).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

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
    const priceId = Deno.env.get("STRIPE_PRICE_ID");

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

    // 2. Get or create Stripe customer.
    let customerId: string | null = null;
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();
    if (sub?.stripe_customer_id) {
      customerId = sub.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from("user_subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        status: "incomplete",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    // 3. Check for unapplied referral credits (for display).
    const { data: credits } = await admin
      .from("referral_credits")
      .select("amount")
      .eq("user_id", user.id)
      .eq("applied", false);
    const creditTotal = (credits || []).reduce((s, c) => s + Number(c.amount), 0);

    // 4. Create checkout session.
    const siteUrl = ALLOWED_ORIGINS[0];
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?subscribed=1`,
      cancel_url: `${siteUrl}/?subscribe=cancelled`,
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
    });

    return json({
      url: checkoutSession.url,
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
