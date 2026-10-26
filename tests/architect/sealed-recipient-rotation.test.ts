// Offline regression: a rotated former recipient may not shadow a working held-out key.
// This uses only synthetic keys and synthetic test items. No model or external calls.
import { open, rewrap, seal, recipientFromSecret } from "../../evals/career/sealed/seal.ts";
import { CATEGORIES } from "../../evals/career/sealed/schema.ts";
const assert = (v: unknown, m: string) => { if (!v) throw new Error(m); };
const old = "synthetic-old-0123456789abcdef";
const next = "synthetic-next-0123456789abcdef";
const held = "synthetic-held-0123456789abcdef";
const env = (v: Record<string, string>) => ({ get: (k: string) => v[k] });
const plain = new TextEncoder().encode(JSON.stringify({ items: Array.from({ length: 170 }, (_, i) => ({
  id: `T${i}`, category: CATEGORIES[i % CATEGORIES.length], persona: "p",
  turns: ["hello"], must: ["test"], expect: { queued: 0 }, state: "no application",
})) }));
async function refuses(f: () => Promise<unknown>) {
  let failed = false;
  try { await f(); } catch { failed = true; }
  assert(failed, "invalid key unexpectedly accepted");
}
Deno.test("SEAL-ROTATE/1 old key rotates and held-out recipient still decrypts without changing ciphertext", async () => {
  const oldRecipient = await recipientFromSecret(old);
  const s = await seal(plain, [{ secret_env: "OPENAI_API_KEY", pub: oldRecipient.pub }], { author: "synthetic test", note: "" });
  const wrapped = await rewrap(s, env({ OPENAI_API_KEY: old, HELDOUT_SEAL_KEY: held }), "HELDOUT_SEAL_KEY");
  assert(wrapped.ciphertext === s.ciphertext && wrapped.sha256 === s.sha256 && wrapped.iv === s.iv, "payload mutated");
  assert(wrapped.recipients.length === 2, "missing recipients");
  const opened = await open(wrapped, env({ OPENAI_API_KEY: next, HELDOUT_SEAL_KEY: held }));
  assert(new TextDecoder().decode(opened) === new TextDecoder().decode(plain), "plaintext mismatch");
  await refuses(() => open(wrapped, env({ OPENAI_API_KEY: next, HELDOUT_SEAL_KEY: next })));
  await refuses(() => open(wrapped, env({})));
});
Deno.test("SEAL-ROTATE/2 rewrap also works after original key rotates, using the held-out recipient", async () => {
  const recipient = await recipientFromSecret(old);
  const s = await seal(plain, [{ secret_env: "OPENAI_API_KEY", pub: recipient.pub }], { author: "synthetic test", note: "" });
  const wrapped = await rewrap(s, env({ OPENAI_API_KEY: old, HELDOUT_SEAL_KEY: held }), "HELDOUT_SEAL_KEY");
  const twice = await rewrap(wrapped, env({ OPENAI_API_KEY: next, HELDOUT_SEAL_KEY: held }), "HELDOUT_SEAL_KEY");
  assert(twice.recipients.length === 2 && twice.ciphertext === wrapped.ciphertext, "rewrap changed payload");
  const opened = await open(twice, env({ HELDOUT_SEAL_KEY: held }));
  assert(new TextDecoder().decode(opened) === new TextDecoder().decode(plain), "rewrap could not recover");
});
