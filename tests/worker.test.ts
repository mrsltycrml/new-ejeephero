import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Worker source is shipped directly as ESM.
import worker from '../cloudflare/worker.mjs';
test('asset gateway returns R2 JSON and genuine missing-file errors, never the app HTML',async()=>{
  const env={EJEEPHERO_STATIC:{get:async(key:string)=>key==='transit/test.json'?{body:'{"ok":true}',httpEtag:'"one"',writeHttpMetadata:(h:Headers)=>h.set('Content-Type','application/json')}:null},ASSETS:{fetch:async()=>new Response('<html>app</html>',{headers:{'Content-Type':'text/html'}})}};
  const found=await worker.fetch(new Request('https://app.example/transit/test.json'),env);
  assert.equal(found.status,200);assert.equal(found.headers.get('content-type'),'application/json');
  assert.deepEqual(await found.json(),{ok:true});
  const missing=await worker.fetch(new Request('https://app.example/releases/missing.apk'),env);
  assert.equal(missing.status,404);
  const method=await worker.fetch(new Request('https://app.example/transit/test.json',{method:'POST'}),env);
  assert.equal(method.status,405);
  const page=await worker.fetch(new Request('https://app.example/'),env);
  assert.equal(page.headers.get('cache-control'),'no-cache');
  assert.equal(page.headers.get('x-content-type-options'),'nosniff');
});
