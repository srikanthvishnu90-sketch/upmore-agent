'use strict';
// Explicit synthetic event data only. Never pass request headers, environment
// objects, provider configuration or credentials to this recorder.
module.exports=event=>{
 const file=process.env.CAREER_MODEL_EVIDENCE;
 if(file)require('node:fs').appendFileSync(file,JSON.stringify({at:new Date().toISOString(),verification:'SYNTHETIC_PROVIDER_ONLY',...event})+'\n');
};
