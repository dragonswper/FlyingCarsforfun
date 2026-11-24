import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
function check(directory){
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  if(['vendor','assets','node_modules'].includes(entry.name))continue;
  const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
  if(entry.isDirectory())check(path);
  else if(/\.(mjs|js)$/.test(entry.name)){
   const result=spawnSync(process.execPath,['--check',fileURLToPath(path)],{stdio:'inherit'});
   if(result.status!==0)process.exit(result.status||1);
  }
 }
}
for(const directory of ['dist','scripts','server'])check(new URL('../'+directory+'/',import.meta.url));
