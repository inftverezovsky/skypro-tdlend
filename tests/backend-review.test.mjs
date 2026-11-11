import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';

// Every scenario uses its own real HTTP server and synthetic SQLite memory DB.
async function fixture(t, serviceId=2) {
 const app=createApp({dbPath:':memory:'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 let cookie;
 async function req(path,method='GET',body) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0];
  return {status:response.status,data:await response.json()};
 }
 const registered=await req('/api/auth/register','POST',{name:'Synthetic review',email:'backend-review@example.test',password:'Synthetic-only-review-42'});
 assert.equal(registered.status,201);
 app.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(registered.data.user.id);
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const made=await req('/api/bookings','POST',{service_id:serviceId,master_id:1,date,time:'10:00'});
 assert.equal(made.status,201);
 const booking=made.data.booking;
 const patch=body=>req(`/api/admin/bookings/${booking.id}`,'PATCH',body);
 const read=async()=>{const result=await req(`/api/bookings/${booking.id}`);assert.equal(result.status,200);return result.data.booking;};
 const notes=()=>app.db.prepare('SELECT * FROM notifications ORDER BY id').all().map(row=>({...row}));
 return {app,req,patch,read,notes,date,booking};
}

// Supplementary regression controls for the shared availability checks.
for(const scenario of ['shift end','overlap','missing schedule','disabled master','disabled service','past date','elapsed time','off grid']) {
 test(`reschedule rejects ${scenario} using the original interval`,async t=>{
  const f=await fixture(t);
  assert.equal((await f.req('/api/admin/services/2','PATCH',{duration_minutes:30})).status,200);
  let change={time:'16:00'},expected=409;
  if(scenario==='shift end')change={time:'18:00'};
  if(scenario==='overlap')assert.equal((await f.req('/api/bookings','POST',{service_id:1,master_id:1,date:f.date,time:'17:00'})).status,201);
  if(scenario==='missing schedule')f.app.db.prepare('DELETE FROM schedules WHERE master_id=1').run();
  if(scenario==='disabled master'||scenario==='disabled service'){
   const kind=scenario==='disabled master'?'masters':'services',id=kind==='masters'?1:2;
   assert.equal((await f.req(`/api/admin/${kind}/${id}`,'PATCH',{active:false})).status,200);expected=400;
  }
  if(scenario==='past date'){change={date:'2000-01-01',time:'13:00'};expected=400;}
  if(scenario==='elapsed time'){
   f.app.db.prepare('UPDATE sessions SET expires_at=?').run(new Date(f.date+'T23:59:59Z').getTime()+86400000);
   t.mock.timers.enable({apis:['Date'],now:new Date(f.date+'T13:00:00').getTime()});
   change={time:'12:00'};
  }
  if(scenario==='off grid')change={time:'13:15'};
  const before=await f.read(),notes=f.notes();
  assert.equal((await f.patch(change)).status,expected);
  assert.deepEqual(await f.read(),before);assert.deepEqual(f.notes(),notes);
 });
}

for(const scenario of ['shift end','overlap','missing schedule','disabled master','disabled service','past date','elapsed time']) {
 test(`reactivation rejects ${scenario} without changing the saved row`,async t=>{
  const f=await fixture(t);
  assert.equal((await f.patch({status:'cancelled'})).status,200);
  assert.equal((await f.req('/api/admin/services/2','PATCH',{duration_minutes:30})).status,200);
  let expected=409;
  if(scenario==='shift end')f.app.db.prepare('UPDATE schedules SET end_minute=660 WHERE master_id=1').run();
  if(scenario==='overlap')assert.equal((await f.req('/api/bookings','POST',{service_id:1,master_id:1,date:f.date,time:'11:00'})).status,201);
  if(scenario==='missing schedule')f.app.db.prepare('DELETE FROM schedules WHERE master_id=1').run();
  if(scenario==='disabled master'||scenario==='disabled service'){
   const kind=scenario==='disabled master'?'masters':'services',id=kind==='masters'?1:2;
   assert.equal((await f.req(`/api/admin/${kind}/${id}`,'PATCH',{active:false})).status,200);expected=400;
  }
  if(scenario==='past date'){
   f.app.db.prepare("UPDATE bookings SET date='2000-01-01' WHERE id=?").run(f.booking.id);expected=400;
  }
  if(scenario==='elapsed time'){
   f.app.db.prepare('UPDATE sessions SET expires_at=?').run(new Date(f.date+'T23:59:59Z').getTime()+86400000);
   t.mock.timers.enable({apis:['Date'],now:new Date(f.date+'T11:00:00').getTime()});
  }
  const before=await f.read(),notes=f.notes();
  for(const status of ['confirmed','completed']){
   assert.equal((await f.patch({status})).status,expected);
   assert.deepEqual(await f.read(),before);assert.deepEqual(f.notes(),notes);
  }
 });
}

