import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {authErrorMessage} from '../src/auth-errors.js';
const worker=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
function environment(){
 const listeners={},cached=new Map(),network=[];
 const self={location:{origin:'https://daymark.test'},addEventListener:(name,fn)=>listeners[name]=fn,clients:{claim:async()=>{}},skipWaiting:()=>{}};
 const cache={put:async(k,v)=>cached.set(k,v),match:async k=>cached.get(k)};
 const context={self,URL,Request,Error,caches:{open:async()=>cache,match:async r=>cached.get(typeof r==='string'?r:r.url),keys:async()=>[],delete:async()=>true},fetch:async r=>{network.push(r);return new Response('online')}};
 vm.runInNewContext(worker,context);return{listeners,cached,network,context};
}
test('install manifest has valid icons, standalone scope and version',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 for(const icon of manifest.icons){const png=await readFile(new URL('../public'+icon.src,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');const size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.version,'1.0.0');
});
test('service worker bypasses auth, database, writes and unknown resources',()=>{
 const {listeners}=environment();
 for(const [url,method] of [['https://backend.test/auth/v1/token','POST'],['https://backend.test/rest/v1/daymark_items','GET'],['https://daymark.test/api/private','GET'],['https://daymark.test/app.js?token=x','GET'],['https://daymark.test/app.js','POST']]){
 let intercepted=false;listeners.fetch({request:{url,method},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
 }
});
test('online navigation uses host access checks; offline returns only fallback',async()=>{
 const {listeners,cached,context}=environment();cached.set('/offline.html',new Response('offline interface'));
 let response;const event={request:{url:'https://daymark.test/',method:'GET',mode:'navigate'},respondWith:r=>response=r};
 listeners.fetch(event);assert.equal(await(await response).text(),'online');
 context.fetch=async()=>{throw Error('offline')};listeners.fetch(event);assert.equal(await(await response).text(),'offline interface');
});
test('email-delivery errors explain service failure without claiming success',()=>{
 assert.match(authErrorMessage({message:'Error sending confirmation email'}),/couldn’t send/);
 assert.match(authErrorMessage({code:'email_not_confirmed'}),/Verify your email/);
 assert.match(authErrorMessage({code:'invalid_credentials'}),/not recognised/);
 assert.match(authErrorMessage({status:429}),/wait/);
});
test('push displays a generic notification without private payload text',async()=>{
 const {listeners,context}=environment();let shown,done;
 context.self.registration={showNotification:async(title,options)=>shown={title,options}};
 listeners.push({data:{json:()=>({title:'Private title',body:'Sensitive description',tag:'plan-id'})},waitUntil:p=>done=p});
 await done;assert.equal(shown.title,'Daymark reminder');assert.equal(shown.options.tag,'plan-id');assert.ok(!shown.options.body.includes('Sensitive'));
 listeners.push({data:{json:()=>{throw Error('invalid')}},waitUntil:p=>done=p});await done;assert.equal(shown.options.tag,'daymark-reminder');
});
