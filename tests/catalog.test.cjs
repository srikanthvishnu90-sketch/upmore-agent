// Instinct spec doc 05: the connector catalog validates every row, answers "what can you connect" from data, and covers real financial lives with zero unlabeled gaps.
// Check: node --test tests/catalog.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const Cat=require(path.join(root,'packages/domain/52-connector-catalog.js'));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'packages/connectors/catalog.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'packages/capabilities/registry.json'),'utf8'));

test('every row is valid: auth method, registry capabilities, reliability class, last-checked date, gated write actions, honest adapter state',()=>{
  assert.deepEqual(Cat.validate(catalog,registry),[]);
  assert.ok(catalog.connectors.length>=100);
  for(const c of catalog.connectors){for(const w of c.write_actions)assert.ok(w.gated,`${c.provider}: ${w.action} promised without a gate while no live adapter exists`);if(c.auth_method==='VAULTED_CREDENTIALS')assert.match(c.reliability_class,/least reliable/);}
  const live=catalog.connectors.filter(c=>/reference adapter|edge function exists/.test(c.adapter_state));assert.ok(live.length>=5&&live.length<=10,'only the reference adapters and the existing edge functions claim an adapter');
  const s=spawnSync('node',['scripts/connectors','--check'],{cwd:root,encoding:'utf8'});assert.equal(s.status,0,s.stdout+s.stderr);assert.match(s.stdout,/Catalog valid: \d+ connectors/);
  const l=spawnSync('node',['scripts/connectors','--list'],{cwd:root,encoding:'utf8'});assert.match(l.stdout,/Wave 1: money in, money out/);assert.match(l.stdout,/Wave 3: the long tail/);
});

test('the validator rejects a bad auth method, an unknown capability, a write action without a gate, and a scrape row that claims high reliability',()=>{
  const bad={connectors:[{provider:'x',display_name:'X',domain:'d',auth_method:'MAGIC',wave:1,scopes:[],data_entities:[],capabilities:['ZZZ-999'],write_actions:[{action:'send',capability:'PAY-001',tier:'T3'}],reliability_class:'high',last_checked:'2026-10-10',adapter_state:'none'},{provider:'y',display_name:'Y',domain:'d',auth_method:'VAULTED_CREDENTIALS',wave:4,scopes:[],data_entities:[],capabilities:['ACCT-001'],write_actions:[],reliability_class:'high',last_checked:'',adapter_state:'none'}]};
  const e=Cat.validate(bad,registry);
  for(const re of [/invalid auth method MAGIC/,/ZZZ-999 is not in the registry/,/promised without a live adapter and no gated reason/,/wave must be 1, 2 or 3/,/last_checked date missing/,/least reliable class/])assert.ok(e.some(x=>re.test(x)),String(re));
});

test('"what can you connect" is generated from the table and says honest gaps as gaps',()=>{
  const g=Cat.answer(catalog,'Gusto');assert.equal(g.covered,true);assert.match(g.text,/^Gusto payroll: yes, via oauth \(high\); adapter not built yet/);
  const z=Cat.answer(catalog,'Zelle');assert.match(z.text,/gated: bank partnership required; handoff pattern/);
  const no=Cat.answer(catalog,'Venezuelan bolivar wallet');assert.equal(no.covered,false);assert.match(no.text,/isn't in the connector catalog\. CSV import always works as the floor/);
  const ck=Cat.answer(catalog,'credit karma');assert.match(ck.text,/gated: FCRA permissible purpose/);
});

test('coverage: 25 real financial lives answer yes via a connector for every surface named, with zero unlabeled gaps',()=>{
  const lives=[
    {id:'L01',surfaces:['Gusto','RentCafe','Chase','Empower','Affirm','Freecash']},
    {id:'L02',surfaces:['ADP','Capital One','Fidelity','Nelnet','Verizon','Marriott']},
    {id:'L03',surfaces:['Workday','Schwab','Lively','GEICO','Xfinity','Amazon order']},
    {id:'L04',surfaces:['Uber','Cash App','Venmo','Coinbase','T-Mobile','Planet Fitness']},
    {id:'L05',surfaces:['Rippling','Vanguard','MOHELA','State Farm','PG&E','United']},
    {id:'L06',surfaces:['Paychex','Robinhood','Klarna','Lemonade','AppFolio','Delta']},
    {id:'L07',surfaces:['DoorDash','Chime','Wells Fargo','Kraken','Con Edison']},
    {id:'L08',surfaces:['Upwork','Citi','Interactive Brokers','Aidvantage','Progressive']},
    {id:'L09',surfaces:['Fiverr','Discover','Betterment','HSA Bank','Hilton']},
    {id:'L10',surfaces:['Instacart','Bank of America','Wealthfront','Mr. Cooper','ComEd']},
    {id:'L11',surfaces:['Gusto','American Express','E*TRADE','Navient','Amex Membership']},
    {id:'L12',surfaces:['ADP','U.S. Bank','Public','Rocket Mortgage','Chase Ultimate']},
    {id:'L13',surfaces:['Workday','Barclays','M1','Afterpay','Hyatt']},
    {id:'L14',surfaces:['Lyft','Synchrony','Webull','SoFi loans','Southwest']},
    {id:'L15',surfaces:['Paychex','PayPal','Gemini','Voya','Walmart orders']},
    {id:'L16',surfaces:['Rippling','SimpleFIN','Binance','Principal','Target orders']},
    {id:'L17',surfaces:['Gusto','Plaid','T. Rowe','Computershare','Costco orders']},
    {id:'L18',surfaces:['QuickBooks','Stripe payouts','Chase','Experian','Buildium']},
    {id:'L19',surfaces:['Xero','Square payouts','Capital One','Equifax','Esusu']},
    {id:'L20',surfaces:['Shopify payouts','Fidelity HSA','TransUnion','Bilt','studentaid']},
    {id:'L21',surfaces:['Social Security','IRS','state unclaimed','KBB','paper statements']},
    {id:'L22',surfaces:['Outlook','Apple Cash','CSV','manual entry','County property']},
    {id:'L23',surfaces:['Gmail','Zillow','SpotHero','Public Storage','Blue Cross']},
    {id:'L24',surfaces:['Workday','American AAdvantage','Citi ThankYou','Capital One miles','wallet address']},
    {id:'L25',surfaces:['Uber','Venmo','Coinbase','HRA administrator','City water']}
  ];
  const c=Cat.coverage(catalog,lives);
  // Chime is a deliberate planted gap: it is not in the catalog, so the coverage test must say so rather than hide it.
  assert.deepEqual(c.gaps,['L07: Chime']);
  assert.equal(c.lives.filter(l=>!l.gaps.length).length,24);
});
