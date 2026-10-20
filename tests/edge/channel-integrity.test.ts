// What the channel delivers is what the person approves and reads (channel parity audit, 2026-10-20). Three defects
// found on trunk, each pinned here: an approval card cut in delivery and still approved whole; a daily report that
// delivered 2 of 10 postings; STOP silencing the answers it promised to keep sending.
import { CUT_NOTE, MAX_BUBBLES, OUTBOX_CHARS, toBubbles } from "../../supabase/functions/_shared/conversation.ts";
import { deliverDue, memoryChannel, type Send } from "../../supabase/functions/_shared/channel.ts";

const assert = (c: unknown, m = "assertion failed") => { if (!c) throw new Error(m); };
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}\nexpected ${JSON.stringify(b)}\nactual   ${JSON.stringify(a)}`); };
const NOW = Date.UTC(2026, 9, 20, 15, 0, 0);
const words = (s: string) => s.replace(/\s+/g, " ").trim();

Deno.test("CH-1 a 3,080-character approval card arrives whole: every answer and the yes line", () => {
  const answers = Array.from({ length: 40 }, (_, i) => `${i + 1}. Question number ${i + 1} on the employer's form: the answer exactly as it will be sent, ${i}.`);
  const card = ["Acme Capital, Summer Analyst (1 application)", ...answers, 'Reply "yes" to send it, "no" to skip it, or "change 3" to fix one answer.'].join("\n");
  assert(card.length > 2800 && card.length <= OUTBOX_CHARS, `card is ${card.length} characters`);
  const b = toBubbles(card);
  assert(b.length <= MAX_BUBBLES, `${b.length} bubbles`);
  assert(!b.join("\n").includes(CUT_NOTE), "the card was cut");
  eq(words(b.join("\n")), words(card), "every character of the card arrives, in order");
  assert(b[b.length - 1].includes('Reply "yes"'), "the yes line is last");
});

Deno.test("CH-2 a daily report of 10 postings delivers all 10 links, each with its posting", () => {
  const lines = Array.from({ length: 10 }, (_, i) => `- Investment Banking Summer Analyst ${i + 1} at Bank ${i + 1}, New York, NY\n  https://boards.greenhouse.io/bank${i + 1}/jobs/${4000000 + i}`);
  const report = [`Your daily job report: 10 matches in the last day.`, ...lines].join("\n");
  const b = toBubbles(report);
  const text = b.join("\n");
  for (let i = 0; i < 10; i++) assert(text.includes(`https://boards.greenhouse.io/bank${i + 1}/jobs/${4000000 + i}`), `posting ${i + 1}'s link is missing`);
  assert(!text.includes(CUT_NOTE), "the report was cut");
  for (const x of b) {
    const urls = x.match(/https?:\/\/\S+/g) ?? [];
    for (const u of urls) assert(x.includes("Bank " + u.match(/bank(\d+)/)![1] + ","), `a link travels with its posting: ${x}`);
  }
});

Deno.test("CH-2b links that stand as their own paragraphs in a long list pack with their posting, nothing cut", () => {
  const items = Array.from({ length: 12 }, (_, i) => `Associate ${i + 1} at Fund ${i + 1}, Boston, MA\n\nhttps://jobs.ashbyhq.com/fund${i + 1}/${9000 + i}`);
  const msg = ["Here is everything that matched this week.", ...items].join("\n\n");
  const b = toBubbles(msg);
  assert(b.length <= MAX_BUBBLES && !b.join(" ").includes(CUT_NOTE), `${b.length} bubbles, cut: ${b.join(" ").includes(CUT_NOTE)}`);
  for (let i = 0; i < 12; i++) assert(b.join("\n").includes(`https://jobs.ashbyhq.com/fund${i + 1}/${9000 + i}`), `link ${i + 1} missing`);
});

Deno.test("CH-3 nothing up to the outbox's 4,000 characters is ever cut (adversarial shapes)", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const shapes: (() => string)[] = [
    () => Array.from({ length: 11 }, () => "y".repeat(345) + " z").join("\n\n"), // neighbours that never pack together
    () => Array.from({ length: 60 }, (_, i) => `- Role ${i}\n  https://jobs.lever.co/acme/${i}`).join("\n"), // a wall of links
    () => `Here is the posting.\nhttps://jobs.ashbyhq.com/a/1\n${"word ".repeat(300)}\nhttps://jobs.ashbyhq.com/a/2\n${"more ".repeat(300)}`,
    () => Array.from({ length: 400 }, () => ["data", "analyst", "\n", "\n\n", "x".repeat(Math.floor(rnd() * 700))][Math.floor(rnd() * 5)]).join(" "),
  ];
  for (let i = 0; i < 3000; i++) {
    const t = shapes[i % shapes.length]().slice(0, Math.floor(rnd() * OUTBOX_CHARS) + 1).trim();
    if (!t) continue;
    const b = toBubbles(t);
    assert(b.length <= MAX_BUBBLES, `case ${i}: ${b.length} bubbles`);
    assert(!b.join(" ").includes(CUT_NOTE), `case ${i}: a ${t.length}-character message was cut`);
    eq(b.join("").replace(/\s+/g, "").length, t.replace(/\s+/g, "").length, `case ${i}: characters lost`);
  }
});

Deno.test("CH-4 after STOP: an alert is held; the answer to a message the person sends is delivered", async () => {
  const sent: string[] = [];
  const send: Send = async (contact, bubbles) => { sent.push(`${contact}:${bubbles.join(" ")}`); return { ok: true, id: "p" }; };
  const channel = memoryChannel([
    { id: "1", userId: "u", contact: "+15550001111", key: "alert:job-1", text: "New match: Analyst at Acme.", deliver_at: NOW - 1000, attempts: 0 },
    { id: "2", userId: "u", contact: "+15550001111", key: "reply:msg-9", text: "Your alerts are off. Text START to turn them back on.", deliver_at: NOW - 500, attempts: 0 },
  ]);
  await channel.setOptOut("+15550001111", true, NOW - 5000);
  const r = await deliverDue({ store: channel, send, now: NOW });
  eq([r.delivered, r.skipped_opt_out], [1, 1]);
  eq(sent, ["+15550001111:Your alerts are off. Text START to turn them back on."], "only the answer went out");
});

Deno.test("CH-5 a run past its time budget stops before the next row; that row stays queued, never half sent", async () => {
  let t = NOW;
  const send: Send = async () => { t += 60_000; return { ok: true, id: "p" }; }; // each send takes a minute
  const channel = memoryChannel([1, 2, 3].map((i) => ({ id: String(i), userId: "u", contact: `+1555000000${i}`, key: `alert:${i}`, text: `Match ${i}.`, deliver_at: NOW - 1000, attempts: 0 })));
  const r = await deliverDue({ store: channel, send, now: NOW, clock: () => t, budgetMs: 100_000 });
  eq([r.delivered, r.deferred], [2, 1]);
  eq(channel.rows().map((x) => x.status), ["delivered", "delivered", "queued"], "the third waits for the next run");
});
