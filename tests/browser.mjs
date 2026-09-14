// Real Chromium UI tests against a controlled API boundary.
// These do not test delivery of real emails or replace live database RLS tests.
import { chromium } from 'playwright';
import { createServer } from '../server.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const server=createServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,
   ...(process.env.DAYMARK_TEST_BROWSER ? {executablePath:process.env.DAYMARK_TEST_BROWSER,args:['--no-sandbox','--disable-gpu','--use-gl=disabled','--disable-software-rasterizer','--disable-dev-shm-usage','--no-zygote']} : {})
 });
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const user={id:'00000000-0000-4000-8000-000000000099',aud:'authenticated',role:'authenticated',email:'browser-test@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})+'.test-signature';
 const session={access_token:token,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'test-refresh',user};
 let rows=[],writes=0;
 await page.route('https://uolwbaappjrggtaydvsq.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname==='/auth/v1/signup')return respond({user:{...user,email_confirmed_at:null}});
   if(url.pathname==='/auth/v1/verify'){
     return request.postDataJSON().token==='000000'?respond({msg:'Invalid verification code'},400):respond(session);
   }
   if(url.pathname==='/auth/v1/token')return respond(session);
   if(url.pathname==='/auth/v1/user')return respond(user);
   if(url.pathname==='/auth/v1/logout')return respond({});
   if(url.pathname==='/rest/v1/daymark_items'){
     if(method==='GET')return respond(rows);
     if(method==='POST'){
       writes++;const body=request.postDataJSON();
       const make=t=>({id:crypto.randomUUID(),user_id:user.id,completed:false,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),completed_at:null,...t});
       const added=(Array.isArray(body)?body:[body]).map(make);rows.push(...added);return respond(Array.isArray(body)?added:added[0],201);
     }
     if(method==='PATCH'){
       const id=url.searchParams.get('id').slice(3),body=request.postDataJSON();const row=rows.find(t=>t.id===id);Object.assign(row,body);return respond(row);
     }
     if(method==='DELETE'){const ids=url.searchParams.get('id');const removed=rows.filter(t=>ids.includes(t.id));rows=rows.filter(t=>!ids.includes(t.id));return respond(removed.map(t=>({id:t.id})))}
   }
   return respond({message:'Unexpected test endpoint'},404);
 });
 await page.goto(base);
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
 await page.locator('#add').click();
 await page.locator('#item-title').fill('Launch planning');
 await page.locator('#description').fill('Check the event details');
 await page.locator('#kind').selectOption('event');
 await page.locator('#due-date').fill('2026-10-01');
 await page.locator('#due-time').fill('14:30');
 await page.locator('#category').selectOption('Work');
 await page.locator('#save').click();
 await page.locator('.item-title').filter({hasText:'Launch planning'}).waitFor();
 assert.equal(writes,1);
 await page.locator('[data-edit]').click();await page.locator('#item-title').fill('Updated launch planning');await page.locator('#save').click();
 await page.locator('.item-title').filter({hasText:'Updated'}).waitFor();
 await page.locator('#search').fill('no match');assert.equal(await page.locator('.item').count(),0);
 await page.locator('#search').fill('event details');assert.equal(await page.locator('.item').count(),1);
 await page.locator('#search').fill('');
 await page.locator('[data-complete]').check();
 await page.locator('[data-view=completed]').click();
 await page.locator('.item.complete').waitFor();
 await page.locator('[data-delete]').click();
 await page.locator('#confirm button[value=yes]').click();
 await page.locator('#undo').waitFor({state:'visible'});
 assert.equal(await page.locator('.item').count(),0);
 await page.locator('#undo').click();await page.locator('.item').waitFor();
 await page.reload();await page.locator('.item').waitFor();
 assert.equal(await page.locator('.item').count(),1);
 await mkdir('test-results',{recursive:true});
 await page.screenshot({path:'test-results/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile overflow');
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
 await page.locator('#logout').click();await page.locator('#auth').waitFor({state:'visible'});
 assert.equal(await page.locator('.item').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: browser signup/OTP gate, create/edit/complete/search/delete/undo, reload, mobile width, logout. API mocked; no email was sent.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
