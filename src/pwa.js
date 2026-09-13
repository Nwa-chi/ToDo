export function setupInstall(toast) {
  let prompt,requestedUpdate=false;
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
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(registration=>{
      const notify=()=>{if(registration.waiting&&navigator.serviceWorker.controller){
        const notice=document.querySelector('#notice');notice.replaceChildren(document.createTextNode('A new version is ready. Finish your changes, then '));
        const button=document.createElement('button');button.className='link';button.textContent='Update Daymark';
        button.onclick=()=>{requestedUpdate=true;registration.waiting?.postMessage({type:'ACTIVATE_UPDATE'})};notice.append(button);notice.hidden=false;
      }};
      notify();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',notify));
    }).catch(()=>toast('Installation support is unavailable. You can continue using Daymark online.'));
    let refreshing=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requestedUpdate&&!refreshing){refreshing=true;location.reload()}});
  }
}
