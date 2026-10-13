"use strict";
// W04 (SC-061..080) shared loader — builds on the F03 lib.
const L = require("./_f03-lib.cjs");
async function feedMany(list) {
  const out = [];
  for (const [source, token] of list) { try { out.push(...await L.feed(source, token)); } catch (e) { /* feed down: skip, counts stay honest */ } }
  return out;
}
const STARRED_FEEDS = [["greenhouse", "stripe"], ["greenhouse", "datadog"], ["ashby", "ramp"]];
const WIDE_FEEDS = [...STARRED_FEEDS, ["greenhouse", "figma"], ["greenhouse", "airbnb"], ["greenhouse", "duolingo"], ["greenhouse", "coinbase"], ["ashby", "openai"]];
module.exports = Object.assign({}, L, { feedMany, STARRED_FEEDS, WIDE_FEEDS });
