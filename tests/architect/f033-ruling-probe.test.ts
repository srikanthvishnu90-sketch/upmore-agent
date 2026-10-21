// F-033 ruling regression (second judge, 2026-10-21; frs-qa acceptance probe of 98648920): through the real correction and
// search tools, the owner's bank facts (D-007 range in factId, or delegated/answer-all provenance) and anything derived from
// them never keep a superseded role or place nor steer search; a person's own chat facts F-027..F-079 and their own
// derivations do; a missing parent blocks. Synthetic data; no network, no model.
import { careerTools } from '../../supabase/functions/_shared/agent/career_tools.ts';
import { goalOf } from '../../supabase/functions/_shared/career_search.ts';
const oldWords = 'Data analyst role in Austin', newWords = 'UX designer role in Denver';
function assert(v: unknown, m: string): asserts v { if (!v) throw new Error(m); }
const row = (id: any, text: string, extra: any = {}) => ({ id, kind: 'goal', text, source: 'user', status: 'confirmed', needs_confirmation: false, ...extra });
const pool = [
 { job_id: 'SYN-OLD', company: 'S', title: 'Data analyst', location: 'Austin', description: 'Data analyst', url: 'https://example.test/old' },
 { job_id: 'SYN-NEW', company: 'S', title: 'UX designer', location: 'Denver', description: 'UX designer', url: 'https://example.test/new' },
];
async function run(others: any[]) {
 const profile = { preferences: { roles: ['Data analyst'], locations: ['Austin'], remote: 'hybrid' }, facts: [row('SYN-CURRENT', oldWords), ...others] };
 const tools = careerTools({ postings: async () => pool }), c: any = { userId: 'SYN', threadId: 'T1', now: 0, state: { profile }, turn: { message: 'Actually my goal is UX designer role in Denver.', added: [] } };
 await tools.find((t: any) => t.name === 'correct_profile_fact')!.run({ id: 'SYN-CURRENT', text: newWords }, c);
 const persisted = JSON.parse(JSON.stringify(profile)); c.state = { profile: persisted }; c.threadId = 'T2'; c.turn = { message: 'Find jobs for my current goal.', added: [] };
 const result: any = await tools.find((t: any) => t.name === 'search_jobs')!.run({}, c);
 return { profile: persisted, result };
}
async function blocked(name: string, others: any[]) {
 const { profile, result } = await run(others);
 assert(!profile.preferences.roles.includes('Data analyst') && !profile.preferences.locations.includes('Austin'), name + ' preserved cache: ' + JSON.stringify(profile.preferences));
 assert(JSON.stringify(result.goal) === JSON.stringify({ roles: ['ux','designer'], places: ['denver'], remote: false }), name + ' steered search: ' + JSON.stringify(result.goal));
 const g = goalOf({ facts: JSON.parse(JSON.stringify(others)) });
 assert(!g || (!g.roles.includes('data') && !g.places.includes('austin')), name + ' goalOf steered: ' + JSON.stringify(g));
}
async function kept(name: string, others: any[]) {
 const { profile, result } = await run(others);
 assert(profile.preferences.roles.includes('Data analyst') && profile.preferences.locations.includes('Austin'), name + ' lost cache: ' + JSON.stringify(profile.preferences));
 assert(result.goal.roles.includes('data') && result.goal.places.includes('austin'), name + ' lost from search: ' + JSON.stringify(result.goal));
}
// (a) bank factId F-040 with any id
for (const id of ['F-040', 'F-001', 'SYN-ANY', 'F-100', 'F-040 ', '', undefined, 7]) Deno.test(`a: bank factId F-040 id=${JSON.stringify(id)}`, () => blocked('a', [row(id, oldWords, { factId: 'F-040' })]));
for (const fid of ['F-27', 'F-079', 'F-0055', ' F-033 ']) Deno.test(`a: bank factId spelling ${fid}`, () => blocked('a', [row('SYN-B', oldWords, { factId: fid })]));
// (b) chains rooted in a bank row
for (const ref of ['SYN-BANK', 'F-040']) for (const key of ['derived_from', 'derivedFrom']) {
 Deno.test(`b: direct via ${key}=${ref}`, () => blocked('b', [row('SYN-BANK', 'skill', { kind: 'skill', factId: 'F-040' }), row('SYN-C1', oldWords, { [key]: [ref] })]));
 Deno.test(`b: 2-deep via ${key}=${ref}`, () => blocked('b', [row('SYN-C2', oldWords, { [key]: ['SYN-C1'] }), row('SYN-C1', 'mid', { kind: 'preference', [key]: [ref] }), row('SYN-BANK', 'skill', { kind: 'skill', factId: 'F-040' })]));
}
Deno.test('b: bank root whose id is own-chat-looking F-030', () => blocked('b', [row('F-030', 'skill', { kind: 'skill', factId: 'F-040' }), row('SYN-C1', 'mid', { kind: 'preference', derived_from: ['F-030'] }), row('SYN-C2', oldWords, { derived_from: ['SYN-C1'] })]));
Deno.test('b: mixed parents, one own one bank', () => blocked('b', [row('F-030', 'own', { kind: 'preference' }), row('SYN-BANK', 'skill', { kind: 'skill', factId: 'F-040' }), row('SYN-C1', oldWords, { derived_from: ['F-030', 'SYN-BANK'] })]));
// (c) own chat facts F-027..F-079 and own derivations
for (let n = 27; n <= 79; n++) {
 const id = 'F-0' + n;
 Deno.test(`c: own ${id}`, () => kept('c', [row(id, oldWords)]));
 Deno.test(`c: own lineage via ${id} direct+2deep`, () => kept('c', [row(id, 'I prefer analytical work', { kind: 'preference' }), row('F-080', 'mid', { kind: 'preference', derived_from: [id] }), row('F-081', oldWords, { derivedFrom: ['F-080'], derived_from: [id] })]));
}
// (d) provenance always blocks
for (const prov of ['owner-delegated answer-all', 'owner-delegated', 'answer-all', 'Owner-Delegated (answer-all bank)']) for (const id of ['F-030', 'SYN-P', 'F-001']) {
 Deno.test(`d: provenance ${prov} id=${id}`, () => blocked('d', [row(id, oldWords, { provenance: prov })]));
 Deno.test(`d: child of provenance ${prov} parent id=${id}`, () => blocked('d', [row(id, 'x', { kind: 'skill', provenance: prov }), row('SYN-K', oldWords, { derived_from: [id] })]));
}
// (e) absent parent blocks
for (const ref of ['F-031', 'SYN-NOPE', 'F-001', 'F-100']) Deno.test(`e: absent parent ${ref}`, () => blocked('e', [row('SYN-E', oldWords, { derived_from: [ref] })]));
Deno.test('e: absent grandparent', () => blocked('e', [row('SYN-E2', oldWords, { derived_from: ['SYN-E1'] }), row('SYN-E1', 'mid', { kind: 'preference', derived_from: ['F-045'] })]));
