import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptJson } from '../src/utils/scriptJson.ts';
test('map data cannot close its script tag or inject markup',()=>{
  const data={name:'</script><script>alert(1)</script>',other:'<&>\u2028\u2029'};
  const serialized=scriptJson(data);
  assert.ok(!serialized.includes('<'));
  assert.deepEqual(JSON.parse(serialized),data);
});
