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
