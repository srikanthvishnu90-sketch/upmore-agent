// WO-059 (architect): the held-out live phrasings (evals/career/heldout-live.json) stay held out. They come from the
// 2026-10-19/20 battery on the deployed line, where a keyword router was taught each failing sentence and the next live
// sentence still failed. The brain may never be taught these: no brain or prompt file contains any of their turns.
import SET from "../../evals/career/heldout-live.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const items = (SET as any).items as { id: string; turns: string[]; must: string[]; must_not?: string[] }[];

Deno.test("WO-059/H1 the held-out set is well formed: unique ids, turns and what a right reply must do", () => {
  eq(new Set(items.map((i) => i.id)).size, items.length, "unique ids");
  for (const i of items) {
    if (!i.turns.length || !i.must.length) throw new Error(`${i.id}: needs turns and must`);
  }
  if (items.length < 30) throw new Error(`only ${items.length} items`);
});

Deno.test("WO-059/H2 no brain or prompt file contains a held-out turn (no teaching to the test)", async () => {
  const phrases = items.flatMap((i) => i.turns).filter((t) => t.length >= 20).map((t) => t.toLowerCase());
  const roots = ["supabase/functions/_shared/agent", "supabase/functions/agent-chat/career_brain.ts"];
  const hits: string[] = [];
  async function scan(p: string) {
    const st = await Deno.stat(p);
    if (st.isDirectory) {
      for await (const e of Deno.readDir(p)) await scan(`${p}/${e.name}`);
      return;
    }
    if (!/\.(ts|js|json|md)$/.test(p)) return;
    const src = (await Deno.readTextFile(p)).toLowerCase();
    for (const ph of phrases) if (src.includes(ph)) hits.push(`${p}: "${ph.slice(0, 40)}…"`);
  }
  for (const r of roots) await scan(r);
  eq(hits, [], "held-out text found in the brain");
});
