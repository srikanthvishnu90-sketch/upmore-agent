/* Conversation tickets are memory-only. They never authorize financial work. */
globalThis.UpmoreChatRequests = function ({identity,conversation,getToken,request,readThreads,readHistory}) {
  let epoch = 0;
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const owner = () => identity()?.owner || null;
  const place = () => { const value=conversation();return {thread:value?.thread || null,mode:value?.mode || null}; };
  function capture() {
    const originalOwner=owner(), generation=epoch;
    let expected=place();
    const current=() => {const now=place();return generation===epoch && owner()===originalOwner && now.thread===expected.thread && now.mode===expected.mode;};
    async function run(work) {
      if (!current()) return {state:'stale'};
      try { const value=await work();return current() ? {state:'ok',value} : {state:'stale'}; }
      catch (_) { return current() ? {state:'unavailable'} : {state:'stale'}; }
    }
    function adoptThread(id,commit) {
      if (!current() || !originalOwner || !uuid(id) || expected.thread && id!==expected.thread) return false;
      const mode=expected.mode;commit(id);expected={thread:id,mode};return current();
    }
    function workflow(action) {
      if (!current() || !originalOwner || action?.type!=='workflow' || !uuid(action.obligation_id) || !uuid(action.task_id)) return null;
      const link=Object.freeze({type:'workflow',obligation_id:action.obligation_id,task_id:action.task_id});
      return {link,open(callback){if(!current())return false;callback(link);return true;}};
    }
    return {owner:originalOwner,thread:expected.thread,current,run,adoptThread,workflow};
  }
  async function ask(text,images,ticket=capture()) {
    if (!ticket.current()) return {state:'stale'};
    if (!ticket.owner) return {state:'unavailable'};
    const token=await ticket.run(() => getToken());
    if (token.state!=='ok') return token;
    if (typeof token.value!=='string' || !token.value) return {state:'unavailable'};
    const result=await ticket.run(() => request({thread_id:ticket.thread,message:text,images:images || undefined},token.value));
    if (result.state!=='ok') return result;
    const value=result.value;
    if (!value || typeof value!=='object' || Array.isArray(value) || typeof value.reply!=='string' || !uuid(value.thread_id) || ticket.thread && value.thread_id!==ticket.thread) return {state:'unavailable'};
    if (value.action?.type==='workflow') {
      const bound=ticket.workflow(value.action);
      if (!bound) return {state:'unavailable'};
      return {state:'ok',value:{...value,action:bound.link}};
    }
    return result;
  }
  async function list(ticket=capture()) {
    if (!ticket.owner) return {state:ticket.current()?'unavailable':'stale'};
    const result=await ticket.run(() => readThreads(ticket.owner));
    if (result.state!=='ok') return result;
    if (!Array.isArray(result.value) || result.value.some(row => !row || row.user_id!==ticket.owner || !uuid(row.id))) return {state:'unavailable'};
    return result;
  }
  async function history(ticket=capture()) {
    if (!ticket.owner || !uuid(ticket.thread)) return {state:ticket.current()?'unavailable':'stale'};
    const result=await ticket.run(() => readHistory(ticket.owner,ticket.thread,ticket));
    if (result.state!=='ok') return result;
    const value=result.value;
    if (!value || value.thread?.user_id!==ticket.owner || value.thread?.id!==ticket.thread || !Array.isArray(value.messages) || value.messages.some(row => !row || row.thread_id!==ticket.thread || !['user','assistant'].includes(row.role) || typeof row.content!=='string')) return {state:'unavailable'};
    return {state:'ok',value:value.messages};
  }
  return {capture,ask,list,history,invalidate(){epoch++;}};
};
