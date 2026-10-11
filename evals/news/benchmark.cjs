#!/usr/bin/env node
// News relevance benchmark (Instinct spec doc 10 "how Claude Code proves it is better", doc 13 benchmark layer).
//   node evals/news/benchmark.cjs            prints the table
// Runs the news brain over the labeled week (evals/data/labeled/news-relevance.json) per persona and measures:
//   brief precision: fraction of daily-brief items whose story is labeled relevant for that persona (target over 80 percent)
//   alert recall:    fraction of labeled material owned-name events that produced an alert (target 100 percent)
//   false alerts:    interruptions per week on clusters not labeled alert (target at most 1)
//   clustering:      planted events that fragmented into several clusters, and clusters that merged different events
// against two baselines: the raw firehose (every story, zero filtering) and a generic finance app's notification
// stream (a ping for every story that names a held ticker or company, a model of that behavior, not any app's code).
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const DAY = 86400000;

function load() { return JSON.parse(fs.readFileSync(path.join(root, "evals/data/labeled/news-relevance.json"), "utf8")); }
// What the scorer is allowed to see: the fields an ingest supplies. Labels and planted ids never reach it.
const visible = s => ({ id: s.id, title: s.title, summary: s.summary, source: s.source, link: s.link, published_at: Date.parse(s.published_at), entities: s.entities });
const pr = (tp, fp, fn) => ({ precision: tp + fp ? +(tp / (tp + fp)).toFixed(4) : 1, recall: tp + fn ? +(tp / (tp + fn)).toFixed(4) : 1, tp, fp, fn });

function run(News, data) {
  const d = data || load(), weekEnd = Date.parse(d.week_end), byId = new Map(d.stories.map(s => [s.id, s])), byLink = new Map(d.stories.map(s => [s.link, s]));
  const personas = {};
  for (const p of d.personas) {
    const L = d.labels[p.id];
    // Alerts are decided as stories arrive: one pass per day with the clock at that day's brief, never one pass over a stale week.
    const truthAlertEvents = new Set(d.stories.filter(s => L[s.id].alert).map(s => s.event_id));
    const hitEvents = new Set(), falseAlerts = [], duplicateAlerts = [];
    let briefItems = 0, briefRelevant = 0, outsideSlots = 0; const briefMisses = [];
    const eventClusters = {}, memberSets = [];
    for (let day = d.days - 1; day >= 0; day--) {
      const end = weekEnd - day * DAY, start = end - DAY;
      const todays = d.stories.filter(s => { const t = Date.parse(s.published_at); return t >= start && t < end; }).map(visible);
      if (!todays.length) continue;
      const r = News.run(todays, p.user, { now: end });
      for (const c of r.clusters) { memberSets.push(c.member_ids || []); for (const id of c.member_ids || []) { const e = byId.get(id).event_id; (eventClusters[e] = eventClusters[e] || new Set()).add(`${day}:${c.id}`); } }
      for (const a of r.decisions.filter(x => x.decision === "alert" || x.decision === "alert_after_quiet_hours")) {
        const ev = byId.get(a.cluster.story.id).event_id;
        if (!L[a.cluster.story.id].alert) falseAlerts.push({ day: d.days - day, title: a.cluster.story.title, why: a.why });
        else if (hitEvents.has(ev)) duplicateAlerts.push({ day: d.days - day, event: ev, title: a.cluster.story.title });
        else hitEvents.add(ev);
      }
      const b = News.brief(r);
      for (const item of b.items) { briefItems++; const s = byLink.get(item.link); if (s && L[s.id].relevant) briefRelevant++; else { if (/NEWS-014/.test(item.why)) outsideSlots++; briefMisses.push({ day: d.days - day, title: item.title, why: item.why }); } }
    }
    const missed = [...truthAlertEvents].filter(e => !hitEvents.has(e));
    // Clustering quality on planted multi-outlet events: fragments (one event, several clusters in a day) and merges (one cluster, several planted events).
    const kindOf = eid => (d.events.find(x => x.id === eid) || {}).kind;
    const fragmented = d.events.filter(e => e.stories > 1 && eventClusters[e.id] && eventClusters[e.id].size > 1).map(e => ({ id: e.id, kind: e.kind, clusters: eventClusters[e.id].size }));
    const merged = memberSets.map(ids => [...new Set(ids.map(id => byId.get(id).event_id).filter(e => kindOf(e) !== "filler" && kindOf(e) !== "noise"))]).filter(evs => evs.length > 1).map(evs => ({ events: evs, titles: evs.map(e => d.stories.find(s => s.event_id === e).title) }));
    // Baselines on the same labels.
    const relevantStories = d.stories.filter(s => L[s.id].relevant).length, alertStories = d.stories.filter(s => L[s.id].alert).length;
    const heldNames = p.user.holdings.flatMap(h => [h.symbol, h.name].map(x => x.toLowerCase()));
    const generic = d.stories.filter(s => heldNames.some(n => (" " + s.title.toLowerCase().replace(/[^a-z0-9$& ]+/g, " ") + " ").includes(" " + n + " ") || (" " + s.title.toLowerCase() + " ").includes(" $" + n + " ")));
    const genericTrue = generic.filter(s => L[s.id].alert).length, genericEvents = new Set(generic.filter(s => L[s.id].alert).map(s => s.event_id)).size;
    personas[p.id] = {
      title: p.title,
      upmore: { brief: { items: briefItems, relevant: briefRelevant, precision: briefItems ? +(briefRelevant / briefItems).toFixed(4) : 1, outside_slot_items: outsideSlots, precision_excluding_outside_slot: briefItems - outsideSlots ? +(briefRelevant / (briefItems - outsideSlots)).toFixed(4) : 1, misses: briefMisses }, alerts: { truth_events: truthAlertEvents.size, hit_events: hitEvents.size, recall: truthAlertEvents.size ? +(hitEvents.size / truthAlertEvents.size).toFixed(4) : 1, false_per_week: falseAlerts.length, duplicate_per_week: duplicateAlerts.length, false_alerts: falseAlerts, duplicate_alerts: duplicateAlerts, missed_events: missed }, clustering: { fragmented, merged } },
      baselines: {
        raw_firehose: { items_per_week: d.stories.length, precision: +(relevantStories / d.stories.length).toFixed(4), interruptions_per_week: d.stories.length },
        generic_app_notifications: { note: "a ping for every story naming a held ticker or company, syndicated copies included; a model of that behavior, not any app's code", interruptions_per_week: generic.length, pings_per_alert_event: genericEvents ? +(genericTrue / genericEvents).toFixed(1) : 0, precision_vs_alert_truth: generic.length ? +(genericTrue / generic.length).toFixed(4) : 1, false_per_week: generic.length - genericTrue }
      }
    };
  }
  const agg = key => Object.values(personas).map(key);
  const totals = {
    brief_precision_min: Math.min(...agg(x => x.upmore.brief.precision)), brief_precision_mean: +(agg(x => x.upmore.brief.precision).reduce((a, b) => a + b, 0) / agg(x => 1).length).toFixed(4),
    alert_recall_min: Math.min(...agg(x => x.upmore.alerts.recall)), false_alerts_per_week_max: Math.max(...agg(x => x.upmore.alerts.false_per_week)),
    duplicate_alerts_per_week_max: Math.max(...agg(x => x.upmore.alerts.duplicate_per_week)), fragmented_events: agg(x => x.upmore.clustering.fragmented.length).reduce((a, b) => a + b, 0), merged_clusters: agg(x => x.upmore.clustering.merged.length).reduce((a, b) => a + b, 0),
    baseline_raw_precision_max: Math.max(...agg(x => x.baselines.raw_firehose.precision)), baseline_generic_false_per_week_min: Math.min(...agg(x => x.baselines.generic_app_notifications.false_per_week))
  };
  return { stories: d.stories.length, personas, totals };
}

