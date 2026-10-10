// Instinct spec doc 10: the news brain on a fixture firehose. Clustering collapses syndicated repeats, owned-name material events alert,
// the brief orders by personal relevance, mute suppresses the topic, alerts pass the advice guard, quiet hours hold.
// Check: node --test tests/news.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
vm.runInContext(['45-advice-guard.js','55-agent-news.js'].map(f=>fs.readFileSync(path.join(root,'packages/domain',f),'utf8')).join('\n')+'\nthis.N=AgentNews;',ctx);
const N=ctx.N;
const NOW=Date.UTC(2026,9,10,14,0,0);
const user={holdings:[{symbol:'NVDA',name:'Nvidia',sector:'semiconductors'},{symbol:'PLTR',name:'Palantir',sector:'software'},{symbol:'VTI',name:'Vanguard Total Market'}],watchlist:[{symbol:'CRM',name:'Salesforce'}],private_holdings:[{name:'Nebius',aliases:['Nebius Group']}],employer:'Acme Robotics',screens:[{sectors:['ai infrastructure']}]};
// The firehose: 200 stories. Planted: an Nvidia earnings event syndicated across 12 outlets, a Palantir regulator probe across 6, a Salesforce acquisition of a watchlist name across 8, a Nebius funding round, 20 market-noise pieces, the rest unrelated.
function firehose(){
  const s=[];let i=0;const push=(title,summary,source,hoursAgo,extra)=>s.push(Object.assign({id:'s'+(++i),title,summary,source,link:'https://example.test/'+i,published_at:NOW-hoursAgo*3600000},extra||{}));
  const nv=['Nvidia beats estimates as data center revenue doubles','Nvidia beats estimates, data center revenue doubles','Nvidia tops Wall Street estimates on data center demand','Nvidia posts record quarter, beats estimates','Nvidia Q3 results beat estimates on AI chips','Nvidia beats; data center revenue doubles again','Nvidia earnings beat expectations as data center sales double','Nvidia beats estimates on surging data center revenue','Nvidia quarterly results beat estimates','Nvidia beats estimates; shares jump after hours','Nvidia earnings: data center revenue doubles, beats estimates','Nvidia beats estimates on data center strength'];
  nv.forEach((t,k)=>push(t,'Nvidia reported quarterly results with data center revenue doubling from a year ago. The company raised guidance for next quarter.',['Reuters','WSJ','Bloomberg','CNBC','TechCrunch','AP','blog','forum','The Information','FT','blog','CNBC'][k],1+k*0.2,{cluster_key:'nvda-q3'}));
  const pl=['SEC probe into Palantir contracts disclosed in filing','Palantir discloses SEC investigation into government contracts','Regulator probe into Palantir contracts revealed','Palantir faces SEC probe over contract accounting','SEC investigation into Palantir contracts: what we know','Palantir under SEC probe, filing shows'];
  pl.forEach((t,k)=>push(t,'Palantir disclosed an SEC investigation into contract accounting in a regulatory filing. The company says it is cooperating.',['SEC EDGAR','Reuters','Bloomberg','blog','CNBC','WSJ'][k],3+k*0.3,{cluster_key:'pltr-sec'}));
  const cr=['Salesforce to acquire Informatica for $8 billion','Salesforce agrees to buy Informatica in $8 billion deal','Salesforce acquires Informatica, $8B','Salesforce buys Informatica for $8 billion','Salesforce-Informatica $8 billion acquisition announced','Salesforce to buy Informatica: $8 billion','Salesforce acquisition of Informatica valued at $8 billion','Informatica agrees to be acquired by Salesforce for $8 billion'];
  cr.forEach((t,k)=>push(t,'Salesforce agreed to acquire Informatica for $8 billion in cash. The deal is expected to close next year.',['Reuters','WSJ','TechCrunch','Bloomberg','CNBC','AP','FT','blog'][k],5+k*0.2,{cluster_key:'crm-infa'}));
  push('Nebius Group raises $700 million for AI infrastructure build-out','Nebius Group raised $700 million in a funding round led by institutional investors. The money funds AI infrastructure capacity in Europe.','TechCrunch',8,{cluster_key:'nebius-raise'});
  push('Fed holds rates steady, signals patience on cuts','The Federal Reserve held rates steady and signaled it would wait for more inflation data. Markets had expected the hold.','Reuters',2,{cluster_key:'fed-hold'});
  for(let k=0;k<20;k++)push(['Stocks mixed as traders weigh earnings','Dow rises 40 points in quiet session','S&P slips ahead of Fed','Markets wrap: stocks edge higher','What to watch in markets today'][k%5]+' ('+k+')','Major indexes moved little on light volume. Traders are waiting for data.',['CNBC','blog','AP','Reuters','blog'][k%5],k+1);
  const filler=['Local bakery expands to second location','Airline adds route to Lisbon','New EV pickup gets mixed reviews','City council debates parking rules','Regional bank opens branch in Tulsa','Coffee chain tests oat milk latte','Streaming service raises prices again','Smartphone maker unveils foldable','Retailer reports strong back-to-school','Insurer expands pet coverage','Shipping rates fall on weak demand','Startup launches budgeting app','Utility proposes rate increase','Casino operator buys land in Vegas','Toy maker warns on tariffs','Fast food chain launches value menu','Automaker recalls 20,000 trucks','Grocer expands delivery','Hotel chain opens in Austin','Wireless carrier adds plan'];
  for(let k=0;s.length<200;k++)push(filler[k%filler.length]+' #'+k,'Details in the report. Analysts expect modest impact.',['blog','AP','CNBC','forum','Reuters'][k%5],10+k);
  return s;
}

