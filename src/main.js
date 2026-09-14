import {enablePush,disablePush,restorePush,testPush} from './push.js';
import {setupInstall} from './pwa.js';
import {authErrorMessage} from './auth-errors.js';
import {client,listPlans,savePlan,deletePlans} from './api.js';
import {localDate,overdue,displayDate,matchesView,filterItems,validatePlan,dailyProgress} from './domain.js';
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
  state.mode=mode;$('#auth-error').textContent='';$('#auth-step').hidden=!['register','verify'].includes(mode);$('#auth-step').textContent=mode==='verify'?'Step 2 of 2 · Verify your email':'Step 1 of 2 · Create your account';
  const verifying=['verify','recoveryverify'].includes(mode),updating=mode==='update';
  $('#auth-title').textContent=({login:'Sign in',register:'Create your account',verify:'Check your email',recover:'Reset your password',recoveryverify:'Enter your reset code',update:'Choose a new password'})[mode];
  $('#password-help').hidden=!['register','update'].includes(mode);
  $('#verify-existing').hidden=!['login','register'].includes(mode);
  $('#password').type='password';$('#show-password').textContent='Show';$('#show-password').setAttribute('aria-pressed','false');
  $('#auth-hint').textContent=verifying?'Enter your email code below. Check your spam folder if you don’t see it.':mode==='register'?'Create an account, then verify your email.':mode==='recover'?'We’ll email a code if this address has an account.':updating?'Use a unique password of at least eight characters.':'Your plans are waiting for you.';
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
  for(const id of ['menu-panel','profile-panel','settings-panel','email-panel'])$('#'+id).close();$('#email-address').textContent='';$('#profile-since').textContent='';$('#sharing').close();$('#invite-code').value='';$('#editor').close();$('#confirm').close();$('#toast').hidden=true;$('#workspace').hidden=true;$('#auth').hidden=false;
  $('#due-banner').hidden=true;$('#due-banner-title').textContent='';$('#items').replaceChildren();$('#account-email').textContent='';$('#password').value='';$('#code').value='';$('#sync-status').textContent='';$('#about-dialog').close();$('#alerts').textContent='Enable alerts';
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
  if(location.hash.startsWith('#plan='))openNotifiedPlan(location.hash.slice(6));
  try{state.alerts=await restorePush();$('#alerts').textContent=state.alerts?'Disable alerts':'Enable alerts'}catch{state.alerts=false;$('#alerts').textContent='Enable alerts'}
}
client.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT'){clearWorkspace();authMode('login')}
  else if(event==='PASSWORD_RECOVERY'){clearWorkspace();authMode('update')}
  else if(['SIGNED_IN','INITIAL_SESSION'].includes(event))setTimeout(()=>establishSession().catch(e=>toast(e.message)),0);
});
$('#switch-auth').onclick=()=>{if(!authBusy)authMode(state.mode==='login'?'register':'login')};
$('#forgot').onclick=()=>{if(!authBusy)authMode('recover')};
$('#verify-existing').onclick=()=>{if(!authBusy)authMode('verify')};
$('#show-password').onclick=()=>{const show=$('#password').type==='password';$('#password').type=show?'text':'password';$('#show-password').textContent=show?'Hide':'Show';$('#show-password').setAttribute('aria-label',show?'Hide password':'Show password');$('#show-password').setAttribute('aria-pressed',String(show))};
$('#auth-form').onsubmit=async e=>{
  e.preventDefault();if(authBusy)return;
  if(!navigator.onLine){$('#auth-error').textContent='You’re offline. Connect to the internet and try again.';return;}
  authBusy=true;$('#auth-submit').disabled=true;$('#auth-form').setAttribute('aria-busy','true');const submitLabel=$('#auth-submit').textContent;$('#auth-submit').textContent='Please wait…';$('#auth-error').textContent='';
  const email=$('#email').value.trim(),password=$('#password').value,token=$('#code').value.trim();
  try{
    let result;
    if(state.mode==='register'){
      result=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/'}});
      if(result.error)throw result.error;
      $('#password').value='';
      // Confirmation must remain required; never open the workspace on registration.
      if(result.data.session)await client.auth.signOut();
      authMode('verify');resendUntil=Date.now()+60000;
      toast('Check your email for a verification code. Delivery depends on the email service.');
    } else if(state.mode==='login'){
      result=await client.auth.signInWithPassword({email,password});if(result.error){if(result.error.code==='email_not_confirmed')authMode('verify');throw result.error;}
      $('#password').value='';await establishSession();
    } else if(state.mode==='verify'){
      result=await client.auth.verifyOtp({email,token,type:'email'});if(result.error)throw result.error;
      authMode('login');await establishSession();
    } else if(state.mode==='recover'){
      result=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'});if(result.error)throw result.error;
      authMode('recoveryverify');resendUntil=Date.now()+60000;
      toast('If the address has an account, a reset email has been requested.');
    } else if(state.mode==='recoveryverify'){
      result=await client.auth.verifyOtp({email,token,type:'recovery'});if(result.error)throw result.error;
      authMode('update');
    } else if(state.mode==='update'){
      result=await client.auth.updateUser({password});if(result.error)throw result.error;
      $('#password').value='';authMode('login');await establishSession();toast('Password updated.');
    }
  }catch(error){$('#auth-error').textContent=authErrorMessage(error)}
  finally{authBusy=false;$('#auth-submit').disabled=false;$('#auth-form').setAttribute('aria-busy','false');if($('#auth-submit').textContent==='Please wait…')$('#auth-submit').textContent=submitLabel}
};
$('#resend').onclick=async()=>{
  if(authBusy)return;
  const remaining=Math.ceil((resendUntil-Date.now())/1000);
  if(remaining>0){$('#auth-error').textContent='Please wait '+remaining+' seconds before requesting another code.';return}
  authBusy=true;$('#resend').disabled=true;
  try{
    const email=$('#email').value.trim();
    if(!$('#email').reportValidity())return;
    const {error}=state.mode==='recoveryverify'?await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'}):await client.auth.resend({type:'signup',email});
    if(error)throw error;resendUntil=Date.now()+60000;toast('Another code has been requested.');
  }catch(e){$('#auth-error').textContent=authErrorMessage(e)}
  finally{authBusy=false;$('#resend').disabled=false}
};
$('#logout').onclick=async()=>{if(state.busy)return;$('#logout').disabled=true;try{await disablePush();const {error}=await client.auth.signOut();if(error)throw error;clearWorkspace();authMode('login')}catch(e){toast(e.message)}finally{$('#logout').disabled=false}};
const filters=()=>({view:state.view,kind:$('#kind-filter').value,priority:$('#priority-filter').value,category:$('#category-filter').value,sort:$('#sort').value,search:$('#search').value});
function dateLabel(t){
  if(t.due_at)return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(t.due_at));
  return t.due_date?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(t.due_date+'T12:00:00')):'No date';
}
function render(){
  const currentFilters=filters();const items=filterItems(state.items,currentFilters);$('#reset-filters').hidden=!currentFilters.search&&currentFilters.kind==='all'&&currentFilters.priority==='all'&&currentFilters.category==='all';
  $('#result-count').textContent=String(items.length);
  $('#items').innerHTML=items.map(t=>`<article class="item ${t.completed?'complete':''} ${overdue(t)?'overdue':''}" data-id="${t.id}">
    <input type="checkbox" data-complete ${t.completed?'checked':''} aria-label="${escape((t.completed?'Reopen ':'Complete ')+t.title)}">
    <div><div class="item-title">${escape(t.title)}</div>${t.description?`<p class="item-desc">${escape(t.description)}</p>`:''}
    <div class="meta">${t.collaborator_id?`<span class="chip">Shared · ${t.user_id===state.user.id?'Owner':'Collaborator'}</span>`:''}<span class="chip">${escape(t.kind)}</span><span class="chip ${t.priority==='high'?'high':''}">${escape(t.priority)} priority</span><span class="chip">${escape(t.category)}</span><span class="chip ${overdue(t)?'high':''}">${overdue(t)?'Overdue · ':''}${escape(dateLabel(t))}</span>${t.duration_minutes?`<span class="chip">${t.duration_minutes} min</span>`:''}</div></div>
    <div class="item-actions"><button data-edit class="link" aria-label="Edit ${escape(t.title)}">Edit</button><button data-share class="link" aria-label="Sharing for ${escape(t.title)}">${t.collaborator_id?'Sharing':'Share'}</button>${t.user_id===state.user.id?`<button data-delete class="link danger" aria-label="Delete ${escape(t.title)}">Delete</button>`:''}</div></article>`).join('');
  $('#empty-action').textContent=state.items.length?'Reset filters':'Add your first plan';
  $('#empty').hidden=items.length>0;$('#empty-title').textContent=state.items.length?'No matching plans':'A little space to begin';$('#empty-copy').textContent=state.items.length?'Try another filter or search.':'Add a task, event or occasion to your day.';
  const {complete,total,percent}=dailyProgress(state.items);
  $('#today-label').textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date());$('#progress-label').textContent=percent+'%';$('#progress').value=percent;
  $('#progress-title').textContent=total?(complete===total?'Today is complete':'Today’s progress'):'No plans for today';
  $('#progress-copy').textContent=total?`${complete} of ${total} today’s plans completed · ${total-complete} remaining`:'Add a plan dated today to start your daily progress.';
  $('#clear').hidden=!state.items.some(t=>t.completed&&t.user_id===state.user.id);
  for(const view of ['all','today','upcoming','overdue','completed'])$('#count-'+view).textContent=state.items.filter(t=>matchesView(t,view)).length;
  lockControls(state.busy);
}
function categories(){
  const current=$('#category-filter').value,list=[...new Set(state.items.map(t=>t.category))].sort();
  $('#category-filter').innerHTML='<option value="all">All categories</option>'+list.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  $('#category-filter').value=list.includes(current)?current:'all';
  const selected=$('#category').value;
  const options=[...new Set(['Uncategorised','Personal','Work','Study','Family','Health & fitness','Finance','Shopping','Travel','Birthdays & occasions','Home',...list])];
  $('#category').innerHTML=options.map(c=>`<option value="${escape(c)}">${escape(c)}</option>`).join('');
  $('#category').value=options.includes(selected)?selected:'Uncategorised';
}
async function refresh(){
  if(!state.user||state.busy)return;
  const epoch=state.epoch,sequence=++refreshSequence;
  $('#sync-status').textContent='Syncing…';
  $('#loading').hidden=false;$('#empty').hidden=true;$('#load-error').hidden=true;
  try{const items=await listPlans();if(epoch!==state.epoch||sequence!==refreshSequence)return;state.items=items;categories();render();$('#sync-status').textContent='Up to date'}
  catch(e){if(epoch===state.epoch){$('#sync-status').textContent='Sync unavailable';$('#load-error').textContent=navigator.onLine?'Could not load your plans. Please try Refresh.':'You’re offline. Reconnect to load your plans.';$('#load-error').hidden=false}}
  finally{if(epoch===state.epoch&&sequence===refreshSequence)$('#loading').hidden=true}
}
function lockControls(busy){
  for(const element of document.querySelectorAll('#add,#join-plan,#clear,#save,#undo,#refresh,#logout,#items button,#items input'))element.disabled=busy;
}
async function mutation(fn,success){
  if(state.busy||!state.user)return;
  if(!navigator.onLine){toast('You’re offline. Reconnect before saving changes.');render();return;}
  state.busy=true;lockControls(true);const epoch=state.epoch;refreshSequence++;
  try{await fn(epoch);if(epoch!==state.epoch)return;categories();render();if(success)toast(success)}
  catch(e){if(epoch===state.epoch){render();$('#item-error').textContent=e.message;toast('Not saved: '+e.message)}}
  finally{state.busy=false;lockControls(false)}
}
function edit(item){
  if(state.busy)return;
  $('#item-form').reset();$('#item-id').value=item?.id||'';$('#editor-title').textContent=item?'Edit plan':'Add a plan';$('#item-error').textContent='';
  $('#item-title').value=item?.title||'';$('#description').value=item?.description||'';$('#kind').value=item?.kind||'task';$('#priority').value=item?.priority||'medium';$('#category').value=item?.category||'Uncategorised';
  $('#due-date').value=item?displayDate(item):'';$('#due-time').value=item?.due_at?new Date(item.due_at).toTimeString().slice(0,5):'';$('#duration').value=item?.duration_minutes||'';
  $('#timezone').textContent='Times use '+Intl.DateTimeFormat().resolvedOptions().timeZone+'. Timed plans follow the same moment across devices.';
  $('#editor').showModal();$('#item-title').focus();
}
$('#add').onclick=()=>edit();
$('#empty-action').onclick=()=>{if(!state.items.length)return edit();state.view='all';$('#search').value='';for(const id of ['kind-filter','priority-filter','category-filter'])$('#'+id).value='all';document.querySelector('[data-view=all]').click()};
for(const id of ['close-editor','cancel-editor'])$('#'+id).onclick=()=>{if(!state.busy)$('#editor').close()};
$('#editor').addEventListener('cancel',e=>{if(state.busy)e.preventDefault()});
$('#item-form').onsubmit=async e=>{
  e.preventDefault();if(state.busy)return;
  let plan;
  try{plan=validatePlan({title:$('#item-title').value,description:$('#description').value,category:$('#category').value,kind:$('#kind').value,priority:$('#priority').value,date:$('#due-date').value,time:$('#due-time').value,duration:$('#duration').value})}
  catch(e){$('#item-error').textContent=e.message;return}
  const id=$('#item-id').value;
  const previous=state.items.find(t=>t.id===id);
  if(previous&&previous.due_date===plan.due_date&&previous.due_at===plan.due_at)plan.reminder_at=previous.reminder_at;
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
  if(e.target.matches('[data-share]'))openSharing(item);
  if(e.target.matches('[data-edit]'))edit(item);
  if(e.target.matches('[data-delete]'))await confirmDelete([item]);
  if(e.target.matches('[data-complete]'))await mutation(async(epoch)=>{const saved=await savePlan({completed:!item.completed},item.id);if(epoch!==state.epoch)return;state.items=state.items.map(t=>t.id===item.id?saved:t)},item.completed?'Plan reopened.':'Plan completed.');
};
$('#clear').onclick=()=>confirmDelete(state.items.filter(t=>t.completed&&t.user_id===state.user.id));
$('#undo').onclick=async()=>{
  const undo=state.undo;if(!undo||undo.userId!==state.user?.id)return;
  await mutation(async(epoch)=>{
    const rows=undo.items.map(({id,title,description,kind,priority,category,completed,due_date,due_at,duration_minutes,reminder_at})=>({id,title,description,kind,priority,category,completed,due_date,due_at,duration_minutes,reminder_at}));
    const {data,error}=await client.from('daymark_items').insert(rows).select();if(error)throw error;
    if(epoch!==state.epoch)return;
    state.items.push(...data);state.undo=null;$('#undo').hidden=true;
  },'Deletion undone.');
};
$('#navigation').onclick=e=>{const button=e.target.closest('[data-view]');if(!button)return;state.view=button.dataset.view;for(const b of document.querySelectorAll('[data-view]')){b.classList.toggle('active',b===button);b.setAttribute('aria-current',b===button?'page':'false')}$('#view-title').textContent=button.getAttribute('aria-label')||button.textContent.trim();render()};
for(const id of ['search','kind-filter','priority-filter','category-filter','sort'])$('#'+id).addEventListener(id==='search'?'input':'change',render);
$('#refresh').onclick=()=>refresh();
$('#today-label').textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
$('#alerts').onclick=async()=>{
  $('#alerts').disabled=true;
  try{if(state.alerts){await disablePush();state.alerts=false;toast('Alerts disabled on this device.')}else{state.alerts=await enablePush();toast('Background alerts enabled on this device.')}}
  catch(e){toast(e.message)}finally{$('#alerts').disabled=false;$('#alerts').textContent=state.alerts?'Disable alerts':'Enable alerts'}
};
setInterval(()=>{if(state.user&&!document.hidden)refresh()},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)refresh()});
authMode('login');