function table(res) {
  const lines = [`news relevance: ${res.stories} stories, ${Object.keys(res.personas).length} personas`];
  lines.push("persona  brief items  precision  excl. slot  alert recall  false/wk  dup/wk  fragmented  merged   raw prec  generic pings/wk  generic false/wk");
  for (const [id, p] of Object.entries(res.personas)) lines.push(`${id.padEnd(8)} ${String(p.upmore.brief.items).padStart(11)}  ${String(p.upmore.brief.precision).padStart(9)}  ${String(p.upmore.brief.precision_excluding_outside_slot).padStart(10)}  ${String(p.upmore.alerts.recall).padStart(12)}  ${String(p.upmore.alerts.false_per_week).padStart(8)}  ${String(p.upmore.alerts.duplicate_per_week).padStart(6)}  ${String(p.upmore.clustering.fragmented.length).padStart(10)}  ${String(p.upmore.clustering.merged.length).padStart(6)}   ${String(p.baselines.raw_firehose.precision).padStart(8)}  ${String(p.baselines.generic_app_notifications.interruptions_per_week).padStart(16)}  ${String(p.baselines.generic_app_notifications.false_per_week).padStart(16)}`);
  lines.push(`totals: brief precision min ${res.totals.brief_precision_min} (mean ${res.totals.brief_precision_mean}), alert recall min ${res.totals.alert_recall_min}, false alerts/week max ${res.totals.false_alerts_per_week_max}`);
  return lines.join("\n");
}

module.exports = { run, load, table, visible };
if (require.main === module) {
  const vm = require("node:vm"); const ctx = vm.createContext({});
  vm.runInContext(["45-advice-guard.js", "55-agent-news.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.N=AgentNews;", ctx);
  const res = run(ctx.N); console.log(table(res));
  for (const [id, p] of Object.entries(res.personas)) { if (p.upmore.alerts.missed_events.length) console.log(id, "missed", JSON.stringify(p.upmore.alerts.missed_events)); if (p.upmore.alerts.false_alerts.length) console.log(id, "false alerts", JSON.stringify(p.upmore.alerts.false_alerts.map(f => f.title))); if (p.upmore.brief.misses.length) console.log(id, "brief misses", JSON.stringify(p.upmore.brief.misses.map(m => `${m.day}: ${m.title} [${m.why}]`), null, 0)); if (p.upmore.alerts.duplicate_alerts.length) console.log(id, "duplicate alerts", JSON.stringify(p.upmore.alerts.duplicate_alerts)); }
  const p1 = Object.values(res.personas)[0]; if (p1.upmore.clustering.fragmented.length) console.log("fragmented", JSON.stringify(p1.upmore.clustering.fragmented)); if (p1.upmore.clustering.merged.length) console.log("merged", JSON.stringify(p1.upmore.clustering.merged.slice(0, 8)));
}
