const currency={file:'69-agent-router.js',find:' || amountCorrection(text)',replace:''};
const split={file:'70-agent-split.js',find:'const cls = amountEdit ?',replace:'const cls = false ?'};
const cancellation={file:'68-agent-cancel.js',find:'last_mentioned = sub.merchant;\n        const r = route(sub)',replace:'last_mentioned = null;\n        const r = route(sub)'};
const status={file:'69-agent-router.js',find:'&& SETTLED_STATUS.test(text)',replace:'&& false'};
const repeat={file:'69-agent-router.js',find:'// Keep the original timestamp: another duplicate may arrive, but cannot extend this window.',replace:'memo.settled = null;'};
const make=(sub,title,patch)=>({id:'D'+sub.slice(1),sub,title,test:title,defect:`Break ${title.toLowerCase()} in a parseable production module`,patches:[patch]});
module.exports=[
 make('S01','Exact currency correction',currency),make('S02','Retained correction facts',currency),make('S03','Fresh approval after correction',currency),
 make('S04','Recalculated split shares',split),make('S05','Retained split context',split),
 make('S06','Numbers in questions are not corrections',{file:'70-agent-split.js',find:'const cls = amountEdit ?',replace:'const cls = (amountEdit || /\\d/.test(String(text))) ?'}),
 make('S07','Blocked cancellation referent',cancellation),make('S08','Newest merchant referent',cancellation),
 make('S09','Ambiguous category cannot invent referent',{file:'68-agent-cancel.js',find:'last_mentioned = sub.merchant;\n        const r = route(sub)',replace:'last_mentioned = "streaming";\n        const r = route(sub)'}),
 make('S10','Honest staged status',status),
 make('S11','Transaction-evidenced posting',{file:'69-agent-router.js',find:'const posted = matches && stored.landed;',replace:'const posted = false;'}),
 make('S12','Unrelated questions retain ownership',{file:'69-agent-router.js',find:'&& SETTLED_STATUS.test(text)',replace:'&& true'}),
 make('S13','Repeated approval settlement memory',repeat),
 make('S14','Original repeat time window',{file:'69-agent-router.js',find:'// Keep the original timestamp: another duplicate may arrive, but cannot extend this window.',replace:'memo.settled.at = now;'}),
 make('S15','Latest settled goal',{file:'69-agent-router.js',find:'memo.settled = { flow, outcome:',replace:'memo.settled = memo.settled || { flow, outcome:'}),
];