setupInstall(toast);
function connectionStatus(){document.querySelector('#connection').hidden=navigator.onLine;if(navigator.onLine&&state.user)refresh()}
addEventListener('online',connectionStatus);addEventListener('offline',connectionStatus);connectionStatus();
for(const b of document.querySelectorAll('[data-about]'))b.onclick=()=>$('#about-dialog').showModal();
for(const b of document.querySelectorAll('[data-close-dialog]'))b.onclick=()=>b.closest('dialog').close();

$('#reset-filters').onclick=()=>{$('#search').value='';for(const id of ['kind-filter','priority-filter','category-filter'])$('#'+id).value='all';render();$('#search').focus()};
for(const button of document.querySelectorAll('[data-date]'))button.onclick=()=>{const choice=button.dataset.date;if(choice==='clear'){$('#due-date').value='';$('#due-time').value='';return;}const date=new Date();if(choice==='tomorrow')date.setDate(date.getDate()+1);$('#due-date').value=localDate(date)};

let sharingItem=null,sharingBusy=false;
function openSharing(item=null){
 if(state.busy||sharingBusy)return;
 sharingItem=item;$('#sharing-title').textContent=item?'Share this plan':'Link a plan';
 $('#sharing-error').textContent='';$('#invite-code').value='';$('#invite-code').readOnly=!!item;
 $('#invite-field').hidden=!!item;$('#share-copy').hidden=true;
 const owner=item?.user_id===state.user.id;
 $('#sharing-copy').textContent=!item?'Enter the code from the plan owner. You’ll both be able to edit and complete it.':!owner?'You can edit and complete this shared plan. Leave it to remove it from your list.':item.collaborator_id?'This plan is shared with one other person. Remove access to stop sharing.':'Create a single-use code for one person. It expires after 24 hours. Creating another code replaces the previous one.';
 $('#share-submit').hidden=!!item?.collaborator_id;$('#share-submit').textContent=item?'Create code':'Link plan';
 $('#share-revoke').hidden=!item;$('#share-revoke').textContent=owner?'Revoke invitation / access':'Leave plan';
 $('#sharing').showModal();if(!item)$('#invite-code').focus();
}
$('#join-plan').onclick=()=>openSharing();
async function sharingAction(action){
 if(sharingBusy)return;sharingBusy=true;const epoch=state.epoch;
 for(const b of document.querySelectorAll('#sharing button'))b.disabled=true;
 try{
  const {data,error}=await client.rpc('daymark_share',{p_plan:sharingItem?.id||null,p_action:action,p_code:$('#invite-code').value.trim().toLowerCase()});if(error)throw error;
  if(epoch!==state.epoch)return;
  if(action==='invite'){$('#invite-field').hidden=false;$('#invite-code').value=data;$('#share-copy').hidden=false;$('#sharing-copy').textContent='Send this code privately to one person. They should sign in, choose Link a plan, and enter it within 24 hours.'}
  else{$('#sharing').close();await refresh();toast(action==='join'?'Plan linked.':action==='leave'?'You left the plan.':'Invitation and shared access revoked.')}
 }catch(e){$('#sharing-error').textContent=e.message}
 finally{sharingBusy=false;for(const b of document.querySelectorAll('#sharing button'))b.disabled=false}
}
$('#sharing-form').onsubmit=e=>{e.preventDefault();sharingAction(sharingItem?'invite':'join')};
$('#share-revoke').onclick=()=>sharingAction(sharingItem?.user_id===state.user.id?'revoke':'leave');
$('#share-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#invite-code').value);toast('Invitation code copied.')}catch{$('#invite-code').select();$('#sharing-error').textContent='Select and copy the invitation code.'}};

