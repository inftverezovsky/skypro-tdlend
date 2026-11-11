import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
async function start(t,dir){
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:'0',DB_PATH:join(dir,'app.sqlite'),DEMO_CREDENTIALS_PATH:join(dir,'access.json')},stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill();});
 let output='';let errors='';child.stderr.on('data',data=>errors+=data);
 const base=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{child.kill();reject(new Error('Startup timeout: '+errors));},5000);
  child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
  child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Exited before listen: '+code+' '+errors));});
 });
 return {child,base,stop:()=>new Promise(resolve=>{child.once('exit',resolve);child.kill();})};
}
test('CLI starts HTTP, generates private demo access and restarts persistent SQLite',async t=>{
 const dir=mkdtempSync(join(process.env.TMPDIR||process.env.TEMP,'tdlend-runtime-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const first=await start(t,dir);
 assert.equal((await fetch(first.base+'/')).status,200);
 assert.equal((await fetch(first.base+'/api/services')).status,200);
 for(const path of ['/data/app.sqlite','/.git/config','/data/access.json'])assert.equal((await fetch(first.base+path)).status,404);
 const original=readFileSync(join(dir,'access.json'),'utf8');const access=JSON.parse(original);
 const login=await fetch(first.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(access.admin)});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(first.base+'/api/admin/services/1',{method:'PATCH',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({name:'Runtime persisted service'})})).status,200);
 await first.stop();
 const second=await start(t,dir);
 assert.equal((await (await fetch(second.base+'/api/services')).json()).services[0].name,'Runtime persisted service');
 assert.equal(readFileSync(join(dir,'access.json'),'utf8'),original);
 await second.stop();
});
