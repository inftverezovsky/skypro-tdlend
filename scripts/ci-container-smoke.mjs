// Runs only against the disposable container created by the GitHub Actions job.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:3187';
async function request(path,options={}){const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json',...options.headers}});return {response,data:await response.json()};}
async function ready(){for(let i=0;i<40;i++){try{const r=await request('/api/services');if(r.response.status===200&&r.data.services.length)return r.data.services;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Disposable container did not become ready');}
const services=await ready();
const suffix=randomBytes(4).toString('hex');
const registered=await request('/api/auth/register',{method:'POST',body:JSON.stringify({name:'CI synthetic client',email:`ci.${suffix}@example.test`,password:randomBytes(24).toString('hex')})});
assert.equal(registered.response.status,201);assert.equal(registered.data.user.role,'client');
const cookie=registered.response.headers.get('set-cookie').split(';')[0];
const date=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
const masters=(await request('/api/masters')).data.masters;
const slots=(await request(`/api/slots?date=${date}&master_id=${masters[0].id}&service_id=${services[0].id}`)).data.slots;
assert(slots.length);
const created=await request('/api/bookings',{method:'POST',headers:{Cookie:cookie},body:JSON.stringify({service_id:services[0].id,master_id:masters[0].id,date,time:slots[0]})});assert.equal(created.response.status,201);
const id=created.data.booking.id;
execFileSync('docker',['restart','tdlend-ci'],{stdio:'pipe',timeout:30000});await ready();
const own=await request('/api/bookings',{headers:{Cookie:cookie}});assert.equal(own.response.status,200);assert(own.data.bookings.some(b=>b.id===id&&b.date===date&&b.time===slots[0]));
const denial=await fetch(base+'/admin',{headers:{Cookie:cookie},signal:AbortSignal.timeout(3000)});assert.equal(denial.status,403);
console.log('Linux Docker HTTP, booking persistence after restart, session persistence and admin refusal: PASS');
