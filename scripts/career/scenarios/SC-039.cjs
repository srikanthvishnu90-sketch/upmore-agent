"use strict";
const L = require("./_w02-lib.cjs"); const { H, M } = L;
(async () => {
  const s = H.session("SC-039", "seed-inbox-placement-before-wave1");
  s.user("Seed-inbox placement test (Gmail/Outlook/Yahoo) before wave 1 sends");
  const state = M.createSeedTest();
  const gateBefore = M.seedGate(state);
  s.tool("CareerOutreach.seedGate before results (must block wave 1)", gateBefore);
  // TEST fixture seed results: one seed account per provider, all landing in inbox.
  M.setSeedResults(state, [
    { provider: "gmail", placement: "inbox", at: "2026-10-13T09:00:00Z" },
    { provider: "outlook", placement: "inbox", at: "2026-10-13T09:01:00Z" },
    { provider: "yahoo", placement: "inbox", at: "2026-10-13T09:02:00Z" },
  ]);
  const gateAfter = M.seedGate(state);
  s.tool("CareerOutreach.setSeedResults + seedGate (W02 extension)", { state, gateAfter });
  // Negative control: a spam placement must block.
  const bad = M.createSeedTest(); M.setSeedResults(bad, [{ provider: "gmail", placement: "spam" }, { provider: "outlook", placement: "inbox" }, { provider: "yahoo", placement: "inbox" }]);
  const gateBad = M.seedGate(bad);
  s.tool("seedGate negative control (gmail=spam must block)", gateBad);
  s.agent(`Seed test recorded before any wave-1 send: Gmail inbox, Outlook inbox, Yahoo inbox. Gate: PASS — wave 1 may send. (Control check: with a spam placement the same gate blocks, so this isn't a rubber stamp.)`, { card: { title: "Seed placement — all inbox, wave 1 cleared", results: state.results, gate: gateAfter } });
  const ok = gateBefore.ok === false && gateAfter.ok === true && state.complete === true && gateBad.ok === false;
  s.verify("seed state in the rail: complete=true, all three providers recorded inbox, gate flips block->pass only with full inbox results; spam control blocks", { gateBefore, gateAfter, gateBad, state });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Seed-inbox placement test recorded for Gmail/Outlook/Yahoo (all inbox, TEST fixtures) before wave 1; seedGate blocked before results and on a spam control, and cleared wave 1 only with all-inbox placement." }
    : { status: "LEARN", outcome: "Seed gate did not verify.", reason: `before=${JSON.stringify(gateBefore)} after=${JSON.stringify(gateAfter)} bad=${JSON.stringify(gateBad)}`, unblock: "Fix setSeedResults/seedGate and rerun SC-039." });
})().catch((e) => { console.error(e); process.exit(1); });
