import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,stat} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {FileProfileStore} from '../server/profile-store.mjs';
test('standalone profiles persist atomically outside static assets and reject a failed transaction',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'circuit-profile-'));t.after(()=>rm(directory,{recursive:true,force:true}));const store=new FileProfileStore(directory);
 await store.transaction(async transaction=>{await transaction.put('profile:a',{name:'A'});await transaction.put('profile:b',{name:'B'});});assert.equal((await stat(join(directory,'profiles.json'))).mode&0o777,0o600);
 await assert.rejects(store.transaction(async transaction=>{await transaction.put('profile:c',{name:'C'});throw Error('interrupted');}));const restored=new FileProfileStore(directory),rows=await restored.list({prefix:'profile:'});assert.deepEqual([...rows.keys()],['profile:a','profile:b']);assert.equal((await restored.list({prefix:'profile:',startAfter:'profile:a',limit:1})).get('profile:b').name,'B');
});
