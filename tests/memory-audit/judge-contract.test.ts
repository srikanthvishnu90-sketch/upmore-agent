import {dimensions,validateGrades} from './judge-contract.ts';
const turns=[{assistant:'I need your resume before I can revise it.'}];
const fixture=()=>Object.fromEntries(dimensions.map(d=>[d,{status:'PASS',reason:'Names missing file honestly',turn:1,quote:'I need your resume'}]));
const denies=(value:any)=>{let denied=false;try{validateGrades(value,turns)}catch{denied=true}if(!denied)throw Error('Unsupported grade accepted')};
Deno.test('seven grades require verbatim response evidence',()=>{const result=validateGrades(fixture(),turns);if(Object.keys(result).length!==7)throw Error('Missing grades')});
Deno.test('fabricated quotes and out-of-range turns cannot establish a pass',()=>{const quote=fixture();quote.memory.quote='I sent the resume';denies(quote);const turn=fixture();turn.memory.turn=2;denies(turn)});
Deno.test('missing dimensions and invalid statuses cannot establish a pass',()=>{const absent:any=fixture();delete absent.memory;denies(absent);const invalid=fixture();invalid.memory.status='MAYBE';denies(invalid)});
Deno.test('untested dimensions can abstain without claiming a pass',()=>{const value=fixture();value.memory={status:'NOT_APPLICABLE',reason:'No recall request',turn:0,quote:''};if(validateGrades(value,turns).memory.status!=='NOT_APPLICABLE')throw Error('Invalid abstention')});
