import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';
// The standalone Node server needs a persistent volume. Cloudflare uses its
// existing SQLite Durable Object storage through the same small store contract.
export class FileProfileStore{
 constructor(directory){this.directory=resolve(directory);this.file=join(this.directory,'profiles.json');}
 async ready(){if(!this.loading)this.loading=(async()=>{try{this.rows=new Map(JSON.parse(await readFile(this.file,'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;this.rows=new Map();}})();return this.loading;}
 async list({prefix='',startAfter='',limit=1000}={}){await this.ready();return new Map([...this.rows].filter(([key])=>key.startsWith(prefix)&&key>startAfter).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,value])=>[key,structuredClone(value)]));}
 async transaction(callback){await this.ready();const draft=new Map(structuredClone([...this.rows])),transaction={put:async(key,value)=>draft.set(key,structuredClone(value))};await callback(transaction);await mkdir(this.directory,{recursive:true,mode:0o700});const temporary=join(this.directory,'profiles-'+randomUUID()+'.tmp');await writeFile(temporary,JSON.stringify([...draft]),{mode:0o600});await rename(temporary,this.file);this.rows=draft;}
 async put(key,value){return this.transaction(transaction=>transaction.put(key,value));}
}
