import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
import {api,createController,render} from '../public/ui.mjs';

// Isolated real HTTP + SQLite memory integration. No live deployment data.
test('frontend controller completes real HTTP register → book → admin transfer → notifications → cancel → logout', async t => {
 const app=createApp({dbPath:':memory:'});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>app.close());
 const origin='http://127.0.0.1:'+app.server.address().port;
 let cookie='';
 const fetcher=async(path,options)=>{
  const response=await fetch(origin+path,{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{})}});
  const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0];return response;
 };
 const routes=[];
 const client=createController({request:(path,options)=>api(path,options,fetcher),navigate:route=>routes.push(route)});
 await client.init('services');assert.ok(client.state.services.length>0);
 await client.authenticate('login',{email:'missing@example.test',password:'fictional-only'});
 assert.equal(client.state.error,'Неверный email или пароль');assert.match(render(client.state),/role="alert"/);
 client.chooseService(client.state.services[0].id);
 await client.authenticate('register',{name:'Тестовый клиент',email:'frontend@example.test',password:'fictional-only-123'});
 assert.equal(client.state.user.name,'Тестовый клиент');assert.ok(cookie);
 await client.load(routes.at(-1));
 await client.changeBooking('master_id',String(client.state.masters[0].id));
 assert.ok(client.state.slots.length>1);
 const oldTime=client.state.slots[0], newTime=client.state.slots.at(-1), date=client.state.date, master=client.state.masterId;
 await client.changeBooking('time',oldTime);await client.reserve();
 assert.equal(client.state.error,'');assert.ok(client.state.success);const booking=client.state.bookings[0];assert.ok(booking.id);
 await client.notifications();assert.equal(client.state.unreadCount,0);
 // Admin entitlement exists only inside this synthetic in-memory fixture.
 app.db.prepare('UPDATE users SET role=? WHERE id=?').run('admin',client.state.user.id);
 client.state.user.role='admin';await client.load('admin');
 await client.adminSave('reschedule',booking.id,{date,time:newTime,master_id:master});
 assert.equal(client.state.error,'');assert.equal(client.state.bookings[0].id,booking.id);assert.equal(client.state.bookings[0].time,newTime);
 await client.notifications();assert.equal(client.state.unreadCount,1);assert.match(client.state.notifications[0].text,/перенесена/);
 await client.notifications(true);assert.equal(client.state.unreadCount,0);
 await client.adminSave('service-create','',{name:'Тестовая услуга',description:'Изолированная проверка',duration_minutes:'60',price:'900',active:'1'});
 assert.equal(client.state.error,'');assert.ok(client.state.services.some(s=>s.name==='Тестовая услуга'));
 await client.adminSave('master-create','',{name:'Тестовый мастер',specialty:'Проверка',active:'1'});
 assert.equal(client.state.error,'');const added=client.state.masters.find(m=>m.name==='Тестовый мастер');assert.ok(added);
 await client.adminSave('master-edit',added.id,{name:added.name,specialty:added.specialty,active:'0'});
 assert.equal(client.state.error,'');assert.equal(client.state.masters.find(m=>m.id===added.id).active,0);
 await client.adminSave('block','',{master_id:master,date,start_time:oldTime,end_time:oldTime.slice(0,2)+':30'});
 assert.equal(client.state.error,'');assert.ok(client.state.success);
 await client.load('cabinet');await client.cancel(booking.id);assert.equal(client.state.error,'');assert.equal(client.state.bookings[0].status,'cancelled');
 await client.logout();assert.equal(client.state.user,null);assert.equal(routes.at(-1),'home');
});
