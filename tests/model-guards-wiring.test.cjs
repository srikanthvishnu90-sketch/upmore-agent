// The chat handler runs the two guards the testing agent forced (evals/agent/run.ts O-15, O-20), in the right places:
// identity digits are removed before anything stores or sends the message, and a model reply that claims a money action
// is corrected before it is stored. Read from the source, like tests/proactive-wiring.test.cjs.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const h = fs.readFileSync(path.join(root, 'supabase/functions/agent-chat/handler.ts'), 'utf8');
const input = fs.readFileSync(path.join(root, 'supabase/functions/agent-chat/_shared/chat_input.ts'), 'utf8');

test('identity digits are redacted inside chatInput, before the text is stored or sent, and the person is told', () => {
  assert.ok(input.includes('const red = redactIdentity(typeof message === "string" ? message.trim() : "");'));
  assert.ok(input.includes('const text = red.text;'));
  assert.ok(h.includes('import { redactionNote } from "../_shared/identity_redact.ts";'));
  const note = h.indexOf('flowCtx.note = redactionNote(input.redacted);'), firstInsert = h.indexOf('.from("agent_messages").insert(');
  assert.ok(note > 0 && note < firstInsert, 'the note is set before the first message is stored');
  assert.ok(h.includes('flowCtx.note = [flowCtx.note, flow.note].filter(Boolean).join(" ") || null;'), 'a dropped-card note keeps the redaction note');
});

test('both model paths run the money-claim guard before the reply is stored', () => {
  assert.ok(h.includes('import { guardMoneyClaim, guardSecretAsk } from "../_shared/claim_guard.ts";'));
  const g = h.indexOf('reply = guardMoneyClaim(reply).reply;'), store = h.indexOf('{ thread_id: tid, role: "assistant", content: reply, meta: { action, violations');
  assert.ok(g > 0 && g < store);
  assert.ok(h.includes('result.action ? result.reply : guardMoneyClaim(result.reply).reply'));
});

test('both model paths drop any sentence that asks for a password, a code or a full number (secrets never travel through chat)', () => {
  assert.ok(h.includes('import { guardMoneyClaim, guardSecretAsk } from "../_shared/claim_guard.ts";'));
  const g = h.indexOf('reply = guardSecretAsk(reply).reply;'), store = h.indexOf('{ thread_id: tid, role: "assistant", content: reply, meta: { action, violations');
  assert.ok(g > h.indexOf('reply = guardMoneyClaim(reply).reply;') && g < store);
  assert.ok(h.includes('const reply = guardSecretAsk(result.action ? result.reply : guardMoneyClaim(result.reply).reply).reply;'));
  for (const f of ['supabase/functions/agent-chat/_shared/agent.ts', 'supabase/functions/_shared/agent.ts']) {
    const p = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(p.includes('Secrets never travel through chat: never ask for a password, a one-time'), f);
    assert.ok(p.includes('Prediction markets (Kalshi, Polymarket): never encourage a position;'), f);
  }
});

test('the direct answers (connect my X, find me money, nothing linked) run after the safety guards and before the flows and the model; "pay my rent" is left to the standing rent flow',()=>{
  assert.ok(/import \{ connectReply, (?:creditScoreReply, )?(?:paperTradingReply, )?(?:accountPrivacyReply, )?(?:sleepReply, )?(?:adviceReply, )?(?:travelReply, )?(?:optionsReply, )?(?:notYetReply, )?(?:copyReply, )?(?:phoneCallReply, )?noDataReply, findMoneyReply, NO_ACCOUNTS \} from "\.\/_shared\/direct_answers\.ts";/.test(h));
  assert.ok(!/rentReply|RENT_NOT_BUILT/.test(h),'no "not built" rent answer intercepts the rent flow');
  const guard=h.indexOf('if (earlyGuard) {'), direct=h.indexOf('let direct: string | null = connectReply(message) ?? creditScoreReply(message) ?? paperTradingReply(message) ?? adviceReply(message) ?? optionsReply(message) ?? notYetReply(message) ?? copyReply(message) ?? accountPrivacyReply(message, modelConfig(Deno.env, "chat").provider) ?? sleepReply(message, !tzRead.error && tzRead.data ? { start: tzRead.data.quiet_start ?? null, end: tzRead.data.quiet_end ?? null } : { start: DEFAULT_SETTINGS.quiet_start, end: DEFAULT_SETTINGS.quiet_end }) ?? travelReply(message, tz);'), flows=h.indexOf('flow = await routeFlows(message');
  assert.ok(guard>0 && guard<direct && direct<flows,'guards, then direct answers, then flows');
  assert.ok(h.includes('meta: { capability: true, direct: true }'));
  assert.ok(h.includes('readRecentTransactions(supabase, user.id, Date.now())'),'find me money reads through the shared reader (observed rows only; behavior in tests/edge/recent-transactions.test.ts)');
});

