// Writes supabase/functions/career-ingest/boards.json: the live boards of packages/career-data/board-directory.json in the
// shape the ingest function reads (the function ships only what sits under supabase/functions). Re-run after any
// directory change; tests/edge/career-ingest.test.ts fails while the copy is stale.
//   deno run -A scripts/build-ingest-boards.ts
import { directoryBoards } from "../supabase/functions/_shared/career_ingest.ts";
const dir = JSON.parse(await Deno.readTextFile(new URL("../packages/career-data/board-directory.json", import.meta.url)));
const boards = directoryBoards(dir);
await Deno.writeTextFile(new URL("../supabase/functions/career-ingest/boards.json", import.meta.url), JSON.stringify(boards, null, 0).replace(/\},\{/g, "},\n{") + "\n");
console.log(`${boards.length} live boards written`);
