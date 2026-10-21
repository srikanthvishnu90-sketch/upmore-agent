"""Read saved scored evidence only. No model/API clients or product writes."""
import collections, hashlib, json, pathlib, sys
p=pathlib.Path(sys.argv[1]); raw=p.read_bytes(); a=json.loads(raw)
assert hashlib.sha256(raw).hexdigest()=='72539f4b441f29c9a35e3f68385e2d15b01cb91aca57979a7bdbe08472ddd927'
assert a['identity']['source_commit']=='1ec88f3cca4b21200be5c4f16ba2a948a72614b0'
assert a['status']=='SCORED' and len(a['items'])==320
assert sum(bool(i['pass']) for i in a['items'])==111
failed=[i for i in a['items'] if not i['pass']]
assert len(failed)==209
for i in a['items']:
 assert hashlib.sha256(i['judging_packet'].encode()).hexdigest()==i['judging_packet_sha256']
def counts(xs): return dict(collections.Counter(xs).most_common())
summary={'source_commit':a['identity']['source_commit'],'result_sha256':hashlib.sha256(raw).hexdigest(),'cost_usd':a['ledger']['usd_micros']/1e6,'n':320,'passed':111,'failed':209,
 'judge_passes':{m:sum(j['pass'] for i in a['items'] for j in i['judges'] if j['model']==m)for m in ['gpt-5-mini','gpt-4.1-mini']},
 'judge_combinations':counts(''.join('P'if j['pass']else'F'for j in i['judges'])for i in a['items']),
 'product_failure_codes':counts(x for i in failed for x in i.get('product_failures',[])),
 'trace_stops_failed':counts(t.get('stopped')for i in failed for t in i.get('trace',[])),
 'trace_stops_passed':counts(t.get('stopped')for i in a['items']if i['pass']for t in i.get('trace',[])),
 'failed_by_category':counts(i['category']for i in failed),
 'failed_turn_count':counts(len(i.get('replies',[]))for i in failed)}
print('ANALYSIS_AGGREGATE '+json.dumps(summary,separators=(',',':')))
for i in failed:
 # Stored judge reasons + actual replies are analyst evidence, not new judge calls.
 # Do not print original user turns, persona, must/must-not, or the full packet.
 detail={k:i.get(k) for k in ['id','category','development_overlap','judges','product_failures','trace','replies']}
 print('ANALYST_PRIVATE_ITEM '+json.dumps(detail,separators=(',',':')))
