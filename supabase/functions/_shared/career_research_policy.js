// Shared by Edge planning and the owned Node worker. No network or Node APIs.
export function publicResearchURL(value) {
  const fail = () => { throw Object.assign(new Error('public_research_url_refused'), { code: 'PUBLIC_RESEARCH_URL_REFUSED' }); };
  let u; try { u = new URL(value); } catch (_) { return fail(); }
  if (typeof value !== 'string' || value.length > 2000 || u.href !== value || u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return fail();
  // Public DNS names only. IP literals, localhost and private name suffixes
  // cannot become research destinations. The helper additionally pins DNS.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(u.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/.test(u.hostname)) return fail();
  let path; try { path = decodeURIComponent(u.pathname); } catch (_) { return fail(); }
  if (/[\\\x00-\x1f]/.test(path) || /\/(?:apply|login|logout|signin|signup|sign-in|sign-up|auth|oauth|account|checkout|cart|payment|purchase|submit|unsubscribe)(?:\/|\.|$)/i.test(path)) return fail();
  for (const [key, val] of u.searchParams) if (!['q','query','search','page','offset','team','location','department'].includes(key) || val.length > 200 || /[\x00-\x1f]/.test(val)) return fail();
  return u.href;
}
export function normalizeResearchRequest(value) {
  if (typeof value.question !== 'string' || !value.question.trim() || value.question.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.question)) throw Object.assign(new Error('invalid_research_question'), { code: 'invalid_career_task' });
  return { url: publicResearchURL(value.url), question: value.question.trim() };
}
export function researchCommand(message, eventId) {
  const status = typeof message === 'string' && message.match(/^Research status ([a-f0-9]{32}|[a-f0-9]{64})$/);
  if (status) return { action: 'research_status', [status[1].length === 32 ? 'taskId' : 'intentId']: status[1] };
  const match = typeof message === 'string' && message.match(/^Research (https:\/\/\S+)\s+—\s+(.+)$/);
  return match ? { action: 'research', eventId, ...normalizeResearchRequest({ url: match[1], question: match[2] }) } : null;
}
