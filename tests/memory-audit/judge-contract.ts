export const dimensions=['capability','awareness','fluency','memory','planning','tool_grounding','recovery_safety'];
export function validateGrades(data:any,turns:any[]){
 const result:Record<string,any>={};
 for(const d of dimensions){
  const g=data?.[d];
  if(!g||!['PASS','FAIL','NOT_APPLICABLE'].includes(g.status)||typeof g.reason!=='string')throw Error('Malformed judge dimension '+d);
  if(g.status!=='NOT_APPLICABLE'){
   if(!Number.isInteger(g.turn)||g.turn<1||g.turn>turns.length||typeof g.quote!=='string'||!g.quote.length||!turns[g.turn-1].assistant.includes(g.quote))throw Error('Judge evidence is not a verbatim response: '+d);
  }
  result[d]={...g,reason:'Provisional model judge: '+g.reason};
 }
 return result;
}
