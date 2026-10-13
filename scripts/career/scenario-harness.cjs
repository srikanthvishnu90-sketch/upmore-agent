// Scenario harness for the 300-scenario career program (2026-10-12).
// A testing agent drives scripted user turns through responders wired to the REAL
// domain modules (the same modules bundled into supabase/functions/_shared/router_core.js
// for the production chat handler). The harness owns the EVIDENCE LAW: every user ask,
// agent reply, card, and tool/rail result is recorded verbatim.
// Outputs per scenario (in ~/workspace/your_files/upmore-career-conversations/):
//   <SC-id>-<slug>.messages.json  — the full message/card/tool record
//   <SC-id>-<slug>.md             — the entire conversation, word for word, + verification
//   <SC-id>-<slug>.html           — chat render (source for the screenshot)
//   <SC-id>-<slug>.png            — screenshot of the chat as the user would see it
// Usage: const H = require("./scenario-harness.cjs"); const s = H.session("SC-001", "slug");
//   await s.user("..."); await s.agent("...", {card}); await s.tool("rail", {...});
//   s.verify("what was checked in the rail's own state", {...}); await s.finish({status, outcome});
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const OUT_DIR = path.join(process.env.HOME, "workspace/your_files/upmore-career-conversations");

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function session(scId, slug) {
  const base = `${scId}-${slug}`;
  const messages = [];
  const startedAt = new Date().toISOString();
  let seq = 0;
  function push(role, text, extra) {
    const m = Object.assign({ seq: ++seq, at: new Date().toISOString(), role, text: text == null ? null : String(text) }, extra || {});
    messages.push(m); return m;
  }
  const s = {
    id: scId, slug, base, messages,
    user(text) { return push("user", text); },
    agent(text, opts) { return push("agent", text, opts && opts.card ? { card: opts.card } : undefined); },
    card(card) { return push("agent", card && card.title ? card.title : "(card)", { card }); },
    tool(name, result) { return push("tool", typeof result === "string" ? result : JSON.stringify(result), { tool: name, result }); },
    verify(what, evidence) { return push("verification", what, { evidence }); },
    async finish(outcome) {
      // outcome: {status: COMPLETE|LEARN|ASK, outcome: "one real-world line", reason?, unblock?}
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const rec = { scenario: scId, slug, started_at: startedAt, finished_at: new Date().toISOString(), status: outcome.status, outcome_line: outcome.outcome, reason: outcome.reason || null, unblock: outcome.unblock || null, messages };
      fs.writeFileSync(path.join(OUT_DIR, base + ".messages.json"), JSON.stringify(rec, null, 2));
      const md = [`# ${scId} — ${slug}`, ``, `**Status:** ${outcome.status}`, `**Outcome:** ${outcome.outcome}`,
        outcome.reason ? `**Reason:** ${outcome.reason}` : null, outcome.unblock ? `**Unblocks with:** ${outcome.unblock}` : null, ``, `## Conversation (entire, word for word)`, ``];
      for (const m of messages) {
        if (m.role === "user") md.push(`**USER:** ${m.text}`, ``);
        else if (m.role === "agent") { md.push(`**AGENT:** ${m.text}`, ``); if (m.card) md.push("```json\n" + JSON.stringify(m.card, null, 2) + "\n```", ``); }
        else if (m.role === "tool") md.push(`*[tool ${m.tool}]*`, "```json\n" + m.text + "\n```", ``);
        else if (m.role === "verification") md.push(`**VERIFIED FROM RAIL STATE:** ${m.text}`, m.evidence ? "```json\n" + JSON.stringify(m.evidence, null, 2) + "\n```" : "", ``);
      }
      fs.writeFileSync(path.join(OUT_DIR, base + ".md"), md.filter((x) => x !== null).join("\n"));
      const bubbles = messages.filter((m) => m.role === "user" || m.role === "agent").map((m) => {
        const side = m.role === "user" ? "right" : "left";
        const card = m.card ? `<div class="card"><b>${esc(m.card.title || "Card")}</b><pre>${esc(JSON.stringify(m.card, null, 2))}</pre></div>` : "";
        return `<div class="row ${side}"><div class="bubble ${m.role}">${esc(m.text)}${card}</div></div>`;
      }).join("\n");
      const html = `<!doctype html><meta charset="utf-8"><title>${scId} ${esc(slug)}</title><style>body{font-family:-apple-system,'Segoe UI',sans-serif;background:#f2f2f7;margin:0;padding:16px}.row{display:flex;margin:6px 0}.row.right{justify-content:flex-end}.bubble{max-width:78%;padding:10px 14px;border-radius:18px;white-space:pre-wrap;font-size:15px;line-height:1.4}.user{background:#0a84ff;color:#fff;border-bottom-right-radius:4px}.agent{background:#fff;color:#111;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,.08)}.card{margin-top:8px;border:1px solid #d1d1d6;border-radius:12px;padding:8px;background:#fafafa}.card pre{white-space:pre-wrap;font-size:12px;margin:4px 0}h1{font-size:16px}</style><h1>Upmore — ${scId} · ${esc(slug)} · ${outcome.status}</h1>${bubbles}`;
      const htmlPath = path.join(OUT_DIR, base + ".html");
      fs.writeFileSync(htmlPath, html);
      try {
        execFileSync("python3", [path.join(__dirname, "shoot.py"), htmlPath, path.join(OUT_DIR, base + ".png")], { stdio: "pipe", timeout: 60000 });
      } catch (e) { push("verification", "screenshot failed: " + String(e).slice(0, 200)); }
      return rec;
    },
  };
  return s;
}
module.exports = { session, OUT_DIR };