let notifiedPlan=null;
function openNotifiedPlan(id){
 if(!state.user||!id)return;
 const item=state.items.find(t=>t.id===id);
 if(!item){toast('This plan is no longer available.');return;}
 if($('#editor').open){toast('Save or close your current edit, then open the reminder.');return;}
 $('#search').value=item.title;for(const key of ['kind-filter','priority-filter','category-filter'])$('#'+key).value='all';
 document.querySelector('[data-view="all"]').click();
 const card=[...document.querySelectorAll('#items [data-id]')].find(c=>c.dataset.id===id);
 if(card){card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 $('#due-banner').hidden=true;history.replaceState(null,'',location.pathname+location.search);
}
$('#due-open').onclick=()=>openNotifiedPlan(notifiedPlan);
$('#due-dismiss').onclick=()=>{$('#due-banner').hidden=true};
$('#test-alert').onclick=async()=>{
 $('#test-alert').disabled=true;
 try{if(!state.alerts){state.alerts=await enablePush();$('#alerts').textContent='Disable alerts';}await testPush();toast('Test alert requested on this device. Sound follows your device settings.');}
 catch(e){toast(e.message)}finally{$('#test-alert').disabled=false}
};
navigator.serviceWorker?.addEventListener('message',async event=>{
 if(!['PLAN_DUE','OPEN_PLAN'].includes(event.data?.type)||!state.user)return;
 const epoch=state.epoch;await refresh();if(epoch!==state.epoch)return;
 const item=state.items.find(t=>t.id===event.data.id);if(!item||item.completed)return;
 notifiedPlan=item.id;$('#due-banner-title').textContent=item.title;$('#due-banner').hidden=false;
 if(event.data.type==='OPEN_PLAN')openNotifiedPlan(item.id);
});

$('#open-menu').onclick=()=>$('#menu-panel').showModal();
for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{
 $('#menu-panel').close();
 $('#email-address').textContent=state.user?.email||'';
 $('#profile-since').textContent=state.user?.created_at?'Joined '+new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(new Date(state.user.created_at)):'';
 $('#'+button.dataset.panel).showModal();
};
for(const button of document.querySelectorAll('[data-mobile-view]'))button.onclick=()=>{
 $('#menu-panel').close();document.querySelector('[data-view="'+button.dataset.mobileView+'"]').click();
};
$('#mobile-link').onclick=()=>{$('#menu-panel').close();$('#join-plan').click()};
$('#copy-email').onclick=async()=>{try{await navigator.clipboard.writeText(state.user.email);toast('Email address copied.')}catch{toast('Copy the email address shown above.')}};

$('#rail-add').onclick=()=>$('#add').click();
$('#rail-search').onclick=()=>{$('#search').focus();$('#search').scrollIntoView({block:'center'})};
for(const control of document.querySelectorAll('.icon-rail [title]')){
 const show=()=>{$('#rail-tip').textContent=control.getAttribute('title');$('#rail-tip').hidden=false};
 const hide=()=>{$('#rail-tip').hidden=true};
 control.addEventListener('pointerenter',show);control.addEventListener('pointerleave',hide);
 control.addEventListener('focus',show);control.addEventListener('blur',hide);control.addEventListener('click',hide);
}
