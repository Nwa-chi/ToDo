import {client} from './api.js';
import {registerDaymarkWorker} from './pwa.js';
async function settings(params={}){const {data,error}=await client.rpc('daymark_push_settings',params);if(error)throw error;return data;}
async function registration(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window))throw Error('Install Daymark on your Home Screen and open it there, or use a browser with push support.');
 const registered=await registerDaymarkWorker().catch(()=>{
  throw Error('Daymark couldn’t start notifications. Reopen the app online and try again.');
 });
 if(registered.active)return registered;
 let timeout;
 try{
  return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{
   timeout=setTimeout(()=>reject(Error('Daymark’s notification worker did not start. Close and reopen the app while online.')),12000);
  })]);
 }finally{clearTimeout(timeout)}
}
async function saveSubscription(reg,subscription){
 const channel=new MessageChannel();
 let timeout;
 try{
  const version=await new Promise(resolve=>{
   timeout=setTimeout(()=>resolve(null),1000);
   channel.port1.onmessage=event=>resolve(event.data);
   reg.active.postMessage({type:'DAYMARK_PUSH_VERSION'},[channel.port2]);
  });
  const data=subscription.toJSON();
  if(version===1||version===2)data.daymark_timing=version;
  await settings({p_subscription:data});
 }finally{clearTimeout(timeout);channel.port1.close()}
}
export async function enablePush(){
 if(!('Notification'in window))throw Error('Install Daymark on your Home Screen to enable notifications on this device.');
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Allow notifications in your device settings, then try again.');
 const reg=await registration(),key=await settings();
 const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const subscription=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
 await saveSubscription(reg,subscription);return true;
}
export async function restorePush(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window)||Notification.permission!=='granted')return false;
 const reg=await registration(),subscription=await reg.pushManager.getSubscription();
 if(!subscription)return false;await saveSubscription(reg,subscription);return true;
}
export async function disablePush(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window))return;
 const reg=await navigator.serviceWorker.getRegistration(),subscription=await reg?.pushManager.getSubscription();
 if(subscription){await settings({p_remove:subscription.endpoint});await subscription.unsubscribe();}
}

export async function showTestNotification(){
 const reg=await registration();
 if(!reg.active)throw Error('Reload Daymark to finish its update, then test again.');
 await reg.showNotification('Daymark · Test alert',{
  body:'This is a test of your agenda reminders.',
  icon:'/icons/icon-192.png',tag:'daymark-test',renotify:true,silent:false
 });
}
