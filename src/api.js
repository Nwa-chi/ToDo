import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
export const client=createClient(SUPABASE_URL,SUPABASE_KEY,{
  auth:{storageKey:'daymark-todo-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
export async function listPlans() {
  // Page rather than silently truncating the user's list at the API row limit.
  const rows=[];
  for(let start=0;;start+=500){
    const {data,error}=await client.from('daymark_items').select('*').order('created_at',{ascending:false}).order('id').range(start,start+499);
    if(error)throw error;
    rows.push(...data);
    if(data.length<500)return rows;
  }
}
export async function savePlan(plan, id) {
  const query=id?client.from('daymark_items').update(plan).eq('id',id):client.from('daymark_items').insert(plan);
  const {data,error}=await query.select().single();
  if(error)throw error;
  return data;
}
export async function deletePlans(ids) {
  const {data,error}=await client.from('daymark_items').delete().in('id',ids).select('id');
  if(error)throw error;
  return data.map(row=>row.id);
}
