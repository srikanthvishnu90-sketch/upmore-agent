// The Stripe client for the chat tools, imported only when a turn needs it (STRIPE_SECRET_KEY set), through a variable
// specifier so tests and bundlers never fetch it. The key is read from the function's secrets, never logged.
// deno-lint-ignore no-explicit-any
export async function stripeClient(secretKey: string): Promise<any> {
  const spec = "https://esm.sh/stripe@14.25.0?target=deno";
  const mod = await import(spec);
  const Stripe = mod.default;
  return new Stripe(secretKey, { apiVersion: "2023-10-16" });
}
