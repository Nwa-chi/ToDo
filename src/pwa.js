export function setupInstall(toast,canReload) {
  let prompt;
  const buttons=[...document.querySelectorAll('[data-install]')];
  const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const update=()=>buttons.forEach(b=>{b.hidden=Boolean(installed())});
  update();
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;update()});
  addEventListener('appinstalled',()=>{prompt=null;buttons.forEach(b=>b.hidden=true);toast('Daymark has been added to your device.')});
  for(const button of buttons)button.onclick=async()=>{
    if(!prompt){document.querySelector('#install-dialog').showModal();return;}
    button.disabled=true;
    try{await prompt.prompt();await prompt.userChoice;prompt=null;}
    catch{document.querySelector('#install-dialog').showModal();}
    finally{button.disabled=false;}
  };
  setupUpdates(()=>installed()&&canReload());
}

function setupUpdates(canReload){
  const current=document.querySelector('meta[name="daymark-build"]').content;
  const notice=document.querySelector('#notice');
  const check=document.querySelector('#check-update');
  const status=document.querySelector('#update-status');
  let registration,latest,checking=false,reloading=false;
  const worker=navigator.serviceWorker;
  const reload=()=>{
    if(reloading)return;
    reloading=true;
    if(latest){
      const target=new URL(location.href);
      target.searchParams.set('build',latest);
      location.replace(target);
    }else location.reload();
  };
  const applyUpdate=()=>{
    registration?.waiting?.postMessage({type:'ACTIVATE_UPDATE'});
    reload();
  };
  const updateReady=()=>Boolean((latest&&latest!==current)||(registration?.waiting&&worker?.controller));
  const offer=()=>{
    if(!updateReady())return;
    status.textContent='A Daymark update is ready.';
    check.textContent='Update Daymark';
    if(!notice.hidden)return;
    const button=document.createElement('button');
    button.className='link';button.textContent='Update Daymark';
    button.onclick=applyUpdate;
    notice.replaceChildren('A Daymark update is ready. Finish your changes, then ',button);
    notice.hidden=false;
  };
  if(worker){
    worker.register('/sw.js',{updateViaCache:'none'}).then(registered=>{
      registration=registered;
      offer();
      registered.addEventListener('updatefound',()=>registered.installing?.addEventListener('statechange',offer));
    }).catch(()=>{});
  }
  async function checkBuild(manual=false){
    if(checking)return;
    checking=true;
    if(manual){check.disabled=true;status.textContent='Checking for updates…'}
    const abort=new AbortController();
    const timeout=setTimeout(()=>abort.abort(),8000);
    try{
      const response=await fetch('/build.json?check='+Date.now(),{cache:'no-store',signal:abort.signal});
      if(!response.ok||!response.headers.get('content-type')?.includes('json'))throw Error('Build unavailable');
      const {id}=await response.json();
      if(!/^[a-f0-9]{16}$/.test(id))throw Error('Build unavailable');
      latest=id;
      if(latest!==current&&canReload()&&!document.hidden&&!manual)applyUpdate();
      else if(latest!==current||registration?.waiting)offer();
      else if(manual)status.textContent='Daymark is up to date.';
      void registration?.update().catch(()=>{});
    }catch{if(manual)status.textContent='Could not check for updates. Reconnect and try again.'}
    finally{clearTimeout(timeout);checking=false;check.disabled=false}
  }
  check.onclick=()=>updateReady()?applyUpdate():checkBuild(true);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkBuild()});
  addEventListener('pageshow',()=>void checkBuild());
  addEventListener('online',()=>void checkBuild());
  void checkBuild();
}
