import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';
let server,base;
before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port});
after(async()=>{await new Promise(r=>server.close(r))});
test('serves built entrypoint, styles and script',async()=>{
 for(const file of ['/','/app.js','/styles.css','/favicon.svg'])assert.equal((await fetch(base+file)).status,200);
 assert.deepEqual(await(await fetch(base+'/healthz')).json(),{status:'ok'});
});
test('never serves source, secrets, database files or unsupported writes',async()=>{
 for(const file of ['/.env','/.git/config','/src/config.js','/package.json','/supabase/'])assert.equal((await fetch(base+file)).status,404);
 assert.equal((await fetch(base,{method:'POST'})).status,405);
 const page=await fetch(base);
 assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
 assert.equal(page.headers.get('x-content-type-options'),'nosniff');
});
test('PWA endpoints return usable MIME types and no cached service worker',async()=>{
 for(const [file,type] of [['/manifest.webmanifest','application/manifest+json'],['/sw.js','text/javascript'],['/offline.html','text/html'],['/icons/icon-192.png','image/png']]){
  const r=await fetch(base+file);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(type));
 }
 assert.equal((await fetch(base+'/sw.js')).headers.get('cache-control'),'no-store');
});
test('entrypoint uses versioned assets that bypass older service-worker caches',async()=>{
 const html=await(await fetch(base)).text();
 const script=html.match(/src="(\/app.js\?v=[a-f0-9]{16})"/)[1];
 const style=html.match(/href="(\/styles.css\?v=[a-f0-9]{16})"/)[1];
 for(const file of [script,style])assert.equal((await fetch(base+file)).status,200);
 const worker=await(await fetch(base+'/sw.js')).text();assert.ok(worker.includes(script));assert.ok(worker.includes(style));
});