test('reschedule keeps the purchased duration when the catalog duration grows',async t=>{
 const f=await fixture(t);
 assert.equal((await f.req('/api/admin/services/2','PATCH',{duration_minutes:180,price:9999})).status,200);
 const moved=await f.patch({time:'17:00'});
 assert.equal(moved.status,200);
 assert.equal(moved.data.booking.id,f.booking.id);assert.equal(moved.data.booking.price,f.booking.price);
 assert.equal(moved.data.booking.end_minute,19*60);
});

test('reactivation preserves identity price interval and excludes its own row',async t=>{
 const f=await fixture(t);
 assert.equal((await f.patch({status:'cancelled'})).status,200);
 assert.equal((await f.req('/api/admin/services/2','PATCH',{duration_minutes:180,price:9999})).status,200);
 // A touching block is not an overlap, in either direction.
 for(const [start_time,end_time] of [['09:00','10:00'],['12:00','13:00']])assert.equal((await f.req('/api/admin/blocks','POST',{master_id:1,date:f.date,start_time,end_time})).status,201);
 assert.equal((await f.patch({status:'confirmed'})).status,200);
 assert.deepEqual(await f.read(),f.booking);
 assert.equal((await f.patch({status:'completed'})).status,200);
 assert.equal((await f.patch({status:'confirmed'})).status,200);
 assert.deepEqual(await f.read(),f.booking);
 assert.equal(f.app.db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n,1);
});

test('reopening a completed booking rechecks disabled catalog',async t=>{
 const f=await fixture(t);
 assert.equal((await f.patch({status:'completed'})).status,200);
 assert.equal((await f.req('/api/admin/masters/1','PATCH',{active:false})).status,200);
 const before=await f.read(),notes=f.notes();
 assert.equal((await f.patch({status:'confirmed'})).status,400);
 assert.deepEqual(await f.read(),before);assert.deepEqual(f.notes(),notes);
});

test('reactivation refuses a block over the original interval and preserves cancellation',async t=>{
 const f=await fixture(t);
 assert.equal((await f.patch({status:'cancelled'})).status,200);
 assert.equal((await f.req('/api/admin/services/2','PATCH',{duration_minutes:30})).status,200);
 assert.equal((await f.req('/api/admin/blocks','POST',{master_id:1,date:f.date,start_time:'11:00',end_time:'12:00'})).status,201);
 const before=await f.read(),notes=f.notes();
 assert.equal((await f.patch({status:'confirmed'})).status,409);
 assert.deepEqual(await f.read(),before);
 assert.deepEqual(f.notes(),notes);
});

test('reschedule validates the preserved duration after catalog shortening',async t=>{
 const f=await fixture(t);
 assert.equal((await f.req('/api/admin/services/2','PATCH',{duration_minutes:30,price:900})).status,200);
 assert.equal((await f.req('/api/admin/blocks','POST',{master_id:1,date:f.date,start_time:'16:30',end_time:'17:00'})).status,201);
 const before=await f.read(),notes=f.notes();
 assert.equal((await f.patch({time:'16:00'})).status,409);
 assert.deepEqual(await f.read(),before);
 assert.deepEqual(f.notes(),notes);
 const moved=await f.patch({time:'13:00'});
 assert.equal(moved.status,200);
 assert.equal(moved.data.booking.id,before.id);
 assert.equal(moved.data.booking.price,before.price);
 assert.equal(moved.data.booking.end_minute-moved.data.booking.start_minute,120);
 assert.equal(moved.data.booking.time,'13:00');
 assert.equal(f.notes().length,notes.length+1);
});
