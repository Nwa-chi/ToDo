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
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing)return existing.focus();return self.clients.openWindow('/');
  })());
});

self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let payload={};try{payload=event.data?.json()||{}}catch{}
  await self.registration.showNotification('Daymark reminder',{
   body:'A plan is due. Open Daymark to view it.',tag:typeof payload.tag==='string'?payload.tag:'daymark-reminder',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png'
  });
 })());
});
