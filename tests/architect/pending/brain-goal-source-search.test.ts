// Original synthetic search-source regressions. No corpus, model provider, DB or network.
// A legitimate goal can steer search before confirmation; explicit negative provenance cannot.
import { goalOf } from '../../../supabase/functions/_shared/career_search.ts';
import { careerTools } from '../../../supabase/functions/_shared/agent/career_tools.ts';
import { agentTurn } from '../../../supabase/functions/agent-chat/career_brain.ts';
function ok(v: unknown, why: string): asserts v { if (!v) throw new Error(why); }
function eq(a: unknown, b: unknown, why = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${why}: ${JSON.stringify(a)}`); }
const NOW = Date.UTC(2026, 9, 21, 19), USER = 'SYNTHETIC-SEARCH-SOURCE';
const current = () => ({ id: 'SYN-CURRENT', kind: 'goal', text: 'UX designer role in Denver', source: 'user', status: 'draft', needs_confirmation: true });
const old = (metadata: Record<string, unknown> = {}) => ({ id: 'SYN-OLD', kind: 'goal', text: 'Data analyst role in Austin', status: 'confirmed', needs_confirmation: false, ...metadata });
const pool = [
  { job_id: 'SYN-OLD-JOB', company: 'Synthetic Older Goal', title: 'Data analyst', location: 'Austin', url: 'https://example.test/old', description: 'Data analyst', first_seen_at: '2026-10-21T12:00:00Z' },
  { job_id: 'SYN-NEW-JOB', company: 'Synthetic Current Goal', title: 'UX designer', location: 'Denver', url: 'https://example.test/new', description: 'UX designer', first_seen_at: '2026-10-20T12:00:00Z' },
];
for (const [label, metadata] of [['rejected', { status: 'rejected' }], ['quarantined', { quarantined: true }], ['agent-authored', { source: 'agent' }]] as const) {
  Deno.test(`goal search source: ${label} old goal cannot survive persistence into the actual next-search tool`, async () => {
    // The writer's cache reconciliation is a separate gate. This fixture starts at its correct output boundary.
    const profile = { preferences: { roles: [], locations: [] }, facts: [current(), old(metadata)] };
    const before = JSON.stringify(profile), persisted = JSON.parse(before);
    const search = careerTools({ postings: async () => pool }).find((t) => t.name === 'search_jobs')!;
    const result: any = await search.run({}, { userId: USER, threadId: 'SYN-NEXT-SEARCH', now: NOW, state: { profile: persisted }, turn: { message: 'Find jobs for my current goal.', added: [] } });
    eq(result.goal, { roles: ['ux', 'designer'], places: ['denver'], remote: false }, 'ineligible old words contaminated search');
    eq(result.postings[0].job_id, 'SYN-NEW-JOB', 'older corrected goal ranked before the current goal');
    eq(JSON.stringify(persisted), before, 'reading cannot rewrite stored facts or confirm a draft');
  });
}
Deno.test('goal search source: nested denials and source aliases are excluded before role, place and remote extraction', () => {
  const denied = [{ source: 'model' }, { source: ' LLM ' }, { origin: 'assistant' }, { source: 'model_generated' }, { source: 'AI generated' },
    { unproven: true }, { rejected: true }, { provenance: { unproven: true } }, { provenance: { quarantined: true } }, { provenance: { source: 'agent' } }, { provenance: { origin: 'model-generated' } }];
  for (const metadata of denied) {
    const facts = [current(), { ...old(metadata), text: 'Remote Data analyst role in Austin' }, { ...old(metadata), id: 'SYN-OLD-LOCATION', kind: 'location', text: 'Austin or remote' }];
    eq(goalOf({ facts, preferences: {} }), { roles: ['ux', 'designer'], places: ['denver'], remote: false }, JSON.stringify(metadata));
  }
});
Deno.test('goal search source: a denied profile container cannot lend authority to child facts or preference caches', () => {
  for (const metadata of [{ source: 'agent' }, { provenance: { unproven: true } }, { quarantined: true }]) {
    eq(goalOf({ ...metadata, preferences: { roles: ['Data analyst'], locations: ['Austin'], remote: 'remote' }, basics: { location: 'Austin' }, facts: [current()] }), null);
  }
});
Deno.test('goal search source: denied preference and basics containers cannot leak role, place or remote terms', () => {
  eq(goalOf({ facts: [current()], preferences: { source: 'agent', roles: ['Data analyst'], locations: ['Austin'], remote: 'remote' }, basics: { provenance: { quarantined: true }, location: 'Austin' } }),
    { roles: ['ux', 'designer'], places: ['denver'], remote: false });
});
Deno.test('goal search source controls: legitimate user draft and current alternate goals still steer search', () => {
  const facts = [current(), old({ source: 'user', status: 'draft', needs_confirmation: true })];
  const profile = { facts, preferences: { roles: ['Product manager'], locations: ['Boston'], remote: 'hybrid' } }, before = JSON.stringify(profile);
  eq(goalOf(profile), { roles: ['product', 'manager', 'ux', 'designer', 'data', 'analyst'], places: ['boston', 'denver', 'austin'], remote: false });
  eq(JSON.stringify(profile), before, 'source filtering must not confirm, reorder or delete user rows');
});
Deno.test('goal search source: actual agentTurn receives only current search terms from the tool', async () => {
  const stores = { profile: { preferences: {}, facts: [current(), old({ provenance: { source: 'model-generated' } })] } };
  let calls = 0, observed: any;
  const result = await agentTurn({ stores, userId: USER, threadId: 'SYN-REAL-SEARCH-TURN', now: NOW, history: [], message: 'Find jobs for my current goal.', postings: async () => pool,
    model: async (p) => {
      calls++;
      if (calls === 1) return { content: [{ type: 'tool_use', id: 'synthetic-search', name: 'search_jobs', input: {} }], stop_reason: 'tool_use' };
      for (const m of p.messages) for (const b of Array.isArray(m.content) ? m.content : []) if (b.type === 'tool_result' && b.tool_use_id === 'synthetic-search') observed = JSON.parse(b.content);
      return { content: [{ type: 'text', text: 'Compare the listed responsibilities and schedule before choosing a role.' }], stop_reason: 'end_turn' };
    } });
  eq(result.stopped, 'final'); eq(result.tool_calls.map((c) => [c.name, c.ok]), [['search_jobs', true]]);
  eq(observed.goal, { roles: ['ux', 'designer'], places: ['denver'], remote: false }); eq(observed.postings[0].job_id, 'SYN-NEW-JOB');
});

for (const provenance of ['agent-generated', 'model generated']) for (const scope of ['fact', 'profile', 'preferences', 'basics']) {
  Deno.test(`goal search source: negative provenance string ${provenance} at ${scope} cannot steer the actual search tool`, async () => {
    const profile: any = { preferences: {}, facts: [current()] };
    const expected = { roles: ['ux', 'designer'], places: ['denver'], remote: false };
    if (scope === 'fact') profile.facts.push(old({ provenance }));
    if (scope === 'profile') Object.assign(profile, { provenance, preferences: { roles: ['Data analyst'], locations: ['Austin'], remote: 'remote' } });
    if (scope === 'preferences') profile.preferences = { provenance, roles: ['Data analyst'], locations: ['Austin'], remote: 'remote' };
    if (scope === 'basics') profile.basics = { provenance, location: 'Austin' };
    const before = JSON.stringify(profile), persisted = JSON.parse(before);
    const tool = careerTools({ postings: async () => pool }).find((t) => t.name === 'search_jobs')!;
    const result: any = await tool.run({}, { userId: USER, threadId: 'SYN-STRING-PROVENANCE', now: NOW, state: { profile: persisted }, turn: { message: 'Find jobs for my current goal.', added: [] } });
    eq(result.goal, scope === 'profile' ? null : expected, 'string provenance was ignored');
    eq(JSON.stringify(persisted), before, 'source filtering mutated persisted state');
  });
}
for (const status of ['confirmed', 'draft']) {
  Deno.test(`goal search source control: user provenance strings preserve ${status} alternate goals and preferences`, () => {
    const profile = { provenance: 'user', preferences: { provenance: 'owner stated', roles: ['Product manager'], locations: ['Boston'] },
      facts: [current(), old({ source: 'user', provenance: 'user', status, needs_confirmation: status === 'draft' })] };
    const before = JSON.stringify(profile);
    eq(goalOf(profile), { roles: ['product', 'manager', 'ux', 'designer', 'data', 'analyst'], places: ['boston', 'denver', 'austin'], remote: false });
    eq(JSON.stringify(profile), before, 'own draft/alternate facts were mutated');
  });
}

Deno.test('goal search source: explicit ai/inferred sources and rejected containers are excluded consistently', () => {
  for (const source of ['ai', 'inferred']) {
    eq(goalOf({ facts: [current(), old({ source })], preferences: {} }), { roles: ['ux', 'designer'], places: ['denver'], remote: false }, source);
  }
  const profile = { facts: [current()], preferences: { roles: ['Data analyst'], locations: ['Austin'], remote: 'remote' }, basics: { location: 'Austin' } };
  eq(goalOf({ ...profile, status: 'rejected' }), null, 'rejected profile container');
  eq(goalOf({ facts: [current()], preferences: { ...profile.preferences, status: 'rejected' }, basics: { ...profile.basics, status: 'rejected' } }),
    { roles: ['ux', 'designer'], places: ['denver'], remote: false }, 'rejected child containers');
});
Deno.test('goal search source control: a user goal mentioning AI is content rather than source metadata', () => {
  eq(goalOf({ facts: [{ ...current(), text: 'AI engineer role in Denver', provenance: 'user' }], preferences: {} }), { roles: ['ai', 'engineer'], places: ['denver'], remote: false });
});

for (const chain of ['reserved', 'direct', 'transitive', 'missing-parent'] as const) {
  Deno.test(`goal search quarantine: ${chain} source cannot steer the actual next-search tool`, async () => {
    const reserved = { ...old({ source: 'user' }), id: 'F-033' };
    const derived = { ...old({ source: 'user' }), id: 'SYN-DERIVED', derived_from: ['F-033'] };
    const second = { ...old({ source: 'user' }), id: 'SYN-SECOND', derived_from: ['SYN-DERIVED'] };
    const denied = chain === 'reserved' ? [reserved] : chain === 'direct' ? [reserved, derived] :
      chain === 'transitive' ? [second, derived, reserved] : [derived, second];
    const profile = { preferences: {}, facts: [current(), ...denied] }, before = JSON.stringify(profile);
    const persisted = JSON.parse(before), search = careerTools({ postings: async () => pool }).find(t => t.name === 'search_jobs')!;
    const result: any = await search.run({}, { userId: USER, threadId: 'SYN-QUARANTINE-SEARCH', now: NOW,
      state: { profile: persisted }, turn: { message: 'Find jobs for my current goal.', added: [] } });
    eq(result.goal, { roles: ['ux', 'designer'], places: ['denver'], remote: false }, 'quarantined lineage supplied goal terms');
    eq(result.postings[0].job_id, 'SYN-NEW-JOB', 'quarantined lineage ranked the former goal first');
    eq(JSON.stringify(persisted), before, 'source reads changed the stored bank');
  });
}
for (const scope of ['profile', 'preferences', 'basics'] as const) {
  Deno.test(`goal search quarantine: derived ${scope} container cannot lend authority to its children`, () => {
    const profile: any = { preferences: { roles: ['Data analyst'], locations: ['Austin'], remote: 'remote' }, basics: { location: 'Austin' }, facts: [current()] };
    if (scope === 'profile') profile.derived_from = ['F-033'];
    if (scope === 'preferences') { profile.preferences.derived_from = ['F-033']; profile.basics = {}; }
    if (scope === 'basics') { profile.basics.derived_from = ['F-033']; profile.preferences = {}; }
    const before = JSON.stringify(profile);
    eq(goalOf(profile), scope === 'profile' ? null : { roles: ['ux', 'designer'], places: ['denver'], remote: false });
    eq(JSON.stringify(profile), before, 'container read changed stored values');
  });
}
Deno.test('goal search quarantine control: own confirmed derivation and independent draft remain eligible', () => {
  const ownParent = { id: 'SYN-OWN-PARENT', kind: 'preference', text: 'Also open to Data analyst roles in Austin', source: 'user', status: 'confirmed', needs_confirmation: false };
  const derived = { ...old({ source: 'user' }), id: 'SYN-OWN-DERIVED', derived_from: [ownParent.id] };
  const profile = { preferences: {}, facts: [derived, ownParent, current()] }, before = JSON.stringify(profile);
  eq(goalOf(profile), { roles: ['data', 'analyst', 'ux', 'designer'], places: ['austin', 'denver'], remote: false });
  eq(JSON.stringify(profile), before, 'own derivation or draft goal changed');
});
Deno.test('goal search quarantine control: historical quarantined data does not taint the corrected own current goal', () => {
  const goal = { ...current(), corrected_from: { ...old(), id: 'F-033' }, audit: [{ ...old(), id: 'F-033' }] };
  const profile = { facts: [goal], preferences: {} }, before = JSON.stringify(profile);
  eq(goalOf(profile), { roles: ['ux', 'designer'], places: ['denver'], remote: false });
  eq(JSON.stringify(profile), before, 'historical values were rewritten');
});
