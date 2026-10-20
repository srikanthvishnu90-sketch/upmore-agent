'use strict';
// Synthetic accounts and conflicting resumes only. Never load applicant fixtures.
const copy = value => JSON.parse(JSON.stringify(value));
const OWNERS = ['00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000022'];
const THREADS = ['00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000044'];
function profile(year = '2027', collision = 'default-id') {
  const basics = collision === 'email' ? { email: 'shared@example.test' } : collision === 'name' ? { name: 'Synthetic Shared Name' } : {};
  // Match 122.createProfile's actual default ID, shared by unrelated owners.
  return { id: 'profile-1', basics, preferences: {}, constraints: { graduationDate: year },
    facts: [{ id: 'SYNTHETIC-GRAD', kind: 'education', title: 'Graduation conflict', needs_confirmation: true,
      text: `resume-old.txt says graduation ${year}; resume-new.txt says graduation ${Number(year) + 1}` }] };
}
const snapshot = (owner, p = profile()) => ({ v: 1, scope: { userId: owner }, stores: { profile: copy(p) } });
const CORRECT = "use the new one, old resume's wrong";
const RECALL = "what's my graduation year?";
module.exports = { copy, OWNERS, THREADS, profile, snapshot, CORRECT, RECALL };
