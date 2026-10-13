// Market and news intelligence (items C17-C45; packages/domain/118-market-intel.js through the router bundle over
// packages/offers/market-data.json): the bundle carries the dated stand-in dataset as it is on disk; the chat
// answer (_shared/market_answer.ts) answers from it; a price alert told in chat (settingsMessage) is saved and
// the hourly run's plan() fires it once with the actual price; the morning briefing arrives on a trading day.
// Rows are the stand-in dataset's, named as such on every source line. Permission-free: JSON/text imports only.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { plan, settingsMessage } from "../../supabase/functions/_shared/proactive.ts";
import { marketReply } from "../../supabase/functions/agent-chat/_shared/market_answer.ts";
import { MARKET_DATA_JSON } from "../../supabase/functions/_shared/router_core.js";
import DATA from "../../packages/offers/market-data.json" with { type: "json" };
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const at = (iso: string) => Date.parse(iso);
const NY = "America/New_York";
const store = (settings: any = { time_zone: NY, watches: [] }) => ({ settings, async read() { return { ok: true, settings: this.settings }; }, async save(c: any) { this.settings = Object.assign({}, this.settings, c); return true; } });
const market = (p: { messages: any[] }) => p.messages.filter((m) => m.key.startsWith("market:") || m.key.startsWith("price:") || m.key.startsWith("halt:") || m.key.startsWith("hype:"));

Deno.test("the bundle carries the dated stand-in dataset as it is on disk", () => {
  assertEquals(MARKET_DATA_JSON, DATA);
  assertMatch(SRC_HANDLER, /marketReply\(message, new Date\(\)/);
});

Deno.test("the chat answers from the dataset, with its source line", async () => {
  const m = await marketReply("why is my portfolio down today", new Date(at("2026-10-12T13:30:00Z")), {});
  assertMatch(m!, /NVDA: -\$385\.00/);
  assertMatch(m!, /Source: Upmore stand-in market dataset/);
  const c = await marketReply("VOO versus VTI - just tell me which", new Date(at("2026-10-12T13:30:00Z")), {});
  assertMatch(c!, /data only — no verdict/);
  assertEquals(await marketReply("what is my checking balance", new Date(at("2026-10-12T13:30:00Z")), {}), null);
});

Deno.test("told in chat, fired by the hourly run, exactly once: the NVDA price alert", async () => {
  const db = store();
  const said = await settingsMessage("Tell me if NVDA drops below $185", db, at("2026-10-12T13:00:00Z"));
  assertEquals(said!.changed, true);
  assertMatch(said!.reply, /I'll tell you once if NVDA drops below \$185\.00/);
  const p = plan({ accounts: [], transactions: [], settings: db.settings, sent: [] }, at("2026-10-12T13:30:00Z"));
  const hit = p.messages.filter((x: any) => x.key === "price:pa-NVDA-18500");
  assertEquals(hit.length, 1);
  assertMatch(hit[0].text, /NVDA is \$182\.40/);
  assertMatch(hit[0].text, /approval card/);
  assertEquals(hit[0].capability_id, "C18");
  const again = plan({ accounts: [], transactions: [], settings: db.settings, sent: [{ key: "price:pa-NVDA-18500", sent_at: at("2026-10-12T13:30:00Z"), cadence: false }] }, at("2026-10-12T14:30:00Z"));
  assertEquals(again.messages.filter((x: any) => x.key === "price:pa-NVDA-18500").length, 0);
});

Deno.test("the briefing watch set in chat brings the morning briefing on a trading day, and the halt with it", async () => {
  const db = store();
  const said = await settingsMessage("Send me the daily stock briefing", db, at("2026-10-12T12:00:00Z"));
  assertEquals(said!.changed, true);
  await settingsMessage("Wake me if one of my stocks halts", db, at("2026-10-12T12:01:00Z"));
  const p = plan({ accounts: [], transactions: [], settings: db.settings, sent: [] }, at("2026-10-12T13:30:00Z"));
  const keys = market(p).map((x: any) => x.key);
  assert(keys.includes("market:brief:2026-10-12"));
  assert(keys.includes("halt:msft-halt"));
  const brief = p.messages.find((x: any) => x.key === "market:brief:2026-10-12");
  assertMatch(brief.text, /\$47,868\.50 in stocks/);
  assertEquals(brief.capability_id, "C17");
});