test('clustering collapses the syndicated repeats to one story per event and keeps the best source',()=>{
  const r=N.run(firehose(),user,{now:NOW});
  const byKey=k=>r.clusters.filter(c=>c.story.cluster_key===k);
  assert.equal(byKey('nvda-q3').length,1);assert.equal(byKey('nvda-q3')[0].sources,12);assert.ok(['Reuters','WSJ','Bloomberg','SEC EDGAR'].includes(byKey('nvda-q3')[0].story.source),'best source wins');
  assert.equal(byKey('pltr-sec').length,1);assert.equal(byKey('pltr-sec')[0].sources,6);assert.equal(byKey('pltr-sec')[0].story.source,'SEC EDGAR');
  assert.equal(byKey('crm-infa').length,1);assert.equal(byKey('crm-infa')[0].sources,8);assert.equal(byKey('crm-infa')[0].event,'acquisition');
  assert.ok(r.clusters.length<=200-11-5-7,'duplicates collapsed');
});

test('the three portfolio-relevant events score above the alert threshold, noise scores near zero, and decisions follow the operating model',()=>{
  const r=N.run(firehose(),user,{now:NOW});
  const d=k=>r.decisions.find(x=>x.cluster.story.cluster_key===k);
  assert.equal(d('nvda-q3').decision,'alert');assert.ok(d('nvda-q3').score>=1.4);assert.ok(d('nvda-q3').why.some(w=>/you own NVDA/.test(w))&&d('nvda-q3').why.some(w=>/material event: earnings/.test(w)));
  assert.equal(d('pltr-sec').decision,'alert');
  assert.equal(d('crm-infa').decision,'brief','a watchlist acquisition goes to the brief, not an interruption');assert.ok(d('crm-infa').score>0.25);
  assert.equal(d('nebius-raise').decision,'brief');assert.ok(d('nebius-raise').why.some(w=>/private holding Nebius/.test(w)));
  assert.equal(d('fed-hold').decision,'silent','macro without a holdings link does not reach the brief on its own score');
  const noise=r.scored.filter(x=>/Stocks mixed|Dow rises|S&P slips|Markets wrap|What to watch/.test(x.cluster.story.title));assert.ok(noise.length>=5);for(const n of noise)assert.ok(n.score<0.05,n.cluster.story.title);
  assert.equal(r.decisions.filter(x=>x.decision==='alert').length,2,'exactly the two owned-name material events interrupt');
  assert.match(N.explain(d('nvda-q3')),/^Why you're seeing this: you own NVDA/);
});

test('the brief has 5 to 8 items ordered by personal relevance with the most portfolio-relevant first, two-sentence summaries and links, and one broadly material item outside the usual topics',()=>{
  const r=N.run(firehose(),user,{now:NOW});const b=N.brief(r);
  assert.ok(b.count>=5&&b.count<=8);assert.equal(b.first_is_most_relevant,true);assert.match(b.items[0].title,/Nvidia|Palantir/,'an owned-name material event leads, never the acquisition on the watchlist or the macro item');assert.ok(b.items.findIndex(i=>/Salesforce/.test(i.title))>1);
  for(const i of b.items){assert.ok(i.link&&i.summary.split(/(?<=[.!?])\s+/).length<=2,i.title);assert.ok(i.why);}
  assert.ok(b.items.some(i=>/outside your usual topics/.test(i.why)),'anti-filter-bubble item present');
  assert.ok(b.items.some(i=>/Fed holds/.test(i.title)),'the broadly material macro item is the outside item');
});

test('mute feedback suppresses the topic in the next brief, taps raise weights with a cap, weights decay, and alerts pass the advice guard and respect quiet hours',()=>{
  const muted=N.learn(user,{kind:'mute',topic:'Salesforce'});
  const r=N.run(firehose(),muted,{now:NOW});assert.equal(r.decisions.find(x=>x.cluster.story.cluster_key==='crm-infa').decision,'silent');assert.ok(!N.brief(r).items.some(i=>/Salesforce/.test(i.title)));
  const back=N.learn(muted,{kind:'unmute',topic:'Salesforce'});assert.equal(N.run(firehose(),back,{now:NOW}).decisions.find(x=>x.cluster.story.cluster_key==='crm-infa').decision,'brief');
  let u=user;for(let k=0;k<6;k++)u=N.learn(u,{kind:'more',topic:'AI infrastructure'});assert.equal(u.topic_weights['ai infrastructure'],0.6,'capped');
  const d=N.decay(u,30);assert.equal(d.topic_weights['ai infrastructure'],0.3);assert.deepEqual(Object.keys(N.decay(u,400).topic_weights),[]);
  const nv=N.run(firehose(),user,{now:NOW}).decisions.find(x=>x.cluster.story.cluster_key==='nvda-q3');
  const a=N.alert(nv,user);assert.ok(a.text&&a.guard.ok);assert.match(a.text,/This touches NVDA in your portfolio\. https:/);assert.equal(a.tier,'T1');
  const quiet=N.run(firehose(),user,{now:Date.UTC(2026,9,10,3,0,0),quiet:{start:22,end:7,utc_offset_hours:-5}});assert.equal(quiet.decisions.find(x=>x.cluster.story.cluster_key==='nvda-q3').decision,'alert_after_quiet_hours');
  const bad=N.alert({cluster:{story:{title:'You should buy more NVDA now',summary:'It will go up.',link:'x'}},why:['you own NVDA']},user);assert.equal(bad.text,null);assert.equal(bad.guard.ok,false);
});
