'use strict';
// Explicitly modeled. These paths, field names and receipt wording are NOT
// derived from or asserted to match an actual Greenhouse employer.
function manifest(base='http://127.0.0.1:1'){
 return {version:'greenhouse_native/v1',verification:'modeled_loopback',canonicalKey:'modeled:greenhouse-native:123',url:base+'/form',submitUrl:base+'/native-submit',resourceUrls:[base+'/favicon.ico'],formSelector:'#application',submitSelector:'#submit_application',receipt:{url:base+'/native-submit',selector:'#receipt',idSelector:'#application_id',text:'Your modeled application has been received.'},fields:[
  {field_id:'first_name',selector:'#first_name',name:'job_application[first_name]',label:'First name',inputType:'text',kind:'standard',profile_key:'first_name',required:true},
  {field_id:'last_name',selector:'#last_name',name:'job_application[last_name]',label:'Last name',inputType:'text',kind:'standard',profile_key:'last_name',required:true},
  {field_id:'email',selector:'#email',name:'job_application[email]',label:'Email',inputType:'email',kind:'standard',profile_key:'email',required:true},
  {field_id:'resume',selector:'#resume',name:'job_application[resume]',label:'Resume',inputType:'file',kind:'standard',profile_key:'resume',required:true},
  {field_id:'sponsorship',selector:'#sponsorship',name:'job_application[answers][sponsor]',label:'Will you require sponsorship?',inputType:'select',kind:'screening',question_key:'sponsorship',required:true,options:[{value:'',label:'Select'},{value:'yes',label:'Yes'},{value:'no',label:'No'}]}
 ]};
}
module.exports={manifest};
