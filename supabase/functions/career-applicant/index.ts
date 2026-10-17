// Source-only endpoint. Not deployed; uses existing server/auth credentials.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.1';
import {createApplicantIngress} from '../_shared/career_applicant_ingress.js';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createApplicantIngress({
 authenticate:async(token:string)=>{const {data,error}=await auth.auth.getUser(token);return error?null:data.user;},
 rpc:(name:string,args:unknown)=>admin.rpc(name,args),
 allowedOrigins:(Deno.env.get('UPMORE_APPLICANT_ALLOWED_ORIGINS')||'').split(',').filter(Boolean),
}));
