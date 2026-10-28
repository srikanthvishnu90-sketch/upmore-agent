// Upmore stripe-webhook Edge Function.
// Verifies the Stripe signature, then hands the event to the shared billing core (_shared/trainee_billing.ts), which:
// - syncs Trainee's own subscription into user_subscriptions (status, period, cancel_at_period_end) from Stripe's
//   current copy of the subscription; subscriptions that are not Trainee's are ignored;
// - applies referral credits and credits the referrer on the first paid charge, through a port that tolerates the
//   referral tables being absent (they were dropped from production by mistake; 20261028100000 restores them).
// No JWT (Stripe calls this).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { billingCfgFromEnv, handleStripeEvent, supabaseBillingStore, tolerantReferrals } from "../_shared/trainee_billing.ts";

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey || !webhookSecret) {
      console.error("stripe-webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
      return json({ error: "Stripe not configured" }, 503);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const sig = req.headers.get("stripe-signature");
    if (!sig) return json({ error: "Missing signature" }, 400);
    const rawBody = await req.text();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
    } catch (e) {
      console.error("stripe-webhook: signature verification failed:", (e as Error).message);
      return json({ error: "Invalid signature" }, 400);
    }

    const out = await handleStripeEvent(event as never, {
      stripe, store: supabaseBillingStore(admin), cfg: billingCfgFromEnv(Deno.env), referrals: tolerantReferrals(admin),
    });
    if (!out.handled && out.ignored) console.log(`stripe-webhook: ${event.type} ignored: ${out.ignored}`);
    return json({ received: true });
  } catch (e) {
    // Every step is idempotent, so a 500 lets Stripe retry safely.
    console.error("stripe-webhook error:", e);
    return json({ error: "Webhook failed: " + (e as Error).message }, 500);
  }
});
