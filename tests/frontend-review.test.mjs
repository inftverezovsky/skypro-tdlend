import test from 'node:test';
import assert from 'node:assert/strict';
import {mount} from '../public/ui.mjs';

function fixture(hash, request, parseStatus = false) {
 const handlers={};let html='',forms=[];
 const root={get innerHTML(){return html;},set innerHTML(value){html=value;forms=[];
  if(parseStatus)for(const match of value.matchAll(/<form data-form="status" data-id="([^"]+)">([\s\S]*?)<\/form>/g)){
   const selected=[...match[2].matchAll(/<option value="([^"]*)"([^>]*)>/g)].find(option=>option[2].includes('selected'))?.[1] || '';
   forms.push({dataset:{form:'status',id:match[1]},elements:[{name:'status',type:'select-one',value:selected}],insertAdjacentHTML(_where,notice){html+=notice;}});
  }
 },addEventListener:(name,fn)=>handlers[name]=fn,querySelector:()=>null,querySelectorAll:()=>forms};
 const win={location:{hash},history:{pushState(_a,_b,url){win.location.hash=url;}},addEventListener(){},scrollTo(){}};
 const app=mount({root,win,request});
 const retry=()=>handlers.click({target:{disabled:false,dataset:{action:'retry'},closest(selector){return selector.startsWith('a')?null:this;}}});
 return {...app,root,win,retry};
}

test('fresh admin GET refreshes untouched status and clears conflicting dirty status visibly', async()=>{
 let status='confirmed';const calls=[];
 const app=fixture('#admin',async(path,options)=>{
  calls.push({path,options});
  if(path==='/api/auth/me')return {user:{id:1,role:'admin'}};
  if(path==='/api/admin/bookings')return {bookings:[{id:9,status,service_name:'Review booking'}]};
  if(path==='/api/admin/services')return {services:[]};
  if(path==='/api/admin/masters')return {masters:[]};
  return {notifications:[],unread_count:0};
 },true);
 await app.ready;
 const value=()=>app.root.querySelectorAll()[0].elements[0].value;
 assert.equal(value(),'confirmed');
 status='cancelled';await app.controller.load('admin');
 assert.equal(value(),'cancelled','untouched status follows fresh GET');
 app.root.querySelectorAll()[0].elements[0].value='completed';
 app.controller.tab('services');app.controller.tab('bookings');
 assert.equal(value(),'completed','genuine draft survives tab roundtrip');
 status='confirmed';await app.controller.load('admin');
 assert.equal(value(),'confirmed','stale draft cannot override changed server baseline');
 assert.match(app.root.innerHTML,/role="alert"[^>]*>[^<]*изменились/i);
 assert.equal(calls.filter(c=>c.options?.method).length,0);
});

test('dirty admin status does not survive a conflicting server revision silently', async()=>{
 let status='confirmed';
 const app=fixture('#admin',async path=>{
  if(path==='/api/auth/me')return {user:{id:1,role:'admin'}};
  if(path==='/api/admin/bookings')return {bookings:[{id:9,status}]};
  return {services:[],masters:[],notifications:[],unread_count:0};
 },true);
 await app.ready;
 app.root.querySelectorAll()[0].elements[0].value='completed';
 status='cancelled';await app.controller.load('admin');
 assert.equal(app.root.querySelectorAll()[0].elements[0].value,'cancelled');
 assert.match(app.root.innerHTML,/role="alert"[^>]*>[^<]*изменились/i);
});

test('failed own GET never renders foreign admin records or cancel actions and scopes retained own data by identity', async()=>{
 let failOwn=true;const calls=[];
 const app=fixture('#admin',async(path,options)=>{
  calls.push({path,options});
  if(path==='/api/auth/me')return {user:{id:1,role:'admin'}};
  if(path==='/api/admin/bookings')return {bookings:[{id:99,status:'confirmed',service_name:'FOREIGN_SENTINEL',master_name:'FOREIGN_MASTER'}]};
  if(path==='/api/bookings'){if(failOwn)throw new Error('synthetic own GET failure');return {bookings:[{id:21,status:'pending',service_name:'OWN_SENTINEL'}]};}
  return {services:[],masters:[],notifications:[],unread_count:0};
 });
 await app.ready;assert.match(app.root.innerHTML,/FOREIGN_SENTINEL/);
 await app.controller.load('cabinet');
 assert.doesNotMatch(app.root.innerHTML,/FOREIGN_SENTINEL|FOREIGN_MASTER|data-cancel="99"/);
 assert.match(app.root.innerHTML,/Обновить записи/);
 await app.controller.cancel(99);
 assert.equal(calls.filter(c=>c.options?.method).length,0);
 failOwn=false;await app.controller.load('cabinet');assert.match(app.root.innerHTML,/OWN_SENTINEL/);
 failOwn=true;await app.controller.load('cabinet');assert.match(app.root.innerHTML,/OWN_SENTINEL/,'same own identity may retain its own list');
 app.controller.state.user={id:2,role:'admin'};
 await app.controller.load('cabinet');assert.doesNotMatch(app.root.innerHTML,/OWN_SENTINEL|data-cancel=/);
});

test('reservation never confirms a missing own readback or a cached row after failed readback', async()=>{
 for(const failure of [false,true]){
  let reads=0;
  const app=fixture('#cabinet',async(path,options)=>{
   if(path==='/api/auth/me')return {user:{id:1,role:'client'}};
   if(path==='/api/bookings'&&options?.method==='POST')return {booking:{id:21}};
   if(path==='/api/bookings'){
    if(++reads===1)return {bookings:[{id:21,status:'pending'}]};
    if(failure)throw new Error('synthetic readback failure');
    return {bookings:[]};
   }
   return {notifications:[],unread_count:0};
  });
  await app.ready;
  Object.assign(app.controller.state,{route:'booking',serviceId:'7',masterId:'3',time:'11:00',slots:['11:00']});
  await app.controller.reserve();
  assert.equal(app.controller.state.success,'');
  assert.match(app.controller.state.error,/не подтверждена/);
  assert.equal(app.win.location.hash,'#cabinet');
  assert.equal(app.controller.state.time,'');
 }
});

test('committed reservation with failed readback recovers via cabinet GET only', async()=>{
 const calls=[];let fail=true;
 const app=fixture('#booking?service=7',async(path,options)=>{
  calls.push({path,method:options?.method || 'GET'});
  if(path==='/api/auth/me')return {user:{id:1,name:'Own',role:'client'}};
  if(path==='/api/services')return {services:[{id:7}]};
  if(path==='/api/masters')return {masters:[{id:3}]};
  if(path==='/api/notifications')return {notifications:[],unread_count:0};
  if(path==='/api/bookings'&&options?.method==='POST')return {booking:{id:21}};
  if(path==='/api/bookings'){if(fail)throw new Error('synthetic unavailable');return {bookings:[{id:21,status:'pending',service_name:'Own booking'}]};}
  throw new Error('Unexpected '+path);
 });
 await app.ready;
 Object.assign(app.controller.state,{masterId:'3',time:'11:00',slots:['11:00']});
 await app.controller.reserve();
 assert.equal(app.win.location.hash,'#cabinet');
 assert.equal(app.controller.state.route,'cabinet');
 assert.equal(app.controller.state.success,'');
 assert.match(app.root.innerHTML,/Обновить записи/);
 fail=false;const start=calls.length;
 await app.retry();await app.controller.reserve();
 assert.deepEqual(calls.slice(start),[{path:'/api/bookings',method:'GET'}]);
 assert.match(app.root.innerHTML,/Own booking/);
 assert.equal(calls.filter(c=>c.method==='POST').length,1);
});
