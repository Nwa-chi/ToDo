import {client} from './api.js';
async function settings(params={}){const {data,error}=await client.rpc('daymark_push_settings',params);if(error)throw error;return data;}
async function registration(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window))throw Error('Install Daymark on your Home Screen and open it there, or use a browser with push support.');
 return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('The app is still updating. Reload and try again.')),12000))]);
}
export async function enablePush(){
 if(!('Notification'in window))throw Error('Install Daymark on your Home Screen to enable notifications on this device.');
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw Error('Allow notifications in your device settings, then try again.');
 const reg=await registration(),key=await settings();
 const bytes=Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const subscription=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
 await settings({p_subscription:subscription.toJSON()});return true;
}
export async function restorePush(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window)||Notification.permission!=='granted')return false;
 const reg=await registration(),subscription=await reg.pushManager.getSubscription();
 if(!subscription)return false;await settings({p_subscription:subscription.toJSON()});return true;
}
export async function disablePush(){
 if(!('serviceWorker'in navigator)||!('PushManager'in window))return;
 const reg=await navigator.serviceWorker.getRegistration(),subscription=await reg?.pushManager.getSubscription();
 if(subscription){await settings({p_remove:subscription.endpoint});await subscription.unsubscribe();}
}
