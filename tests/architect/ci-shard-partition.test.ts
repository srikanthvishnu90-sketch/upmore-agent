// Every architect test file (pending excluded) runs in exactly one `gate (architect)` shard, and the shard count in
// the workflow matches the one the gate script is told to use.
import { architectTestFiles, shardOf } from "../../scripts/architect-shards.ts";

const COUNT = 6;

Deno.test("the architect shards partition tests/architect exactly", () => {
  const files = architectTestFiles();
  if (files.length < 100) throw new Error(`suspiciously few architect test files: ${files.length}`);
  if (files.some((f) => f.includes("/pending/"))) throw new Error("pending file selected");
  const counts = new Map<string, number>();
  for (let s = 1; s <= COUNT; s++) {
    const shard = shardOf(files, s, COUNT);
    if (!shard.length) throw new Error(`shard ${s} is empty`);
    for (const f of shard) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  for (const f of files) if (counts.get(f) !== 1) throw new Error(`${f} ran in ${counts.get(f) ?? 0} shards`);
  if (counts.size !== files.length) throw new Error("a shard selected a file outside the suite");
});

Deno.test("this file is itself in the suite, and the workflow matrix has COUNT shards", async () => {
  if (!architectTestFiles().includes("tests/architect/ci-shard-partition.test.ts")) throw new Error("not discovered");
  const yml = await Deno.readTextFile(new URL("../../.github/workflows/ci.yml", import.meta.url));
  const m = yml.match(/GATE_ARCHITECT_SHARD: \$\{\{ matrix\.shard \}\}\/(\d+)/);
  if (!m || Number(m[1]) !== COUNT) throw new Error(`ci.yml shard count ${m?.[1]} != ${COUNT}`);
  const matrix = yml.match(/gate-architect-shard:[\s\S]*?shard: \[([\d, ]+)\]/);
  if (!matrix || matrix[1].split(",").map(Number).join() !== Array.from({ length: COUNT }, (_, i) => i + 1).join()) {
    throw new Error("ci.yml matrix is not 1..COUNT");
  }
});
