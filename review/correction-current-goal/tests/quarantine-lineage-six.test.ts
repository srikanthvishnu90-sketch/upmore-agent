// Original synthetic lineage cases; actual correction, JSON persistence, fresh search; no providers or network.
import { careerTools } from '../../../supabase/functions/_shared/agent/career_tools.ts';
const oldWords = 'Data analyst role in Austin', newWords = 'UX designer role in Denver';
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }
const row = (id: string, text: string, extra: any = {}) => ({ id, kind: 'goal', text, source: 'user', status: 'confirmed', needs_confirmation: false, ...extra });
const pool = [
 { job_id: 'SYN-OLD', company: 'Synthetic old goal', title: 'Data analyst', location: 'Austin', description: 'Data analyst', url: 'https://example.test/old' },
 { job_id: 'SYN-NEW', company: 'Synthetic new goal', title: 'UX designer', location: 'Denver', description: 'UX designer', url: 'https://example.test/new' },
];
async function run(others: any[]) {
 const profile = { preferences: { roles: ['Data analyst'], locations: ['Austin'], remote: 'hybrid' }, facts: [row('SYN-CURRENT', oldWords), ...others] };
 const tools = careerTools({ postings: async () => pool }), c: any = { userId: 'SYN-LINEAGE', threadId: 'SYN-OLD-THREAD', now: 0, state: { profile }, turn: { message: 'Actually my goal is UX designer role in Denver.', added: [] } };
 await tools.find(t => t.name === 'correct_profile_fact')!.run({ id: 'SYN-CURRENT', text: newWords }, c);
 const persisted = JSON.parse(JSON.stringify(profile)); c.state = { profile: persisted }; c.threadId = 'SYN-FRESH'; c.turn = { message: 'Find jobs for my current goal.', added: [] };
 const before = JSON.stringify(persisted), result: any = await tools.find(t => t.name === 'search_jobs')!.run({}, c);
 assert(before === JSON.stringify(persisted), 'search mutated profile');
 return { profile: persisted, result };
}
for (const kind of ['reserved', 'direct', 'transitive', 'missing-reserved'] as const) Deno.test(`correction quarantine lineage: ${kind} cannot preserve old preference cache`, async () => {
 // Ruling on F-033 (second judge, 2026-10-21): the D-007 range is the owner's bank's ids, carried in factId; a chat
 // profile's own id F-033 is the person's (controls below). Bank lineage is still blocked: the parent is a bank row.
 const parent = row('SYN-BANK-PARENT', 'Invented skill', { kind: 'skill', factId: 'F-033' });
 const first = row('SYN-FIRST', oldWords, { derived_from: ['F-033'] });
 const second = row('SYN-SECOND', oldWords, { derived_from: ['SYN-FIRST'] });
 const others = kind === 'reserved' ? [row('SYN-BANK-033', oldWords, { factId: 'F-033' })] : kind === 'direct' ? [parent, first] : kind === 'transitive' ? [second, first, parent] : [first];
 const { profile, result } = await run(others);
 assert(!profile.preferences.roles.includes('Data analyst') && !profile.preferences.locations.includes('Austin'), 'quarantined alias preserved replaced cache: ' + JSON.stringify(profile.preferences));
 assert(JSON.stringify(result.goal) === JSON.stringify({ roles: ['ux','designer'], places: ['denver'], remote: false }), 'old alias still steered fresh search');
 assert(result.postings[0].job_id === 'SYN-NEW', 'old role ranked first');
});
Deno.test('correction quarantine lineage control: independently confirmed own derivation preserves alternate goal', async () => {
 const { profile, result } = await run([row('SYN-OWN-PARENT','I prefer analytical work', { kind: 'preference' }), row('SYN-OWN-ALTERNATE',oldWords,{ derived_from: ['SYN-OWN-PARENT'] })]);
 assert(profile.preferences.roles.includes('Data analyst') && profile.preferences.locations.includes('Austin'), 'own derivation lost its cache');
 assert(result.goal.roles.includes('data') && result.goal.roles.includes('ux') && result.goal.places.includes('austin') && result.goal.places.includes('denver'), 'own derivation or corrected draft lost');
});
Deno.test('correction quarantine lineage control: independent own draft keeps its stated alternative', async () => {
 const { profile, result } = await run([row('SYN-OWN-DRAFT',oldWords,{ status:'draft', needs_confirmation:true })]);
 assert(profile.preferences.roles.includes('Data analyst') && result.goal.roles.includes('ux'), 'independent own draft was quarantined');
});
Deno.test('correction quarantine lineage control: a long profile\'s own chat fact F-033 keeps its stated alternative', async () => {
 const { profile, result } = await run([row('F-033', oldWords)]);
 assert(profile.preferences.roles.includes('Data analyst') && profile.preferences.locations.includes('Austin'), 'own chat F-033 was quarantined: ' + JSON.stringify(profile.preferences));
 assert(result.goal.roles.includes('data') && result.goal.places.includes('austin'), 'own chat F-033 lost from search');
});
Deno.test('correction quarantine lineage control: derived from the person\'s own chat F-030 keeps its stated alternative', async () => {
 const { profile, result } = await run([row('F-030', 'I prefer analytical work', { kind: 'preference' }), row('F-031', oldWords, { derived_from: ['F-030'] })]);
 assert(profile.preferences.roles.includes('Data analyst') && result.goal.roles.includes('data'), 'own chat lineage was quarantined: ' + JSON.stringify(profile.preferences));
});