test('one shared, newest-first transaction read per turn (a long history never drops this month), used by every direct answer',()=>{
  const start=h.indexOf('let direct: string | null = connectReply(message) ?? creditScoreReply(message) ?? paperTradingReply(message) ?? adviceReply(message) ?? optionsReply(message) ?? notYetReply(message) ?? copyReply(message) ?? accountPrivacyReply(message, modelConfig(Deno.env, "chat").provider) ?? sleepReply(message, !tzRead.error && tzRead.data ? { start: tzRead.data.quiet_start ?? null, end: tzRead.data.quiet_end ?? null } : { start: DEFAULT_SETTINGS.quiet_start, end: DEFAULT_SETTINGS.quiet_end }) ?? travelReply(message, tz);'), end=h.indexOf('return json(cors, { thread_id: tid, reply: direct, action: null });');
  const block=h.slice(start,end);
  assert.ok(block.includes('txCache ??='),'read once and shared');
  assert.ok(block.includes('readRecentTransactions(supabase, user.id, Date.now())'),'the shared newest-first reader, with the person\'s RLS client (its query shape is tested against real order, range and filter semantics in tests/edge/recent-transactions.test.ts)');
  assert.ok(!block.includes('ascending: true }).limit('),'no oldest-first limit, which cut off the newest rows');
  const f=fs.readFileSync(path.join(__dirname,'../supabase/functions/_shared/flow_router.ts'),'utf8');
  assert.ok(f.includes('readRecentTransactions(supabase, userId, now())') && !/agent_financial_transactions[^\n]*\n[^\n]*ascending: true \}\)\.limit\(/.test(f),'the flow router reads the same way');
  assert.ok(!block.includes('admin.'),'reads use the person\'s RLS client, never the service role');
});

test('see-everything numbers, then dispute (S16-17), then find me money, in the direct block; a failed read is said plainly, never a 500',()=>{
  assert.ok(h.includes('import { disputeReply } from "./_shared/dispute_answer.ts";'));
  assert.ok(h.includes('import { moneyReply, moneyKind, mergeKinds, MONEY_UNAVAILABLE } from "./_shared/money_answers.ts";'));
  const block=h.indexOf('let direct: string | null = connectReply(message) ?? creditScoreReply(message) ?? paperTradingReply(message) ?? adviceReply(message) ?? optionsReply(message) ?? notYetReply(message) ?? copyReply(message) ?? accountPrivacyReply(message, modelConfig(Deno.env, "chat").provider) ?? sleepReply(message, !tzRead.error && tzRead.data ? { start: tzRead.data.quiet_start ?? null, end: tzRead.data.quiet_end ?? null } : { start: DEFAULT_SETTINGS.quiet_start, end: DEFAULT_SETTINGS.quiet_end }) ?? travelReply(message, tz);'), noData=h.indexOf('direct = noDataReply(message, linkedCount)'),
    money=h.indexOf('if (!direct && linkedCount > 0) direct = await moneyReply(message, new Date(), {'),
    dispute=h.indexOf('if (!direct) direct = await disputeReply(message, today, oldestFirst, { hasPhoto: imageBlocks.length > 0 });'),
    find=h.indexOf('if (!direct) direct = await findMoneyReply(message, today, oldestFirst);'),
    caught=h.indexOf('} catch { direct = MONEY_UNAVAILABLE; }'),
    reply=h.indexOf('return json(cors, { thread_id: tid, reply: direct, action: null });');
  assert.ok(block>0 && block<noData && noData<money && money<dispute && dispute<find && find<caught && caught<reply,'connect/rent, nothing linked, money answers, dispute, find me money, the plain failure line, then the one stored reply');
  const accounts=h.slice(h.indexOf('const readAccounts = () => acctCache ??='),money);
  assert.ok(accounts.includes('supabase.from("agent_financial_accounts")') && accounts.includes('.eq("status", "active")'),'active accounts only, read once and shared');
  assert.ok(accounts.includes('supabase.from("agent_account_preferences")') && accounts.includes('mergeKinds('),'the person\'s own account types win');
  assert.match(h,/moneyReply\(message, new Date\(\), \{\s*accounts: readAccounts,\s*transactions: readTx,/,'money answers use the shared readers');
  const rewards=h.indexOf('if (!direct) direct = await rewardsReply(message, today, readAccounts, oldestFirst);');
  assert.ok(find<rewards && rewards<caught,'rewards math after find me money, inside the plain-failure guard');
  assert.ok(h.includes('(NEEDS_ACCOUNTS.test(message) || moneyKind(message))'),'the linked count is read for every money ask');
});

test('subscription savings (Methods 3 D1-D6, read-only) answer after dispute and before find me money, inside the same plain-failure catch',()=>{
  assert.ok(h.includes('import { subscriptionReply } from "./_shared/subscription_answer.ts";'));
  const dispute=h.indexOf('if (!direct) direct = await disputeReply(message, today, oldestFirst, { hasPhoto: imageBlocks.length > 0 });'),
    subs=h.indexOf('if (!direct) direct = await subscriptionReply(message, today, oldestFirst);'),
    find=h.indexOf('if (!direct) direct = await findMoneyReply(message, today, oldestFirst);'),
    caught=h.indexOf('} catch { direct = MONEY_UNAVAILABLE; }');
  assert.ok(dispute>0 && dispute<subs && subs<find && find<caught);
  assert.equal(h.split('subscriptionReply(').length-1,1,'one call, in the direct block');
});
