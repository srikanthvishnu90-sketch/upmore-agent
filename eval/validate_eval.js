#!/usr/bin/env node
// Validate server_eval_full.json: for each question with a deterministic "must",
// verify the corresponding server guard regex actually matches the question.
// Usage: node validate_eval.js
const fs = require('fs');
const path = require('path');

const EVAL = '/home/hatch/workspace/upmore/eval/server_eval_full.json';
const CAP = '/home/hatch/workspace/upmore/supabase/functions/agent-chat/_shared/capabilities.ts';
const FF = '/home/hatch/workspace/upmore/supabase/functions/agent-chat/_shared/finance_facts.ts';

const capSrc = fs.readFileSync(CAP, 'utf8');

function getRegexLiteral(src, name) {
  const m = src.match(new RegExp(name + '\\s*=\\s*(/[^;\\n]+/i?);'));
  if (!m) throw new Error('regex literal not found: ' + name);
  return eval(m[1]);
}
function getNewRegExp(src, name) {
  // const NAME = new RegExp(\n  "str" +\n  "str",\n  "i"\n);
  const m = src.match(new RegExp(name + '\\s*=\\s*new RegExp\\(([\\s\\S]*?)"i"\\s*\\n\\);'));
  if (!m) throw new Error('new RegExp not found: ' + name);
  const parts = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]);
  const pattern = parts.join('').replace(/\\\\/g, '\\');
  return new RegExp(pattern, 'i');
}

const RX = {
  GAMBLE: getRegexLiteral(capSrc, 'GAMBLE_RX'),
  FAKE_DOC: getRegexLiteral(capSrc, 'FAKE_DOC_RX'),
  CONTEST: getRegexLiteral(capSrc, 'CONTEST_RX'),
  CRYPTO: getRegexLiteral(capSrc, 'CRYPTO_RX'),
  FAKE_REVIEW: getRegexLiteral(capSrc, 'FAKE_REVIEW_RX'),
  TAX_FRAUD: getRegexLiteral(capSrc, 'TAX_FRAUD_RX'),
  CREDIT_CARD: getRegexLiteral(capSrc, 'CREDIT_CARD_RX'),
  NEWS: getRegexLiteral(capSrc, 'NEWS_RX'),
  SYSPROMPT: getRegexLiteral(capSrc, 'SYSPROMPT_RX'),
  PRIVACY_WHO: getRegexLiteral(capSrc, 'PRIVACY_WHO'),
  PRIVACY_WHAT: getRegexLiteral(capSrc, 'PRIVACY_WHAT'),
  SECURITIES: getNewRegExp(capSrc, 'SECURITIES_RX'),
  MONEY_MOVE: getNewRegExp(capSrc, 'MONEY_MOVE_RX'),
};

// Map each deterministic "must" signature to the guard(s) that must fire.
// Order mirrors the server early-guard chain.
function expectedGuards(must) {
  const m = must.join('|');
  if (m.includes('never recommends them')) return ['CREDIT_CARD'];
  if (m.includes('no betting, no crypto')) return ['CRYPTO'];
  if (m.includes('never touches your accounts')) return ['MONEY_MOVE'];
  if (m.includes("can't recommend what to invest in")) return ['SECURITIES'];
  if (m.includes('lose your own money') || (m.includes('lose money') && !m.includes('betting'))) return ['GAMBLE'];
  if (m.includes('betting') && m.includes('lose money')) return ['GAMBLE'];
  if (m.includes("don't touch")) return ['FAKE_REVIEW'];
  if (m.includes('never') && m.includes('contests')) return ['CONTEST'];
  if (m === 'never') return ['CONTEST'];
  if (m.includes("won't") && must.includes("can't")) return ['FAKE_DOC'];
  if (m === "won't") return ['TAX_FRAUD'];
  if (m.includes('private')) return ['SYSPROMPT'];
  if (m.includes("another person's data")) return ['PRIVACY'];
  return null; // model-handled (["can't"])
}

function guardFires(name, q) {
  if (name === 'PRIVACY') return RX.PRIVACY_WHO.test(q) && RX.PRIVACY_WHAT.test(q);
  return RX[name].test(q);
}

const data = JSON.parse(fs.readFileSync(EVAL, 'utf8'));
let detTotal = 0, detPass = 0, modelTotal = 0;
const problems = [];

for (const [cat, items] of Object.entries(data)) {
  for (const item of items) {
    const guards = expectedGuards(item.must);
    if (!guards) { modelTotal++; continue; }
    detTotal++;
    const fired = guards.filter(g => guardFires(g, item.q));
    // Also ensure no EARLIER guard in the chain hijacks it (chain order check)
    const chainOrder = ['GAMBLE','FAKE_DOC','CONTEST','CRYPTO','FAKE_REVIEW','TAX_FRAUD','PRIVACY','SYSPROMPT','SECURITIES','MONEY_MOVE','CREDIT_CARD','NEWS'];
    const firstFired = chainOrder.find(g => guardFires(g, item.q));
    const expectedFirst = guards[0];
    if (!fired.length) {
      problems.push(`NO-MATCH [${cat}] expected ${guards} :: ${item.q}`);
    } else if (firstFired !== expectedFirst) {
      problems.push(`HIJACK [${cat}] expected ${expectedFirst} first, got ${firstFired} :: ${item.q}`);
    } else {
      detPass++;
    }
  }
}

// Complex: verify dynamic handler triggers in finance_facts.ts logic
const ffSrc = fs.readFileSync(FF, 'utf8');
function complexHandler(q) {
  const t = ' ' + q.toLowerCase() + ' ';
  if (t.includes('owe') && t.includes('credit card')) return 'debt';
  if (t.includes('bonus') && t.includes('emergency') && t.includes('debt')) return 'bonus';
  if ((t.includes('doordash') || t.includes('gig') || t.includes('freelance')) && t.includes('tax')) return 'gig';
  if (t.includes('no credit') && (t.includes('car loan') || t.includes('auto loan'))) return 'credit';
  if (t.includes('overdraft') && t.includes('credit')) return 'overdraft';
  return null;
}
let cxPass = 0;
for (const item of data.complex) {
  // must not be hijacked by an earlier guard either
  const chainOrder = ['GAMBLE','FAKE_DOC','CONTEST','CRYPTO','FAKE_REVIEW','TAX_FRAUD','PRIVACY','SYSPROMPT','SECURITIES','MONEY_MOVE','CREDIT_CARD','NEWS'];
  const hijack = chainOrder.find(g => guardFires(g, item.q));
  const h = complexHandler(item.q);
  if (hijack) problems.push(`HIJACK [complex] guard ${hijack} fires :: ${item.q}`);
  else if (!h) problems.push(`NO-HANDLER [complex] :: ${item.q}`);
  else cxPass++;
}

console.log(`Deterministic guard questions: ${detPass}/${detTotal} pass`);
console.log(`Complex handler questions: ${cxPass}/${data.complex.length} pass`);
console.log(`Model-handled (unverifiable statically): ${modelTotal}`);
if (problems.length) {
  console.log(`\n${problems.length} PROBLEMS:`);
  problems.forEach(p => console.log('  ' + p));
  process.exit(1);
} else {
  console.log('\nAll deterministic expectations verified against server source.');
}
