// Cache only public interface files. Never cache sessions, API responses or plans.
const CACHE='daymark-shell-1.0.0-__BUILD_ID__';
const ASSETS=['/offline.html','/app.js','/styles.css','/favicon.svg','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  for(const path of ASSETS){
    const response=await fetch(new Request(path,{cache:'reload'}));
    if(!response.ok||response.redirected||response.type==='opaque')throw Error('App assets unavailable');
    await cache.put(path,response);
  }
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('daymark-shell-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    // Respect the host's access check online. Offline displays no private records.
    event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));return;
  }
  if(!ASSETS.includes(url.pathname)||url.search)return;
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});

function notificationOptions(tag,test=false){
 return {
  body:test?'Alerts are ready. Sound and vibration follow your device settings.':'Your scheduled plan needs your attention. Tap View plan to open it.',
  tag,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
  requireInteraction:true,renotify:true,silent:false,vibrate:[250,100,250,100,400],
  timestamp:Date.now(),data:{planId:test?null:tag},
  actions:[{action:'open',title:test?'Open Daymark':'View plan'},{action:'dismiss',title:'Dismiss'}]
 };
}
async function showAlert(tag,test=false){
 const title=test?'Daymark · Test alert':'Daymark · Plan due now',options=notificationOptions(tag,test);
 try{await self.registration.showNotification(title,options)}
 catch{await self.registration.showNotification(title,{body:options.body,tag,icon:options.icon,data:options.data})}
}
self.addEventListener('message',event=>{
 if(event.data?.type==='TEST_ALERT')event.waitUntil(showAlert('daymark-test',true));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();if(event.action==='dismiss')return;
 event.waitUntil((async()=>{
  const id=event.notification.data?.planId;
  const valid=typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.focus();if(valid)existing.postMessage({type:'OPEN_PLAN',id});return;}
  return self.clients.openWindow(valid?'/#plan='+encodeURIComponent(id):'/');
 })());
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload={};try{payload=event.data?.json()||{}}catch{}
  const tag=typeof payload.tag==='string'?payload.tag:'daymark-reminder';
  await showAlert(tag);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(new URL(client.url).origin===self.location.origin)client.postMessage({type:'PLAN_DUE',id:tag});
 })());
});
