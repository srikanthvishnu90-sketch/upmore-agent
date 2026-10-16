'use strict';
// Deliberate defects, applied only in a disposable detached worktree.
const file='packages/domain/141-career-doorstep.js';
module.exports=[
 {id:'missing-persistence',file,from:'    persist();',to:'    // injected: dropped durable halt write'},
 {id:'halted-work-revived',file,from:'    if (item.status === "halted" || q.halted) return { applied: false, reason: "queue is halted — events cannot revive a halted item", item_status: item.status };',to:'    // injected: halted events incorrectly reach status update'},
 {id:'duplicate-event-not-deduped',file,from:'    if (q.processed_event_ids.includes(ev.event_id)) return { applied: false, deduped: true, reason: "duplicate event_id — already processed once" };',to:'    // injected: duplicate event guard removed'},
 {id:'prior-delivery-count-denied',file,from:'sent_count: sentAlready.length, in_flight_count:',to:'sent_count: 0, in_flight_count:'},
 {id:'unreadable-queue-counts-invented',file,from:'halted_count: null, sent_count: null, in_flight_count: null',to:'halted_count: 0, sent_count: 0, in_flight_count: 0'},
 {id:'unreadable-queue-pause-not-reported',file,from:'counts_verified: false,\n        global_pause_set: true',to:'counts_verified: false,\n        global_pause_set: false'},
];
