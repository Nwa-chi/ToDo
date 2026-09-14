// One bounded read at a time. Cancelling also releases callers if the SDK is waiting for auth.
export function createRefreshRequest(load,timeoutMs=15000){
 let active=null;
 return {
  run(){
   if(active)return active.promise;
   const controller=new AbortController();let timer;
   const abort=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(controller.signal.reason||Error('Refresh cancelled')),{once:true}));
   const entry={controller,promise:null};active=entry;
   timer=setTimeout(()=>controller.abort(Error('Refresh timed out. Please try again.')),timeoutMs);
   entry.promise=Promise.race([Promise.resolve().then(()=>load(controller.signal)),abort]).finally(()=>{clearTimeout(timer);if(active===entry)active=null});
   return entry.promise;
  },
  cancel(){const entry=active;active=null;entry?.controller.abort(Error('Refresh cancelled'));}
 };
}
