// Unit fixtures for the channel presentation layer
// (supabase/functions/_shared/channel_present.ts): renderer structure
// preservation per platform, structure-aware splitting, approval-card
// detection, and document-artifact extraction against the CURRENT agent-chat
// reply contract (which carries no artifact field — gap CHANNEL-DOC-1).
import {
  detectBatchCard,
  extractArtifacts,
  plainFromTelegramHtml,
  presentReply,
  renderTelegramBlocks,
  renderWhatsappBlocks,
} from "../../supabase/functions/_shared/channel_present.ts";
import { assert, assertEq } from "./lib/channel_fixture.ts";

const MD = [
  "**Your batch is ready**",
  "",
  "13 roles are tailored and sitting at the final review screen.",
  "",
  "- Gusto — Finance Intern",
  "- Virtu — Quant Trading Intern",
  "",
  "Details: [the card](https://example.com/card?a=1&b=2) and R&D notes with <tags>.",
  "Use `Approve batch batch-1` if it looks right.",
].join("\n");

Deno.test("telegram renderer preserves structure: bold, bullets, links, code, escaping", () => {
  const out = renderTelegramBlocks(MD).join("\n");
  assert(out.includes("<b>Your batch is ready</b>"), "bold survives as <b>: " + out);
  assert(out.includes("• Gusto — Finance Intern"), "list item becomes a bullet line");
  assert(out.includes("• Virtu — Quant Trading Intern"), "second list item intact");
  assert(out.includes('<a href="https://example.com/card?a=1&amp;b=2">the card</a>'), "link intact with escaped href");
  assert(out.includes("R&amp;D"), "ampersand escaped");
  assert(out.includes("&lt;tags&gt;"), "angle brackets escaped");
  assert(out.includes("<code>Approve batch batch-1</code>"), "inline code survives as <code>");
  assert(!out.includes("**"), "no raw markdown bold left behind");
});

Deno.test("whatsapp renderer uses native markup and bare tappable links", () => {
  const out = renderWhatsappBlocks(MD).join("\n");
  assert(out.includes("*Your batch is ready*"), "bold becomes *bold*: " + out);
  assert(out.includes("• Gusto — Finance Intern"), "list item becomes a bullet line");
  assert(out.includes("the card (https://example.com/card?a=1&b=2)"), "labelled link becomes label + bare url");
  assert(out.includes("```Approve batch batch-1```"), "inline code becomes ```mono```");
  assert(!out.includes("**"), "no telegram-style bold left behind");
  assert(!out.includes("]("), "no markdown link syntax left behind");
});

Deno.test("italic and strike render natively on both platforms", () => {
  const md = "A *quick* note, ~~not this~~ and _soft_ emphasis.";
  const tg = renderTelegramBlocks(md).join("\n");
  assert(tg.includes("<i>quick</i>") && tg.includes("<s>not this</s>") && tg.includes("<i>soft</i>"), "telegram: " + tg);
  const wa = renderWhatsappBlocks(md).join("\n");
  assert(wa.includes("_quick_") && wa.includes("~not this~") && wa.includes("_soft_"), "whatsapp: " + wa);
});

