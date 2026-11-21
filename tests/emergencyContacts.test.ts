import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeEmergencyPhone } from '../src/services/passengerSafety.ts';

// All contact storage and database operations in this test are in memory.
function fixture() {
  const storage = new Map<string, string>();
  const rows: any[] = [];
  let offline = false, diskFull = false;
  const from = (table: string) => {
    assert.equal(table, 'emergency_contacts');
    const filters: Record<string, string> = {};
    let write: any, mode = 'read';
    const query: any = {
      select: () => query, eq(k: string,v: string) { filters[k] = v; return query; },
      limit: () => query, order: () => query, abortSignal: () => query,
      single: () => query, maybeSingle: () => query,
      insert(value: any) { mode = 'insert'; write = value; return query; },
      upsert(value: any) { mode = 'insert'; write = value; return query; },
      update(value: any) { mode = 'update'; write = value; return query; },
      delete() { mode = 'delete'; return query; },
      then(resolve: any) {
        if (offline) return resolve({ data: null, error: { message:'Network unreachable' }, status: 0 });
        if (mode === 'insert') { rows.push(write); return resolve({ data: write, error: null }); }
        assert.ok(filters.user_id);
        const found = rows.filter(row => Object.entries(filters).every(([k,v]) => row[k] === v));
        if (mode === 'delete') found.forEach(row => rows.splice(rows.indexOf(row), 1));
        if (mode === 'update') Object.assign(found[0], write);
        resolve({ data: mode === 'update' ? found[0] : found, error: null });
      },
    }; return query;
  };
  const modules: any = {
    '@react-native-async-storage/async-storage': { default: { getItem: async (k: string) => storage.get(k) ?? null,
      setItem: async (k: string,v: string) => { if (diskFull) throw Error('Full'); storage.set(k,v); } } },
    '../lib/supabase': { supabase: { from } }, './passengerSafety': { normalizeEmergencyPhone },
  };
  const code = ts.transpileModule(readFileSync(new URL('../src/services/emergencyService.ts',import.meta.url),'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const service: any = {};
  new Function('require','exports',code)((key: string) => modules[key],service);
  return { service, rows, setOffline: (v: boolean) => { offline=v; }, fillDisk: () => { diskFull=true; } };
}

const contact = { user_id: 'a', contact_name: 'Test', phone_number: '+639000000001', preset_message: 'Test' };
test('opening contacts reads the signed-in owner even when the dispatch function is unavailable', async () => {
  const f=fixture(); f.rows.push(contact,{...contact,user_id:'b',contact_name:'Other'});
  f.fillDisk();
  assert.deepEqual(await f.service.loadEmergencyContacts('a'), [contact]);
});
test('contact add, edit, offline read and removal use owner-scoped storage and never dispatch', async () => {
  const f=fixture(), s=f.service;
  await s.saveEmergencyContact('a',{...contact,phone_number:'09000000001'});
  assert.equal(f.rows[0].phone_number,contact.phone_number);
  await s.saveEmergencyContact('a',{...contact,contact_name:'Updated'});
  assert.equal(f.rows.length,1);
  f.setOffline(true);
  assert.deepEqual((await s.readEmergencyContacts('a')).contacts.map((c:any)=>c.contact_name),['Updated']);
  assert.deepEqual(await s.readEmergencyContacts('b'),{contacts:[],synced:false});
  await assert.rejects(s.removeEmergencyContact('a',contact));
  const local=await s.saveEmergencyContact('a',{...contact,phone_number:'09000000002'});
  assert.equal(local.localOnly,true);
  f.setOffline(false);
  const after=await s.removeEmergencyContact('a',contact);
  assert.equal(f.rows.length,0);
  assert.deepEqual(after,[local]);
});
