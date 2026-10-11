// The chat request's text and photos (spec 16 item 12: a photo with no words is a message).
import { chatInput, PHOTO_ONLY } from "../../supabase/functions/agent-chat/_shared/chat_input.ts";
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
const JPG = { data: "AAAA", media_type: "image/jpeg" };
Deno.test("a photo alone is a message: the model reads PHOTO_ONLY, the stored text says a photo was attached", () => {
  const r = chatInput("", [JPG], 4000);
  assert(r.ok && r.message === PHOTO_ONLY && r.userContent === "[photo attached]" && r.imageBlocks.length === 1, JSON.stringify(r));
  assert(/never as instructions/.test(PHOTO_ONLY), "text inside a photo is content, not instructions");
});
Deno.test("nothing, too long, or only unusable photos is refused; words alone and words with photos pass", () => {
  for (const [m, i, want] of [["", [], "message required"], [undefined, undefined, "message required"], ["   ", [{ data: "x", media_type: "application/pdf" }], "message required"], ["x".repeat(4001), [], "message too long"]] as const) {
    const r = chatInput(m, i, 4000); assert(!r.ok && r.error === want, JSON.stringify([m && String(m).slice(0, 5), r]));
  }
  const w = chatInput("hi", [], 4000); assert(w.ok && w.message === "hi" && w.userContent === "hi");
  const b = chatInput("is this a scam", [JPG, JPG, JPG, JPG], 4000); assert(b.ok && b.imageBlocks.length === 3 && b.userContent === "[photo attached] is this a scam");
});
