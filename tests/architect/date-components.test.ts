// Exact self-contained reproduction of WO-042/3; original architect test remains unchanged.
import {planBatch, typedFieldProblem, type FormField} from '../../supabase/functions/_shared/career_apply.ts';
import {chooseWidgetOption} from '../../extension/src/apply_core.ts';
const eq=(a:unknown,b:unknown,why='')=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(why+': '+JSON.stringify(a)+' !== '+JSON.stringify(b));};
const fact=(value:string,factId='SYN-'+value)=>({value,factId});
const field=(name:string,label:string,type='input_text'):FormField=>({name,label,type,required:true,options:[]});
const edu=[field('school--0','School'),field('end-month--0','End date month'),field('end-year--0','End date year')];
function filled(fields:FormField[],answers:any){return Object.fromEntries((planBatch({userId:'SYN-OWNER',postings:[{job_id:'SYN-JOB',company:'Synthetic Employer',title:'',fields:fields.map(f=>({...f,required:false}))}],answers,saved:{},log:[],now:0}).ready[0]?.fields??[]).map(f=>[f.name,f.value]));}
Deno.test('date components: exact education-end year and month scenario survives typed validation',()=>{
 const a={graduation_date:fact('05/2022','SYN-GRAD'),school:fact('Example State University')},got=filled(edu,a);
 eq(got['end-year--0'],'2022');eq(got['end-month--0'],'May');
 eq(filled(edu,{graduation_date:fact('2022-12')})['end-month--0'],'December');eq(filled(edu,{graduation_date:fact('May 2022')})['end-month--0'],'May');
 eq(filled([field('end-year--0','End date year')],a)['end-year--0'],undefined,'requires school field');eq(filled([field('school--1','School'),field('end-year--1','End date year')],a)['end-year--1'],undefined,'first entry only');
 const month=chooseWidgetOption({userId:'SYN-OWNER',jobId:'SYN-JOB',company:'Synthetic Employer',family:'greenhouse',field:edu[1],labels:['January','February','March','April','May','June'],answers:a,saved:{},now:0,form:edu});eq(month,'May');
 const alone=chooseWidgetOption({userId:'SYN-OWNER',jobId:'SYN-JOB',company:'Synthetic Employer',family:'greenhouse',field:edu[1],labels:['January','May'],answers:a,saved:{},now:0});eq(alone,null);
});
Deno.test('date components: explicit component fields never weaken full native dates or add unstated precision',()=>{
 eq(typedFieldProblem(edu[1],'May'),null);eq(typedFieldProblem(edu[2],'2022'),null);
 for(const value of ['tomorrow','2022-05-01','not known'])eq(typedFieldProblem(edu[1],value)===null,false,'month component only');
 for(const value of ['0000','2022-05','2022-05-01'])eq(typedFieldProblem(edu[2],value)===null,false,'year component only');
 for(const value of ['May','2022','2022-05'])eq(typedFieldProblem(field('native','End date year','date'),value)===null,false,'native date retains full precision');
 const onlyYear=filled(edu,{graduation_date:fact('2022')});eq(onlyYear['end-year--0'],'2022');eq(onlyYear['end-month--0'],undefined,'bare year never gains May');
});
