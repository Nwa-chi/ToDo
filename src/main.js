import {client,listPlans,savePlan,deletePlans} from './api.js';
import {localDate,overdue,displayDate,matchesView,filterItems,validatePlan} from './domain.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={user:null,items:[],view:'all',mode:'login',busy:false,epoch:0,undo:null,alerts:false};
let authBusy=false,toastTimer,resendUntil=0,refreshSequence=0;
const sentAlerts=new Set();
function preference(key,fallback){try{return localStorage.getItem(key)||fallback}catch{return fallback}}
document.documentElement.dataset.theme=preference('daymark-theme',matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
$('#theme').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('daymark-theme',theme)}catch{}};
function toast(message,undo=false){clearTimeout(toastTimer);$('#toast-text').textContent=message;$('#undo').hidden=!undo;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;state.undo=null},8000)}
function authMode(mode) {
  state.mode=mode;$('#auth-error').textContent='';
  const verifying=['verify','recoveryverify'].includes(mode),updating=mode==='update';
  $('#auth-title').textContent=({login:'Sign in',register:'Create your account',verify:'Check your email',recover:'Reset your password',recoveryverify:'Enter your reset code',update:'Choose a new password'})[mode];
  $('#auth-hint').textContent=verifying?'Enter the code from your email.':mode==='register'?'Create an account, then verify your email.':mode==='recover'?'We’ll email a code if this address has an account.':updating?'Use a unique password of at least eight characters.':'Your plans are waiting for you.';
  const showPassword=['login','register','update'].includes(mode);
  $('#password-field').hidden=!showPassword;$('#password').required=showPassword;
  $('#password').autocomplete=mode==='login'?'current-password':'new-password';
  $('#email-field').hidden=updating;$('#email').required=!updating;$('#email').readOnly=false;
  $('#code-field').hidden=!verifying;$('#code').required=verifying;$('#code').value='';
  $('#auth-submit').textContent=({login:'Sign in',register:'Create account',verify:'Verify email',recover:'Send reset code',recoveryverify:'Verify reset code',update:'Save password'})[mode];
  $('#switch-auth').textContent=mode==='login'?'Create an account':'Back to sign in';
  $('#forgot').hidden=mode!=='login';$('#resend').hidden=!verifying;
}
function clearWorkspace(){
  state.epoch++;refreshSequence++;state.user=null;state.items=[];state.undo=null;state.alerts=false;sentAlerts.clear();
  $('#editor').close();$('#confirm').close();$('#toast').hidden=true;$('#workspace').hidden=true;$('#auth').hidden=false;
  $('#items').replaceChildren();$('#account-email').textContent='';$('#alerts').textContent='Enable alerts';
}
async function establishSession(){
  const epoch=state.epoch;
  const {data,error}=await client.auth.getUser();
  if(epoch!==state.epoch)return;
  if(error||!data.user){clearWorkspace();return}
  if(!data.user.email_confirmed_at){clearWorkspace();authMode('verify');return}
  if(['recoveryverify','update'].includes(state.mode))return;
  if(state.user?.id!==data.user.id){state.epoch++;state.items=[];state.undo=null;sentAlerts.clear()}
  state.user=data.user;$('#auth').hidden=true;$('#workspace').hidden=false;$('#account-email').textContent=data.user.email;
  await refresh();
}
client.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT'){clearWorkspace();authMode('login')}
  else if(event==='PASSWORD_RECOVERY'){clearWorkspace();authMode('update')}
  else if(['SIGNED_IN','INITIAL_SESSION'].includes(event))setTimeout(()=>establishSession().catch(e=>toast(e.message)),0);
});
$('#switch-auth').onclick=()=>{if(!authBusy)authMode(state.mode==='login'?'register':'login')};
$('#forgot').onclick=()=>authMode('recover');
$('#auth-form').onsubmit=async e=>{
  e.preventDefault();if(authBusy)return;
  authBusy=true;$('#auth-submit').disabled=true;$('#auth-error').textContent='';
  const email=$('#email').value.trim(),password=$('#password').value,token=$('#code').value.trim();
  try{
    let result;
    if(state.mode==='register'){
      result=await client.auth.signUp({email,password});
      if(result.error)throw result.error;
      $('#password').value='';
      // Confirmation must remain required; never open the workspace on registration.
      if(result.data.session)await client.auth.signOut();
      authMode('verify');resendUntil=Date.now()+60000;
      toast('Check your email for a verification code. Delivery depends on the email service.');
    } else if(state.mode==='login'){
      result=await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;
      $('#password').value='';await establishSession();
    } else if(state.mode==='verify'){
      result=await client.auth.verifyOtp({email,token,type:'email'});if(result.error)throw result.error;
      authMode('login');await establishSession();
    } else if(state.mode==='recover'){
      result=await client.auth.resetPasswordForEmail(email);if(result.error)throw result.error;
      authMode('recoveryverify');resendUntil=Date.now()+60000;
      toast('If the address has an account, a reset email has been requested.');
    } else if(state.mode==='recoveryverify'){
      result=await client.auth.verifyOtp({email,token,type:'recovery'});if(result.error)throw result.error;
      authMode('update');
    } else if(state.mode==='update'){
      result=await client.auth.updateUser({password});if(result.error)throw result.error;
      $('#password').value='';authMode('login');await establishSession();toast('Password updated.');
    }
  }catch(error){$('#auth-error').textContent=error.message||'Unable to complete this request. Please try again.'}
  finally{authBusy=false;$('#auth-submit').disabled=false}
};
$('#resend').onclick=async()=>{
  if(authBusy)return;
  const remaining=Math.ceil((resendUntil-Date.now())/1000);
  if(remaining>0){$('#auth-error').textContent='Please wait '+remaining+' seconds before requesting another code.';return}
  authBusy=true;$('#resend').disabled=true;
  try{
    const email=$('#email').value.trim();
    if(!$('#email').reportValidity())return;
    const {error}=state.mode==='recoveryverify'?await client.auth.resetPasswordForEmail(email):await client.auth.resend({type:'signup',email});
    if(error)throw error;resendUntil=Date.now()+60000;toast('Another code has been requested.');
  }catch(e){$('#auth-error').textContent=e.message}
  finally{authBusy=false;$('#resend').disabled=false}
};
$('#logout').onclick=async()=>{if(state.busy)return;$('#logout').disabled=true;try{const {error}=await client.auth.signOut();if(error)throw error;clearWorkspace();authMode('login')}catch(e){toast(e.message)}finally{$('#logout').disabled=false}};
const filters=()=>({view:state.view,kind:$('#kind-filter').value,priority:$('#priority-filter').value,category:$('#category-filter').value,sort:$('#sort').value,search:$('#search').value});
function dateLabel(t){
  if(t.due_at)return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(t.due_at));
  return t.due_date?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(t.due_date+'T12:00:00')):'No date';
}
function render(){
  const items=filterItems(state.items,filters());
  $('#result-count').textContent=String(items.length);
  $('#items').innerHTML=items.map(t=>`<article class="item ${t.completed?'complete':''} ${overdue(t)?'overdue':''}" data-id="${t.id}">
    <input type="checkbox" data-complete ${t.completed?'checked':''} aria-label="${escape((t.completed?'Reopen ':'Complete ')+t.title)}">
    <div><div class="item-title">${escape(t.title)}</div>${t.description?`<p class="item-desc">${escape(t.description)}</p>`:''}
    <div class="meta"><span class="chip">${escape(t.kind)}</span><span class="chip ${t.priority==='high'?'high':''}">${escape(t.priority)} priority</span><span class="chip">${escape(t.category)}</span><span class="chip ${overdue(t)?'high':''}">${overdue(t)?'Overdue · ':''}${escape(dateLabel(t))}</span>${t.duration_minutes?`<span class="chip">${t.duration_minutes} min</span>`:''}</div></div>
    <div class="item-actions"><button data-edit class="link" aria-label="Edit ${escape(t.title)}">Edit</button><button data-delete class="link danger" aria-label="Delete ${escape(t.title)}">Delete</button></div></article>`).join('');
  $('#empty').hidden=items.length>0;$('#empty-title').textContent=state.items.length?'No matching plans':'A little space to begin';$('#empty-copy').textContent=state.items.length?'Try another filter or search.':'Add a task, event or occasion to your day.';
  const complete=state.items.filter(t=>t.completed).length,total=state.items.length,percent=total?Math.round(complete/total*100):0;
  $('#progress-label').textContent=percent+'%';$('#progress').value=percent;
  $('#progress-title').textContent=total?(complete===total?'Everything is checked off':'Make steady progress'):'A fresh start';
  $('#progress-copy').textContent=total?`${complete} of ${total} completed · ${total-complete} remaining`:'Add your first plan.';
  $('#clear').hidden=!complete;
  for(const view of ['all','today','upcoming','overdue','completed'])$('#count-'+view).textContent=state.items.filter(t=>matchesView(t,view)).length;
  lockControls(state.busy);
}
function categories(){
  const current=$('#category-filter').value,list=[...new Set(state.items.map(t=>t.category))].sort();
  $('#category-filter').innerHTML='<option value="all">All categories</option>'+list.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  $('#category-filter').value=list.includes(current)?current:'all';
  $('#categories').innerHTML=list.map(c=>`<option value="${escape(c)}"></option>`).join('');
}
async function refresh(){
  if(!state.user||state.busy)return;
  const epoch=state.epoch,sequence=++refreshSequence;
  $('#loading').hidden=false;$('#empty').hidden=true;$('#load-error').hidden=true;
  try{const items=await listPlans();if(epoch!==state.epoch||sequence!==refreshSequence)return;state.items=items;categories();render()}
  catch(e){if(epoch===state.epoch){$('#load-error').textContent='Could not load your plans: '+e.message;$('#load-error').hidden=false}}
  finally{if(epoch===state.epoch&&sequence===refreshSequence)$('#loading').hidden=true}
}
function lockControls(busy){
  for(const element of document.querySelectorAll('#add,#clear,#save,#undo,#refresh,#logout,#items button,#items input'))element.disabled=busy;
}
async function mutation(fn,success){
  if(state.busy||!state.user)return;
  state.busy=true;lockControls(true);const epoch=state.epoch;refreshSequence++;
  try{await fn(epoch);if(epoch!==state.epoch)return;categories();render();if(success)toast(success)}
  catch(e){if(epoch===state.epoch){render();$('#item-error').textContent=e.message;toast('Not saved: '+e.message)}}
  finally{state.busy=false;lockControls(false)}
}
function edit(item){
  if(state.busy)return;
  $('#item-form').reset();$('#item-id').value=item?.id||'';$('#editor-title').textContent=item?'Edit plan':'Add a plan';$('#item-error').textContent='';
  $('#item-title').value=item?.title||'';$('#description').value=item?.description||'';$('#kind').value=item?.kind||'task';$('#priority').value=item?.priority||'medium';$('#category').value=item?.category||'';
  $('#due-date').value=item?displayDate(item):'';$('#due-time').value=item?.due_at?new Date(item.due_at).toTimeString().slice(0,5):'';$('#duration').value=item?.duration_minutes||'';
  $('#timezone').textContent='Times use '+Intl.DateTimeFormat().resolvedOptions().timeZone+'. Timed plans follow the same moment across devices.';
  $('#editor').showModal();$('#item-title').focus();
}
$('#add').onclick=()=>edit();
for(const id of ['close-editor','cancel-editor'])$('#'+id).onclick=()=>{if(!state.busy)$('#editor').close()};
$('#editor').addEventListener('cancel',e=>{if(state.busy)e.preventDefault()});
$('#item-form').onsubmit=async e=>{
  e.preventDefault();if(state.busy)return;
  let plan;
  try{plan=validatePlan({title:$('#item-title').value,description:$('#description').value,category:$('#category').value,kind:$('#kind').value,priority:$('#priority').value,date:$('#due-date').value,time:$('#due-time').value,duration:$('#duration').value})}
  catch(e){$('#item-error').textContent=e.message;return}
  const id=$('#item-id').value;
  await mutation(async(epoch)=>{const saved=await savePlan(plan,id);if(epoch!==state.epoch)return;state.items=id?state.items.map(t=>t.id===id?saved:t):[saved,...state.items];$('#editor').close()},'Plan saved.');
};
async function confirmDelete(items){
  $('#confirm-title').textContent=items.length===1?'Delete this plan?':'Clear completed plans?';
  $('#confirm-copy').textContent=items.length===1?items[0].title:items.length+' completed plans will be removed.';
  const dialog=$('#confirm');dialog.returnValue='cancel';dialog.showModal();
  const confirmed=await new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='yes'),{once:true}));
  if(!confirmed)return;
  await mutation(async(epoch)=>{
    const deleted=await deletePlans(items.map(t=>t.id));
    if(epoch!==state.epoch)return;
    state.items=state.items.filter(t=>!deleted.includes(t.id));
    state.undo={userId:state.user.id,items:items.filter(t=>deleted.includes(t.id))};
    toast('Plans deleted.',true);
  });
}
$('#items').onclick=async e=>{
  const card=e.target.closest('[data-id]');if(!card||state.busy)return;const item=state.items.find(t=>t.id===card.dataset.id);
  if(e.target.matches('[data-edit]'))edit(item);
  if(e.target.matches('[data-delete]'))await confirmDelete([item]);
  if(e.target.matches('[data-complete]'))await mutation(async(epoch)=>{const saved=await savePlan({completed:!item.completed},item.id);if(epoch!==state.epoch)return;state.items=state.items.map(t=>t.id===item.id?saved:t)},item.completed?'Plan reopened.':'Plan completed.');
};
$('#clear').onclick=()=>confirmDelete(state.items.filter(t=>t.completed));
$('#undo').onclick=async()=>{
  const undo=state.undo;if(!undo||undo.userId!==state.user?.id)return;
  await mutation(async(epoch)=>{
    const rows=undo.items.map(({user_id,updated_at,...item})=>item);
    const {data,error}=await client.from('daymark_items').insert(rows).select();if(error)throw error;
    if(epoch!==state.epoch)return;
    state.items.push(...data);state.undo=null;$('#undo').hidden=true;
  },'Deletion undone.');
};
$('#navigation').onclick=e=>{const button=e.target.closest('[data-view]');if(!button)return;state.view=button.dataset.view;for(const b of document.querySelectorAll('[data-view]')){b.classList.toggle('active',b===button);b.setAttribute('aria-current',b===button?'page':'false')}$('#view-title').textContent=button.childNodes[0].textContent.trim();render()};
for(const id of ['search','kind-filter','priority-filter','category-filter','sort'])$('#'+id).addEventListener(id==='search'?'input':'change',render);
$('#refresh').onclick=()=>refresh();
$('#today-label').textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
$('#alerts').onclick=async()=>{
  if(state.alerts){state.alerts=false;$('#alerts').textContent='Enable alerts';return}
  if(!('Notification'in window)){toast('This browser does not support these alerts.');return}
  try{const permission=await Notification.requestPermission();if(permission!=='granted'){toast('Allow notifications in your browser settings to enable alerts.');return}state.alerts=true;$('#alerts').textContent='Disable alerts';toast('Alerts enabled while the app remains open.');checkAlerts()}
  catch(e){toast('Notifications are unavailable in this browser.')}
};
function checkAlerts(){
  if(!state.user||!state.alerts)return;
  const now=Date.now();
  for(const item of state.items){
    if(item.completed||(!item.due_at&&!item.due_date))continue;
    const at=item.due_at?new Date(item.due_at).getTime():new Date(item.due_date+'T09:00:00').getTime();
    const key=state.user.id+':'+item.id+':'+at;
    if(now<at||now-at>86400000||sentAlerts.has(key)||preference('daymark-alert:'+key,'')==='sent')continue;
    try{new Notification('Daymark · Due now',{body:item.title,tag:item.id});sentAlerts.add(key);try{localStorage.setItem('daymark-alert:'+key,'sent')}catch{}}
    catch{state.alerts=false;$('#alerts').textContent='Enable alerts';toast('This browser cannot show scheduled alerts.');return}
  }
}
setInterval(()=>{if(state.user){render();checkAlerts()}},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(state.user)refresh();checkAlerts()}});
authMode('login');
