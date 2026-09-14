import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshRequest} from '../src/refresh-request.js';
test('simultaneous refreshes share one request',async()=>{
 let finish,calls=0;const request=createRefreshRequest(()=>{calls++;return new Promise(r=>finish=r)});
 const first=request.run(),second=request.run();assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 finish([{id:'saved-plan'}]);assert.deepEqual(await first,[{id:'saved-plan'}]);
});
test('a hung read times out and subsequent refresh can recover',async()=>{
 let hung=true;const request=createRefreshRequest(()=>hung?new Promise(()=>{}):Promise.resolve(['recovered']),10);
 await assert.rejects(request.run(),/timed out/);hung=false;assert.deepEqual(await request.run(),['recovered']);
});
test('cancelling a stale read releases callers and does not cancel its replacement',async()=>{
 let calls=0,oldFinish;const request=createRefreshRequest(()=>++calls===1?new Promise(r=>oldFinish=r):Promise.resolve(['new']));
 const old=request.run();await Promise.resolve();request.cancel();const replacement=request.run();
 await assert.rejects(old,/cancelled/);assert.deepEqual(await replacement,['new']);oldFinish(['stale']);
});
