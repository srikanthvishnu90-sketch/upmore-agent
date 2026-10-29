// CI sharding of the architect suite (2026-10-29). `gate (architect)` ran `deno test` over every file in
// tests/architect serially in one job (1,323 s on a green run, cancelled at the 30-minute cap on others). The files are
// now split across GATE_ARCHITECT_SHARD=i/n jobs. The split is by position in the sorted file list (index % n), so it
// is deterministic, needs no timing table, and interleaves neighbouring files (the heavy Postgres/Chromium tests
// cluster by name prefix). A file selected here is exactly a file `deno test tests/architect/` would discover, minus
// tests/architect/pending. Nothing is skipped or edited: tests/architect/ci-shard-partition.test.ts proves every file
// runs in exactly one shard.
//   deno run -A scripts/architect-shards.ts list <i> <n>   print shard i (1-based) of n, one path per line
//   deno run -A scripts/architect-shards.ts verify <n>     fail unless the n shards partition the whole suite

const ROOT = new URL("../", import.meta.url);
// Deno's discovery rule: *_test.*, *.test.* or test.* with a script extension.
const TEST_FILE = /(^|[._])test\.(ts|tsx|mts|js|mjs|jsx)$/;

export function architectTestFiles(root: URL = ROOT): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of Deno.readDirSync(new URL(rel, root))) {
      const path = `${rel}${entry.name}`;
      if (entry.isDirectory) {
        if (path === "tests/architect/pending") continue;
        walk(`${path}/`);
      } else if (entry.isFile && TEST_FILE.test(entry.name)) out.push(path);
    }
  };
  walk("tests/architect/");
  return out.sort();
}

export function shardOf(files: string[], shard: number, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(shard) || shard < 1 || shard > count) {
    throw new Error(`bad shard ${shard}/${count}`);
  }
  return files.filter((_, index) => index % count === shard - 1);
}

if (import.meta.main) {
  const [cmd, a, b] = Deno.args;
  const files = architectTestFiles();
  if (cmd === "list") {
    const picked = shardOf(files, Number(a), Number(b));
    if (!picked.length) throw new Error(`shard ${a}/${b} is empty`);
    console.log(picked.join("\n"));
  } else if (cmd === "verify") {
    const count = Number(a);
    const seen = new Map<string, number>();
    for (let s = 1; s <= count; s++) for (const f of shardOf(files, s, count)) seen.set(f, (seen.get(f) ?? 0) + 1);
    const bad = files.filter((f) => seen.get(f) !== 1);
    if (!files.length || bad.length || seen.size !== files.length) {
      console.error(`shards do not partition the suite: ${bad.join(", ") || "no files"}`);
      Deno.exit(1);
    }
    console.log(`${files.length} architect test files, each in exactly one of ${count} shards`);
  } else {
    console.error("usage: architect-shards.ts list <i> <n> | verify <n>");
    Deno.exit(2);
  }
}
