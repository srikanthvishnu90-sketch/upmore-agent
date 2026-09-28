// Upmore stripe-credits Edge Function.
// Pushes unapplied referral credits to the user's Stripe Customer Balance.
//
// Called by the frontend after qualify_referral() succeeds, so a subscriber
// who earns a referral credit sees it on their Stripe balance immediately
// (Stripe auto-applies balance to the next invoice).
//
// - Auth required (verify_jwt=true at deploy)
// - Idempotent: only touches credits with applied=false
// - If the user has no Stripe customer yet, credits stay banked (applied=false)
//   and stripe-webhook will apply them after checkout completes.
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

    // 1. Authenticate.
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Sign in required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // 2. Find unapplied credits.
    const { data: credits } = await admin
      .from("referral_credits")
      .select("id, amount")
      .eq("user_id", user.id)
      .eq("applied", false);
    if (!credits || credits.length === 0) {
      return json({ ok: true, applied_cents: 0, note: "No pending credits" });
    }

    // 3. Need a Stripe customer to push balance to.
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();
    if (!sub?.stripe_customer_id) {
      return json({
        ok: true,
        applied_cents: 0,
        note: "Credits banked — they'll apply to your Stripe balance when you subscribe.",
      });
    }
    if (!stripeKey) return json({ error: "Stripe not configured" }, 503);

    // 4. Push to customer balance, mark applied.
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const totalCents = credits.reduce((s, c) => s + Math.round(Number(c.amount) * 100), 0);
    await stripe.customers.createBalanceTransaction(sub.stripe_customer_id, {
      amount: -totalCents,
      currency: "usd",
      description: `Referral credit applied (${credits.length} referral${credits.length === 1 ? "" : "s"})`,
    });
    await admin
      .from("referral_credits")
      .update({ applied: true })
      .in("id", credits.map(c => c.id));

    return json({ ok: true, applied_cents: totalCents });
  } catch (e) {
    console.error("stripe-credits error:", e);
    return json({ error: "Failed: " + (e as Error).message }, 500);
  }
});
