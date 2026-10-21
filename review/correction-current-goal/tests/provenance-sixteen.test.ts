// Owner-authorized permanent fail-first writer/source gate. Invented fixtures only; no provider, DB, browser or corpus.
// Canonical correction writer stays untouched. Run explicitly while its source-reconciliation fix is pending.
import { careerTools } from '../../../supabase/functions/_shared/agent/career_tools.ts';
const USER = 'SYN-CORRECTION-PROVENANCE', NOW = Date.UTC(2026, 9, 21, 19);
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
function eq(a: unknown, b: unknown, message: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(message + ': ' + JSON.stringify(a)); }
const oldWords = 'Data analyst role in Austin', newWords = 'UX designer role in Denver';
const pool = [
  { job_id: 'SYN-OLD-JOB', company: 'Synthetic Old', title: 'Data analyst', location: 'Austin', url: 'https://example.test/old', description: 'Data analyst', first_seen_at: '2026-10-21T12:00:00Z' },
  { job_id: 'SYN-NEW-JOB', company: 'Synthetic New', title: 'UX designer', location: 'Denver', url: 'https://example.test/new', description: 'UX designer', first_seen_at: '2026-10-20T12:00:00Z' },
];
function seed(metadata: Record<string, unknown> = {}, wrapper: Record<string, unknown> = {}): any {
  return { ...wrapper, preferences: { roles: ['Data analyst'], locations: ['Austin'], remote: 'hybrid', compFloor: '$80000', targetCompanies: ['Synthetic Co'] }, facts: [
    { id: 'SYN-CURRENT', kind: 'goal', text: oldWords, source: 'user', status: 'confirmed', needs_confirmation: false },
    { id: 'SYN-OTHER', kind: 'goal', text: oldWords, status: 'confirmed', needs_confirmation: false, ...metadata },
  ] };
}
async function correctionThenSearch(profile: any) {
  const tools = careerTools({ postings: async () => pool });
  const correct = tools.find(t => t.name === 'correct_profile_fact')!, search = tools.find(t => t.name === 'search_jobs')!;
  const c: any = { userId: USER, threadId: 'SYN-OLD-THREAD', now: NOW, state: { profile }, turn: { message: 'Actually, my goal is UX designer role in Denver.', added: [] } };
  const r: any = await correct.run({ id: 'SYN-CURRENT', text: newWords }, c);
  eq([r.fact.id, r.fact.text, r.fact.status, r.fact.needs_confirmation], ['SYN-CURRENT', newWords, 'draft', true], 'correction must remain a stable-id unconfirmed user draft');
  eq(r.fact.corrected_from, oldWords, 'old words belong in audit');
  // Fresh-turn input crosses the same JSON boundary as persisted owned state. No old chat is supplied to the search.
  const persisted = JSON.parse(JSON.stringify(profile)), before = JSON.stringify(persisted);
  c.state = { profile: persisted }; c.threadId = 'SYN-FRESH-THREAD'; c.turn = { message: 'Find jobs for my current goal.', added: [] };
  const result: any = await search.run({}, c);
  eq(JSON.stringify(persisted), before, 'search cannot rewrite profile or confirm drafts');
  return { profile: persisted, result };
}
const denied: [string, Record<string, unknown>][] = [
  ['rejected fact', { status: 'rejected' }], ['quarantined fact', { quarantined: true }],
  ['agent source', { source: 'agent' }], ['generated source alias', { source: 'AGENT_GENERATED' }],
  ['nested assistant source', { provenance: { source: 'assistant' } }],
  ['direct generated provenance', { provenance: 'agent-generated' }], ['direct spaced model provenance', { provenance: 'model generated' }],
  ['AI source alias', { source: 'ai' }], ['inferred source', { source: 'inferred' }],
];
for (const [label, metadata] of denied) Deno.test(`correction provenance: ${label} cannot preserve replaced role/place after persistence`, async () => {
  const { profile, result } = await correctionThenSearch(seed(metadata));
  assert(!profile.preferences.roles.includes('Data analyst') && !profile.preferences.locations.includes('Austin'), 'denied fact kept obsolete cache entries: ' + JSON.stringify(profile.preferences));
  eq(result.goal, { roles: ['ux', 'designer'], places: ['denver'], remote: false }, 'denied prior goal steered next search');
  eq(result.postings[0].job_id, 'SYN-NEW-JOB', 'obsolete goal posting ranked before corrected goal');
  assert(result.postings[0].role_match, 'corrected goal lost full match');
  eq([profile.preferences.remote, profile.preferences.compFloor, profile.preferences.targetCompanies], ['hybrid', '$80000', ['Synthetic Co']], 'unrelated preferences changed');
});
for (const [label, wrapper] of [
  ['agent profile', { source: 'agent' }], ['string provenance profile', { provenance: 'model-generated' }],
  ['nested denied profile', { provenance: { unproven: true } }], ['rejected profile', { status: 'rejected' }],
] as const) Deno.test(`correction provenance: ${label} cannot lend authority to other goal rows or preference cache`, async () => {
  const { profile, result } = await correctionThenSearch(seed({ source: 'user' }, wrapper));
  assert(!profile.preferences.roles.includes('Data analyst') && !profile.preferences.locations.includes('Austin'), 'denied profile container preserved stale cache');
  eq(result.goal, null, 'denied profile container supplied search intent');
});
for (const status of ['confirmed', 'draft']) Deno.test(`correction provenance control: own ${status} alternate preference survives`, async () => {
  const p = seed(); p.facts.splice(1); p.preferences.roles.push('Product manager'); p.preferences.locations.push('Boston');
  p.facts.push({ id: 'SYN-ALTERNATE', kind: 'preference', text: 'Also open to Product manager roles in Boston', source: 'user', status, needs_confirmation: status === 'draft' });
  const { profile, result } = await correctionThenSearch(p);
  eq(profile.preferences.roles, ['Product manager'], 'independently stated role was dropped or old role remained');
  eq(profile.preferences.locations, ['Boston'], 'independently stated place was dropped or old place remained');
  eq(result.goal, { roles: ['product', 'manager', 'ux', 'designer'], places: ['boston', 'denver'], remote: false }, 'user alternate and new draft must both steer search');
});
Deno.test('correction provenance control: a separately current user goal may retain the same role/place', async () => {
  const { profile, result } = await correctionThenSearch(seed({ source: 'user', status: 'draft', needs_confirmation: true, provenance: 'owner stated this alternate goal' }));
  eq(profile.preferences.roles, ['Data analyst'], 'a legitimate separate user goal lost its cache');
  assert(result.goal.roles.includes('data') && result.goal.roles.includes('ux') && result.goal.places.includes('austin') && result.goal.places.includes('denver'), 'legitimate current/draft alternatives were erased');
});
