// Cache only public interface files. Never cache sessions, API responses or plans.
const CACHE='daymark-shell-__APP_VERSION__-__BUILD_ID__';
const ASSETS=['/offline.html','/app.js?v=__BUILD_ID__','/styles.css?v=__BUILD_ID__','/favicon.svg','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  const abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),3000);
  await Promise.allSettled(ASSETS.map(async path=>{
    const response=await fetch(new Request(new URL(path,self.location.origin),{cache:'reload',signal:abort.signal}));
    if(!response.ok||response.type==='opaque')return;
    // Cloudflare Pages redirects HTML files to extensionless paths.
    if(response.redirected&&(path!=='/offline.html'||response.url!==self.location.origin+'/offline'))return;
    const asset=response.redirected?new Response(response.body,{headers:response.headers}):response;
    await cache.put(path,asset);
  }));
  clearTimeout(timeout);
})().catch(()=>{})));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  try{for(const key of await caches.keys())if(key.startsWith('daymark-shell-')&&key!==CACHE)await caches.delete(key)}catch{}
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();
 if(event.data?.type==='DAYMARK_PUSH_VERSION')event.ports[0]?.postMessage(1);
 if(event.data?.type==='TEST_ALERT')event.waitUntil(showAlert('daymark-test',null,'test'));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    // Respect the host's access check online. Offline displays no private records.
    event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>{
      const fallback=await caches.match('/offline.html').catch(()=>null);
      return fallback||new Response('Daymark is offline. Reconnect and reopen the app.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }));return;
  }
  if(!ASSETS.includes(url.pathname+url.search))return;
  event.respondWith(caches.match(request).catch(()=>null).then(cached=>cached||fetch(request)));
});

const reminderText={
 green:['Plan starts in 3 hours','A scheduled plan starts in three hours.'],
 yellow:['Plan starts in 1 hour','A scheduled plan starts in one hour.'],
 red:['Plan starts in 10 minutes','A scheduled plan starts in ten minutes.'],
 due:['Plan due now','Your scheduled plan needs your attention.'],
 invitation:['Plan invitation','Someone invited you to share a plan. Open Daymark to accept or decline.'],
 test:['Test alert','This is a test of your agenda reminders.']
};
function notificationOptions(tag,planId,stage){
 const invitation=stage==='invitation',test=stage==='test';
 return {
  body:reminderText[stage][1],
  tag,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
  requireInteraction:true,renotify:true,silent:false,vibrate:[250,100,250,100,400],
  timestamp:Date.now(),data:{planId,invitation},
  actions:[{action:'open',title:test?'Open Daymark':invitation?'Review invitation':'View plan'},{action:'dismiss',title:'Dismiss'}]
 };
}
async function showAlert(tag,planId,stage){
 const title='Daymark · '+reminderText[stage][0],options=notificationOptions(tag,planId,stage);
 try{await self.registration.showNotification(title,options)}
 catch{await self.registration.showNotification(title,{body:options.body,tag,icon:options.icon,data:options.data})}
}
self.addEventListener('notificationclick',event=>{
 event.notification.close();if(event.action==='dismiss')return;
 event.waitUntil((async()=>{
  const invitation=event.notification.data?.invitation===true;
  const id=event.notification.data?.planId;
  const valid=typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.focus();if(invitation){existing.postMessage({type:'OPEN_INVITATIONS'});return;}if(valid)existing.postMessage({type:'OPEN_PLAN',id});return;}
  return self.clients.openWindow(invitation?'/#invitations':valid?'/#plan='+encodeURIComponent(id):'/');
 })());
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload={};try{payload=event.data?.json()||{}}catch{}
  const tag=typeof payload.tag==='string'?payload.tag:'daymark-reminder';
  const invitation=payload.kind==='invitation';
  const timed=/^([a-f0-9-]{36}):(green|yellow|red)$/i.exec(tag);
  const stage=invitation?'invitation':timed?.[2].toLowerCase()||'due';
  const planId=invitation?null:timed?.[1]||tag;
  await showAlert(tag,planId,stage);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(new URL(client.url).origin===self.location.origin)client.postMessage({type:invitation?'INVITATION_RECEIVED':'PLAN_DUE',id:planId,stage,title:reminderText[stage][0]});
 })());
});