Deno.test("structure-aware split: list items and links are never cut", () => {
  const items = Array.from({ length: 40 }, (_, i) =>
    `- Role number ${i} at Company ${i} — apply here: https://jobs.example.com/posting/${i}?utm_source=trainee&ref=chat`);
  const md = ["**Forty roles**", "", ...items].join("\n");
  for (const channel of ["telegram", "whatsapp"] as const) {
    const chunks = presentReply(channel, md, 4096);
    assert(chunks.length >= 2, `${channel}: expected multiple chunks, got ${chunks.length}`);
    for (const c of chunks) assert(c.length <= 4096, `${channel}: chunk within limit (${c.length})`);
    // Telegram HTML escapes & in text nodes; the reader sees the unescaped
    // URL, so compare against what the user actually sees.
    const joined = chunks.join("\n").replace(/&amp;/g, "&");
    for (let i = 0; i < 40; i++) {
      assert(joined.includes(`Role number ${i} at Company ${i}`), `${channel}: item ${i} intact somewhere`);
      assert(joined.includes(`https://jobs.example.com/posting/${i}?utm_source=trainee&ref=chat`), `${channel}: link ${i} intact somewhere`);
    }
    // No chunk may contain a dangling link fragment: every "https://" in a
    // chunk belongs to a complete posting URL.
    for (const c of chunks) {
      for (const m of c.replace(/&amp;/g, "&").matchAll(/https:\/\/\S+/g)) {
        assert(/^https:\/\/jobs\.example\.com\/posting\/\d+\?utm_source=trainee&ref=chat$/.test(m[0]), `${channel}: complete url only, saw ${m[0]}`);
      }
    }
  }
});

Deno.test("structure-aware split: a single long paragraph still splits at spaces, urls whole", () => {
  const sentence = "This role looks strong for your background and the posting is live today. ";
  const md = (sentence.repeat(120)).trim() + " See https://example.com/very/long/path/to/the/posting/page?x=1 end.";
  const chunks = presentReply("telegram", md, 4096);
  assert(chunks.length >= 2, "long paragraph splits");
  for (const c of chunks) assert(c.length <= 4096, "chunk within limit");
  assert(chunks.join(" ").includes("https://example.com/very/long/path/to/the/posting/page?x=1"), "url survives whole");
});

Deno.test("short replies are a single chunk, structure intact", () => {
  const chunks = presentReply("telegram", "Found **3** roles.\n\n- One\n- Two", 4096);
  assertEq(chunks.length, 1);
  assert(chunks[0].includes("<b>3</b>") && chunks[0].includes("• One"), chunks[0]);
});

Deno.test("plainFromTelegramHtml keeps link destinations and decodes entities", () => {
  const html = renderTelegramBlocks("Details: [the card](https://example.com/card?a=1&b=2) and R&D <notes>, **bold** claim.").join("\n");
  const plain = plainFromTelegramHtml(html);
  assert(plain.includes("the card (https://example.com/card?a=1&b=2)"), "labelled link degrades to label + destination: " + plain);
  assert(plain.includes("R&D <notes>"), "entities decode back to the author's characters: " + plain);
  assert(plain.includes("bold"), "emphasis text survives");
  assert(!plain.includes("<a ") && !plain.includes("<b>"), "no markup left behind: " + plain);
});

Deno.test("detectBatchCard reads only the awaiting-approval batch_run payload", () => {
  assertEq(detectBatchCard({ batch: { kind: "batch_run", status: "awaiting_approval", id: "batch-abc123" } })?.runId, "batch-abc123");
  assertEq(detectBatchCard({ batch: { kind: "batch_run", status: "completed", id: "batch-abc123" } }), null);
  assertEq(detectBatchCard({ batch: { kind: "pending_batch_intent", status: "queued", id: "batch-abc123" } }), null);
  assertEq(detectBatchCard({ reply: "no batch here" }), null);
  assertEq(detectBatchCard({ batch: { kind: "batch_run", status: "awaiting_approval", id: "not-a-run" } }), null);
});

Deno.test("extractArtifacts: the current contract yields nothing; the proposed field is honoured", () => {
  assertEq(extractArtifacts({ reply: "hi" }).length, 0, "no artifact field today -> no documents (CHANNEL-DOC-1)");
  assertEq(extractArtifacts({ artifacts: [{ kind: "document", url: "https://files.example.com/resume.pdf", filename: "resume.pdf" }] }).length, 1);
  assertEq(extractArtifacts({ artifacts: [{ kind: "document", url: "http://insecure.example.com/x.pdf" }] }).length, 0, "https only");
  assertEq(extractArtifacts({ artifacts: [{ kind: "image", url: "https://files.example.com/x.png" }] }).length, 0, "documents only");
});
