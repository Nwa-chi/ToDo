// Real Chromium UI tests against a controlled API boundary.
// These do not test delivery of real emails or replace live database RLS tests.
import { chromium } from 'playwright';
import { createServer } from '../server.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results',{recursive:true});
const server=createServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
let page;

function rosterPDF(){
  const content='BT /F1 16 Tf 50 720 Td (2026-10-17 06:45 - 15:15) Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[];
  for(const [index,object] of objects.entries()){
    offsets.push(pdf.length);
    pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+='xref\n0 6\n0000000000 65535 f \n';
  for(const offset of offsets)pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

try{
 browser=await chromium.launch({headless:true,
   ...(process.env.DAYMARK_TEST_BROWSER ? {executablePath:process.env.DAYMARK_TEST_BROWSER,args:['--no-sandbox','--disable-gpu','--use-gl=disabled','--disable-software-rasterizer','--disable-dev-shm-usage','--no-zygote']} : {})
 });
 page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const user={id:'00000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'browser-test@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.test-signature';
 const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'test-refresh',user};
 let rows=[],writes=0,clearWrites=0,planReadStatus=200;
 await page.route('https://uolwbaappjrggtaydvsq.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname==='/auth/v1/signup')return respond({user:{...user,email_confirmed_at:null}});
   if(url.pathname==='/auth/v1/verify'){
     return request.postDataJSON().token==='000000'?respond({msg:'Invalid verification code'},400):respond(session);
   }
   if(url.pathname==='/auth/v1/token')return request.postDataJSON().password==='Browser-test-password!'
     ?respond(session):respond({code:'invalid_credentials',msg:'Invalid login credentials'},400);
   if(url.pathname==='/auth/v1/user')return respond(user);
   if(url.pathname==='/auth/v1/logout')return respond({});
   if(url.pathname==='/rest/v1/daymark_items'){
     if(method==='GET')return planReadStatus===200?respond(rows):respond({message:'Test read failure'},planReadStatus);
     if(method==='POST'){
       writes++;const body=request.postDataJSON();
       const make=t=>({id:crypto.randomUUID(),user_id:user.id,completed:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),completed_at:null,...t});
       const added=(Array.isArray(body)?body:[body]).map(make).filter(row=>!rows.some(existing=>existing.id===row.id));
       rows.push(...added);return respond(Array.isArray(body)?added:added[0],201);
     }
     if(method==='PATCH'){
       const id=url.searchParams.get('id').slice(3),body=request.postDataJSON();const row=rows.find(t=>t.id===id);Object.assign(row,body);return respond(row);
     }
     if(method==='DELETE'){
       const ids=url.searchParams.get('id');
       const removed=rows.filter(t=>ids.includes(t.id)&&!t.completed);
       rows=rows.filter(t=>!removed.includes(t));
       return respond(removed.map(t=>({id:t.id})));
     }
   }
   if(url.pathname==='/rest/v1/rpc/daymark_clear_completed'){
     const {p_plan_ids:ids,p_confirmation:phrase}=request.postDataJSON();
     clearWrites++;
     if(phrase!=='CLEAR')return respond({message:'Type CLEAR to confirm.'},400);
     const removed=rows.filter(t=>ids.includes(t.id)&&t.completed&&t.user_id===user.id);
     rows=rows.filter(t=>!removed.includes(t));
     return respond(removed);
   }
   if(url.pathname==='/rest/v1/rpc/daymark_invitation')return respond([]);
   return respond({message:'Unexpected test endpoint'},404);
 });
 await page.goto(base);
 await page.locator('#auth input').first().waitFor();
 assert.equal(await page.locator('#session-status').isVisible(),false,'fresh sign-in should not show a connection warning');
 for(const width of [1440,900,801]){
   await page.setViewportSize({width,height:900});
   const lines=await page.locator('.auth-story h1').evaluate(heading=>{
     const range=document.createRange();
     const tops=[...heading.childNodes].flatMap(node=>{
       if(node.nodeType!==Node.TEXT_NODE)return [];
       range.selectNodeContents(node);
       return [...range.getClientRects()].map(rect=>rect.top);
     });
     return new Set(tops).size;
   });
   assert.equal(lines,2,`sign-in headline at ${width}px`);
 }
 await page.setViewportSize({width:320,height:640});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'signed-out mobile overflow');
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#switch-auth').click();
 await page.locator('#email').fill(user.email);await page.locator('#password').fill('Browser-test-password!');
 await page.locator('#auth-submit').click();
 await page.locator('#code').waitFor({state:'visible'});
 assert.equal(await page.locator('#workspace').isVisible(),false);
 await page.locator('#code').fill('000000');await page.locator('#auth-submit').click();
 await page.locator('#auth-error').filter({hasText:'Invalid'}).waitFor();
 assert.equal(await page.locator('#workspace').isVisible(),false);
 await page.locator('#code').fill('123456');await page.locator('#auth-submit').click();
 await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await page.locator('#view-title').textContent(),'Today');
 await page.getByRole('button',{name:'All plans',exact:true}).click();
 await page.locator('#add').click();
 await page.locator('#item-title').fill('Launch planning');
 await page.locator('#description').fill('Check the event details');
 await page.locator('#kind').selectOption('event');
 await page.locator('#due-date').fill('2026-10-01');
 await page.locator('#due-time').fill('14:30');
 await page.locator('#priority').selectOption('high');
 await page.locator('#category').selectOption('Work');
 await page.locator('#save').click();
 await page.locator('.item-title').filter({hasText:'Launch planning'}).waitFor();
 assert.equal(writes,1);
 const firstArrow=page.locator('.agenda-arrow');
 await firstArrow.waitFor({state:'visible'});
 assert.equal(await firstArrow.textContent(),'');
 const normalArrow=await firstArrow.evaluate(arrow=>{
   const item=arrow.closest('.item');
   const originalColor=item.getAttribute('data-agenda-color');
   item.dataset.agendaColor='green';
   const style=getComputedStyle(arrow);
   const shape={width:parseFloat(style.width),clip:style.clipPath};
   if(originalColor===null)item.removeAttribute('data-agenda-color');
   else item.dataset.agendaColor=originalColor;
   return shape;
 });
 assert.ok(Math.abs(normalArrow.width/28-.98)<.002);
 assert.match(normalArrow.clip,/0px 100%, 3\.5px 50%\)$/,'forked tail');
 const redStyles=await firstArrow.evaluate(arrow=>{
   const item=arrow.closest('.item');
   const root=document.documentElement;
   const originalColor=item.getAttribute('data-agenda-color');
   const originalTheme=root.dataset.theme;
   item.dataset.agendaColor='red';
   try {
     return ['light','dark'].map(theme=>{
       root.dataset.theme=theme;
       const name=getComputedStyle(item.querySelector('.agenda-name'));
       const shaft=getComputedStyle(arrow);
       const error=getComputedStyle(document.querySelector('#load-error'));
       return {styles:[name.color,shaft.backgroundColor,shaft.getPropertyValue('--arrow-half-shaft').trim(),name.fontWeight,error.color,error.fontWeight],width:parseFloat(shaft.width)};
     });
   } finally {
     root.dataset.theme=originalTheme;
     if(originalColor===null)item.removeAttribute('data-agenda-color');
     else item.dataset.agendaColor=originalColor;
   }
 });
 for(const [index,color] of ['rgb(220, 0, 0)','rgb(255, 72, 72)'].entries()){
   assert.deepEqual(redStyles[index].styles,[color,color,'2.5px','900',color,'800']);
   assert.ok(Math.abs(redStyles[index].width/31-.98)<.002);
 }
 assert.equal(await page.locator('.item-desc').isVisible(),false,'saved plans start collapsed');
 assert.equal(await page.locator('[data-edit]').isVisible(),false);
 await page.locator('.item-title').press('Enter');
 await page.locator('.item-desc').waitFor({state:'visible'});
 await page.locator('[data-edit]').click();await page.locator('#item-title').fill('Updated launch planning');await page.locator('#save').click();
 await page.locator('.item-title').filter({hasText:'Updated'}).waitFor();
 planReadStatus=500;
 await page.locator('#refresh').click();
 await page.locator('#load-error').waitFor({state:'visible'});
 assert.equal(await page.locator('.agenda-name').textContent(),'Updated launch planning');
 planReadStatus=200;
 await page.locator('#refresh').click();
 await page.locator('#sync-status').filter({hasText:'Up to date'}).waitFor();
 assert.equal(await page.locator('#load-error').isVisible(),false);
 await page.locator('#rail-search').click();
 await page.locator('#search').fill('no match');assert.equal(await page.locator('.item').count(),0);
 await page.locator('#search').fill('event details');assert.equal(await page.locator('.item').count(),1);
 await page.locator('#search').fill('');
 await page.locator('#kind-filter').selectOption('task');assert.equal(await page.locator('.item').count(),0);
 await page.locator('#kind-filter').selectOption('event');assert.equal(await page.locator('.item').count(),1);
 await page.locator('#priority-filter').selectOption('high');assert.equal(await page.locator('.item').count(),1);
 await page.locator('#reset-filters').click();
 await page.locator('#search-panel').getByRole('button',{name:'Show plans'}).click();
 await page.locator('.item:not([open]) .item-title').click();
 await page.locator('[data-delete]').click();
 await page.locator('#confirm button[value=yes]').click();
 await page.locator('#undo').waitFor({state:'visible'});
 await page.locator('#undo').click();
 await page.locator('.item-title').click();
 await page.locator('[data-complete]').check();
 await page.locator('[data-view=completed]').click();
 await page.locator('.item.complete').waitFor();
 await page.locator('[data-delete]').click();
 const clearDialog=page.locator('#clear-completed');
 const phrase=clearDialog.locator('#clear-phrase');
 const submitClear=clearDialog.locator('#clear-submit');
 const clearPlan=clearDialog.locator('#clear-plan');
 const clearIndividually=clearDialog.getByRole('radio',{name:'Clear individually'});
 const clearAll=clearDialog.getByRole('radio',{name:'Clear all completed'});
 assert.equal(await clearIndividually.isChecked(),true);
 assert.equal(await clearPlan.inputValue(),rows[0].id);
 await phrase.fill('clear');
 assert.equal(await submitClear.isEnabled(),false);
 await phrase.fill('CLEAR ');
 await phrase.press('Enter');
 assert.equal(await submitClear.isEnabled(),false);
 assert.equal(clearWrites,0);
 await phrase.fill('CLEAR');
 await submitClear.click();
 await page.locator('#undo').waitFor({state:'visible'});
 assert.equal(await page.locator('.item').count(),0);
 await page.locator('#undo').click();await page.locator('.item').waitFor();
 await page.reload();
 await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await page.locator('#view-title').textContent(),'Today');
 await page.getByRole('button',{name:'Completed',exact:true}).click();
 await page.locator('.item.complete .item-title').filter({hasText:'Updated launch planning'}).waitFor();
 assert.equal(await page.locator('.item').count(),1);
 assert.equal(await page.locator('.item-desc').isVisible(),false,'reload collapses plan details');
 const otherCompleted={...rows[0],id:crypto.randomUUID(),title:'Second completed plan'};
 const openPlan={...rows[0],id:crypto.randomUUID(),title:'Still open',completed:false};
 rows.push(otherCompleted,openPlan);
 await page.locator('#refresh').click();
 await page.locator('.item-title').filter({hasText:otherCompleted.title}).waitFor();
 await page.locator('#clear').click();
 await phrase.fill('CLEAR');
 assert.equal(await submitClear.isEnabled(),false,'select an individual plan before clearing');
 await clearPlan.selectOption(otherCompleted.id);
 assert.equal(await phrase.inputValue(),'','changing the selected plan clears the phrase');
 await phrase.fill('CLEAR');
 await clearAll.check();
 assert.equal(await phrase.inputValue(),'','switching to all requires fresh confirmation');
 assert.equal(await submitClear.isEnabled(),false);
 await phrase.fill('CLEAR');
 await clearDialog.getByRole('button',{name:'Cancel'}).click();
 assert.equal(clearWrites,1,'cancelling never clears');
 await page.locator('#clear').click();
 await clearAll.check();
 await clearDialog.getByRole('status').filter({hasText:'This will clear 2 completed plans.'}).waitFor();
 await phrase.fill('CLEAR');
 await submitClear.click();
 await page.locator('#undo').waitFor({state:'visible'});
 assert.deepEqual(rows.map(plan=>plan.id),[openPlan.id]);
 await page.locator('#undo').click();
 await page.locator('.item-title').filter({hasText:otherCompleted.title}).waitFor();
 assert.equal(rows.filter(plan=>plan.completed).length,2);
 const sharedId='00000000-0000-4000-8000-000000000088';
 rows.push({id:sharedId,user_id:crypto.randomUUID(),collaborator_id:user.id,title:'Shared appointment',description:'Read-only details',category:'Work',kind:'event',priority:'medium',completed:false,created_at:new Date().toISOString(),due_date:'2026-10-01'});
 await page.getByRole('button',{name:'All plans',exact:true}).click();
 await page.locator('#refresh').click();
 const shared=page.locator(`[data-id="${sharedId}"]`);
 await shared.locator('.item-title').waitFor();
 assert.equal(await shared.locator('.item-desc').isVisible(),false);
 await page.evaluate(id=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'OPEN_PLAN',id}})),sharedId);
 await shared.locator('.item-desc').waitFor({state:'visible'});
 assert.equal(await shared.locator('[data-edit], [data-complete], [data-delete]').count(),0);
 await shared.locator('[data-share]').click();
 await page.locator('#share-revoke').filter({hasText:'Leave plan'}).waitFor();
 await page.locator('#sharing [data-close-dialog]').click();
 await shared.locator('.item-title').click();
 assert.equal(await shared.locator('.item-desc').isVisible(),false);
 await page.screenshot({path:'test-results/desktop.png',fullPage:true});
 for(const width of [1280,320,390]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'header overflow');
   const actions=await page.locator('.header-tools button').evaluateAll(buttons=>buttons.map(button=>{
     const bounds=button.getBoundingClientRect();
     const icon=button.querySelector('svg').getBoundingClientRect();
     return {name:button.getAttribute('aria-label'),width:bounds.width,height:bounds.height,center:bounds.top+bounds.height/2,left:bounds.left,right:bounds.right,icon:icon.width};
   }));
   const [invitations,importSchedule,addPlan]=actions;
   assert.deepEqual(actions.map(action=>action.name),['Invitations','Import schedule','Add plan']);
   assert.equal(invitations.center,importSchedule.center);
   assert.equal(addPlan.center,importSchedule.center);
   assert.equal(importSchedule.left-invitations.right,6);
   assert.equal(addPlan.left-importSchedule.right,6);
   assert.deepEqual(actions.map(action=>[action.width,action.height]),[[44,44],[45,45],[45,45]]);
   assert.ok(Math.abs(importSchedule.icon/invitations.icon-1.02)<0.002);
   assert.equal(addPlan.icon,importSchedule.icon);
 }
 await page.getByRole('button',{name:'Invitations',exact:true}).click();
 await page.locator('#invitations-panel').getByRole('button',{name:'Close invitations'}).click();
 await page.locator('#close-sidebar').click();
 assert.equal(await page.locator('#daymark-sidebar').isVisible(),false);
 assert.equal(await page.locator('#open-menu').getAttribute('aria-expanded'),'false');
 await page.reload();
 await page.locator('#workspace').waitFor({state:'visible'});
 assert.equal(await page.locator('#daymark-sidebar').isVisible(),false,'sidebar preference persists');
 await page.locator('#open-menu').click();
 assert.equal(await page.locator('#daymark-sidebar').isVisible(),true);
 for(const panel of ['settings','email']){
   await page.locator(`.icon-rail [data-panel="${panel}-panel"]`).click();
   const dialog=page.locator(`#${panel}-panel`);
   await dialog.waitFor({state:'visible'});
   await dialog.locator('[data-close-dialog]').click();
 }
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
 await page.locator('.icon-rail [data-panel="profile-panel"]').click();
 await page.locator('#logout').click();await page.locator('#auth').waitFor({state:'visible'});
 assert.equal(await page.locator('.item').count(),0);
 await page.locator('#email').fill(user.email);
 await page.locator('#password').fill('Wrong-password!');
 await page.locator('#auth-submit').click();
 await page.locator('#auth-error').filter({hasText:'The email or password was not recognised'}).waitFor();
 assert.equal(await page.locator('#workspace').isVisible(),false);
 await page.locator('#password').fill('Browser-test-password!');
 await page.locator('#auth-submit').click();
 await page.locator('#workspace').waitFor({state:'visible'});
 await page.getByRole('button',{name:'All plans',exact:true}).click();
 await page.locator('#open-schedule-import').click();
 const file=page.locator('#schedule-file');
 const review=page.locator('#schedule-rows .schedule-row');
 await file.setInputFiles({name:'roster.pdf',mimeType:'application/pdf',buffer:rosterPDF()});
 await page.locator('#schedule-status').filter({hasText:'1 shift found'}).waitFor();
 assert.equal(await review.locator('[name="start"]').inputValue(),'06:45');
 const png=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');
   canvas.width=1100;canvas.height=280;
   const context=canvas.getContext('2d');
   context.fillStyle='#fff';context.fillRect(0,0,1100,280);
   context.font='48px sans-serif';context.fillStyle='#000';
   context.fillText('DATE                 START     END',50,80);
   context.fillText('18/10/2026       06:45     15:15',50,150);
   context.fillText('19/10/2026       22:45     07:15',50,220);
   return canvas.toDataURL().split(',')[1];
 });
 await file.setInputFiles({name:'rota.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.locator('#schedule-status').filter({hasText:'2 shifts found'}).waitFor({timeout:30_000});
 assert.deepEqual(await review.locator('[name="date"]').evaluateAll(inputs=>inputs.map(input=>input.value)),['2026-10-18','2026-10-19']);
 assert.deepEqual(await review.locator('[name="start"]').evaluateAll(inputs=>inputs.map(input=>input.value)),['06:45','22:45']);
 const roster={name:'roster.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Start,End\n2026-10-20,06:45,15:15\n2026-10-20,22:45,07:15')};
 await file.setInputFiles(roster);
 await page.locator('#schedule-status').filter({hasText:'2 shifts found'}).waitFor();
 assert.equal(await review.count(),2);
 await page.locator('#schedule-save').click();
 await page.locator('#schedule-import').waitFor({state:'hidden'});
 const imported=rows.filter(row=>row.title==='Work shift');
 assert.equal(imported.length,2);
 assert.ok(imported.every(row=>row.reminder_at===row.due_at&&row.duration_minutes===510));
 const shiftCards=page.locator('.item').filter({hasText:'Work shift'});
 assert.deepEqual(await shiftCards.locator('.agenda-arrow').allTextContents(),['','']);
 await page.locator('#open-schedule-import').click();
 await file.setInputFiles(roster);
 await page.locator('#schedule-status').filter({hasText:'2 shifts found'}).waitFor();
 await page.locator('#schedule-save').click();
 await page.locator('#schedule-import').waitFor({state:'hidden'});
 assert.equal(rows.filter(row=>row.title==='Work shift').length,2,'repeat import should not duplicate plans');
 let releaseChecks=0;
 await page.route('**/build.json?check=*',async route=>{
   releaseChecks++;
   await route.fulfill({contentType:'application/json',body:JSON.stringify({id:'0123456789abcdef'})});
 });
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 const update=page.locator('#notice').getByRole('button',{name:'Update Daymark',exact:true});
 await update.waitFor();
 assert.equal(releaseChecks,1,'reopening a mounted app checks for a newer build');
 await update.click();
 await page.waitForURL(url=>url.searchParams.get('build')==='0123456789abcdef');
 await page.locator('#workspace').waitFor({state:'visible'});
 await page.unroute('**/build.json?check=*');
 await page.goto(base);
 await page.locator('#workspace').waitFor({state:'visible'});
 await page.evaluate(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 await page.locator('#add').click();
 await page.locator('#item-title').fill('Unsaved plan');
 await page.route('**/build.json?check=*',route=>route.fulfill({
   contentType:'application/json',body:JSON.stringify({id:'fedcba9876543210'})
 }));
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 await update.waitFor();
 assert.equal(await page.locator('#item-title').inputValue(),'Unsaved plan');
 await page.locator('#cancel-editor').click();
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 await page.waitForURL(url=>url.searchParams.get('build')==='fedcba9876543210');
 await page.locator('#workspace').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
 console.log('PASS: plan and account flows, typed single and bulk clears, undo, shared plans, mobile, agenda arrows, work schedule import and installed app updates. API mocked.');
}catch(error){
 if(page && !page.isClosed()){
   await page.screenshot({path:'test-results/failure.png',timeout:5_000})
     .catch(cause=>console.warn('Could not capture failure screenshot:',cause.message));
 }
 throw error;
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
