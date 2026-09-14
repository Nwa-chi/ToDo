import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';
import {timingSafeEqual} from 'node:crypto';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
async function rpc(action:string,job?:string,status?:number,invitation=false){
 const {data,error}=await db.rpc(invitation?'daymark_invitation_worker':'daymark_push_worker',{p_action:action,p_job:job??null,p_status:status??null});
 if(error){console.error('Reminder RPC',action,error.code);throw new Error('Reminder storage unavailable');}return data;
}
function allowed(endpoint:string){
 try {const u=new URL(endpoint);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com)$/.test(u.hostname)||/^[a-z0-9.-]+\.(push\.apple\.com|notify\.windows\.com)$/.test(u.hostname));}catch{return false}
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const provided=req.headers.get('x-daymark-cron')||'';
 if(!/^[a-f0-9]{64}$/.test(provided))return new Response('Unauthorised',{status:401});
 let stage='config';
 try{
  const config=await rpc('config');
  const expected=config?.daymark_push_cron||'';
  const encoder=new TextEncoder();
  if(expected.length!==provided.length||!timingSafeEqual(encoder.encode(expected),encoder.encode(provided)))return new Response('Unauthorised',{status:401});
  if(!config.daymark_vapid_private||!config.daymark_vapid_public)return new Response('Not configured',{status:503});
  stage='vapid';webpush.setVapidDetails('https://daymarks.click',config.daymark_vapid_public,config.daymark_vapid_private);
  stage='claim';const jobs=[...await rpc('claim'),...await rpc('claim',undefined,undefined,true)];let accepted=0,failed=0;
  // Bounded concurrency stays within worker time limits. No titles in lock-screen payloads.
  for(let start=0;start<jobs.length;start+=5)await Promise.all(jobs.slice(start,start+5).map(async(job:any)=>{
   let status=400;
   if(allowed(job.subscription?.endpoint))try{
    const result=await webpush.sendNotification(job.subscription,JSON.stringify(job.kind==='invitation'?{kind:'invitation',tag:'invite-'+job.invitation_id}:{kind:'reminder',tag:job.plan_id}),{TTL:3600,urgency:'high',timeout:8000});status=result.statusCode;
   }catch(error:any){status=Number(error.statusCode)||503;}
   await rpc('finish',job.id,status,job.kind==='invitation');if(status>=200&&status<300)accepted++;else failed++;
  }));
  return Response.json({accepted,failed});
 }catch{ console.error('Reminder worker failed at',stage);return Response.json({error:'Reminder service temporarily unavailable',stage},{status:503}); }
});
