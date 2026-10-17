// Run exact published budget blob on disposable files. No fetch or environment
// API is provided. Never import historical handler-world.ts (it reads secrets).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const source = new URL('../../docs/career/live-evaluation/evidence/followup-source/original-budget-source.ts', import.meta.url);
const bytes = fs.readFileSync(source);
assert.equal(createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),
  '8195f872144333c72890e54533e78f25dc134da8');

class NotFound extends Error {}
class AlreadyExists extends Error {}
function mapped(error) {
  if (error.code === 'ENOENT') throw new NotFound();
  if (error.code === 'EEXIST') throw new AlreadyExists();
  throw error;
}
globalThis.Deno = {
  pid: process.pid,
  errors: {NotFound, AlreadyExists},
  mkdir: (p, opts) => fsp.mkdir(p, opts),
  async open(p) {
    let fd;
    try { fd = fs.openSync(p, 'wx', 0o600); } catch (error) { mapped(error); }
    return {async write(buffer) { return fs.writeSync(fd, buffer); }, close() { fs.closeSync(fd); }};
  },
  async readTextFile(p) { try {return await fsp.readFile(p, 'utf8');} catch (error) {mapped(error);} },
  writeTextFile: (p, value, opts) => fsp.writeFile(p, value, opts),
  rename: (a, b) => fsp.rename(a, b),
  remove: p => fsp.unlink(p),
};
const {AuditBudget, AUTHORIZED_MICROS, BUDGET_PATH} = await import(source.href);
const payload = {model:'gpt-5-nano', max_completion_tokens:16, messages:[{role:'user', content:'CONTROLLED; no provider'}]};
async function fixture(t, limit=AUTHORIZED_MICROS) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'upmore-old-budget-control-'));
  t.after(() => fsp.rm(dir, {recursive:true, force:true}));
  return {budget:new AuditBudget(path.join(dir, 'budget.json'),limit), dir};
}

test('published campaign identity and fixed default path match supplied blob', () => {
  assert.equal(AUTHORIZED_MICROS,5_000_000);
  assert.equal(BUDGET_PATH,'/workspace/.upmore-tools/audit-budget/budget.json');
  assert.equal(fileURLToPath(source).includes('/.upmore-tools/'),false);
});

test('missing disposable ledger status initializes a fresh zero budget', async t => {
  const {budget} = await fixture(t);
  assert.equal(fs.existsSync(budget.path),false);
  assert.equal((await budget.status()).charged_or_reserved_usd,0);
  assert.equal(fs.existsSync(budget.path),true);
});

test('deleting only a disposable spent ledger permits zero reinitialization', async t => {
  const {budget} = await fixture(t);
  const ticket = await budget.reserve(payload,'CONTROLLED-delete');
  assert.ok((await budget.status()).charged_or_reserved_usd>0);
  assert.ok(ticket.reserve_micros>0);
  await fsp.unlink(budget.path);
  assert.equal((await budget.status()).charged_or_reserved_usd,0);
  assert.equal((await budget.status()).calls,0);
});

test('unchanged valid ledger enforces its shared cap across clients', async t => {
  const {budget} = await fixture(t,100);
  const second = new AuditBudget(budget.path,100);
  const first = await budget.reserve(payload,'CONTROLLED-one');
  assert.ok(first.reserve_micros>50);
  await assert.rejects(second.reserve(payload,'CONTROLLED-two'),/Hard \$5 budget reached/);
});

test('three unknown receipts stop further calls while retaining their bounds', async t => {
  const {budget} = await fixture(t);
  for(let i=0;i<3;i++) {
    const ticket = await budget.reserve(payload,'CONTROLLED-'+i);
    await budget.unknown(ticket.id);
  }
  const status=await budget.status();
  assert.equal(status.unknown_calls,3);
  assert.ok(status.charged_or_reserved_usd>0);
  await assert.rejects(budget.reserve(payload,'CONTROLLED-four'),/Three unknown/);
});

test('malformed disposable ledger lacking limit bypasses comparison: snapshot validity required', async t => {
  const {budget} = await fixture(t,100);
  await budget.status();
  const state=JSON.parse(await fsp.readFile(budget.path,'utf8'));
  delete state.limit_micros;
  await fsp.writeFile(budget.path,JSON.stringify(state));
  await budget.reserve(payload,'CONTROLLED-one');
  await budget.reserve(payload,'CONTROLLED-two');
  const after=JSON.parse(await fsp.readFile(budget.path,'utf8'));
  assert.ok(after.charged_micros>100);
});
