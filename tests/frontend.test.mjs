import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../public/ui.mjs';
test('source failures name the actual booking source and stale route responses cannot overwrite current catalog', async () => {
 const c=ui.createController({request:async path=>{if(path==='/api/masters')throw new Error('Связь прервана');return {services:[]};}});c.state.user={id:1};await c.load('booking?service=1');assert.match(c.state.error,/мастеров/);
 let resolveOld;const other=ui.createController({request:async()=>new Promise(r=>resolveOld=r)});const old=other.load('services');await other.load('login');resolveOld({services:[{id:9}]});await old;assert.deepEqual(other.state.services,[]);assert.equal(other.state.route,'login');
});
test('form drafts survive rerenders and admin tabs but never store passwords or override a saved form', () => {
 const controls=[{name:'email',value:'draft@example.test',type:'email'},{name:'password',value:'NEVER STORE',type:'password'}];
 const form={dataset:{form:'login'},elements:controls};const root={querySelectorAll:()=>[form]};const drafts=new Map();
 ui.rememberForms(root,drafts);assert.deepEqual(drafts.get('login:'),{email:'draft@example.test'});
 controls[0].value='';ui.restoreForms(root,drafts);assert.equal(controls[0].value,'draft@example.test');
 controls[0].value='server@example.test';ui.rememberForms(root,drafts,'login:');ui.restoreForms(root,drafts,'login:');assert.equal(controls[0].value,'server@example.test');assert.equal(drafts.has('login:'),false);
});
test('DOM mount wires catalog choice, native forms, hash navigation and cookie login to real controller', async () => {
 const handlers={},events={},requests=[];
 const root={innerHTML:'',addEventListener:(name,fn)=>handlers[name]=fn,querySelector:()=>null,querySelectorAll:()=>[]};
 const win={location:{hash:'#services'},history:{pushState(_a,_b,url){win.location.hash=url;}},addEventListener:(name,fn)=>events[name]=fn,scrollTo:()=>{},document:{activeElement:null},FormData:class{constructor(form){return Object.entries(form.values)[Symbol.iterator]();}}};
 const request=async(path,options)=>{requests.push({path,options});if(path==='/api/auth/me')throw Object.assign(new Error('anon'),{status:401});if(path==='/api/services')return {services:[{id:7,name:'Стрижка',price:1500,duration_minutes:60}]};if(path==='/api/auth/login')return {user:{id:1,name:'Тест',role:'client'}};if(path==='/api/masters')return {masters:[{id:3,name:'Анна'}]};return {notifications:[],unread_count:0};};
 const app=ui.mount({root,win,request});await app.ready;
 assert.match(root.innerHTML,/Стрижка/);
 const button={dataset:{service:'7'},disabled:false,closest(selector){return selector.startsWith('a')?null:this;}};
 await handlers.click({target:button,preventDefault(){}});
 assert.equal(win.location.hash,'#login?service=7');
 await handlers.submit({target:{dataset:{form:'login'},values:{email:'demo@example.test',password:'synthetic'},checkValidity:()=>true},preventDefault(){}});
 assert.equal(win.location.hash,'#booking?service=7');assert.equal(app.controller.state.user.name,'Тест');
 assert.ok(requests.some(x=>x.path==='/api/masters'));assert.equal(typeof events.hashchange,'function');
});
test('notifications show unread counter, escaped text, real empty/error and mark-read verification', async () => {
 const calls=[];let read=false;
 const c=ui.createController({request:async(path,options)=>{calls.push({path,options});if(options){read=true;return {ok:true};}return {notifications:[{id:1,text:'Запись <обновлена>',read}],unread_count:read?0:1};}});
 c.state.user={id:1};await c.notifications();
 assert.equal(c.state.unreadCount,1);assert.match(ui.render(c.state),/Уведомления/);assert.match(ui.render(c.state),/Запись &lt;обновлена&gt;/);
 await c.notifications(true);assert.equal(c.state.unreadCount,0);assert.equal(calls[1].path,'/api/notifications/read');assert.equal(calls[2].path,'/api/notifications');
 assert.match(ui.render({...c.state,notifications:[],notificationsOpen:true}),/Уведомлений пока нет/);
});
test('admin block posts exact interval and verifies availability without invented slots', async () => {
 const calls=[];const c=ui.createController({request:async(path,options)=>{calls.push({path,options});return options?{block:{id:8,master_id:3,date:'2026-12-03',start_time:'13:00',end_time:'14:00'}}:{slots:['10:00','14:00']};}});
 Object.assign(c.state,{user:{role:'admin'},services:[{id:7,active:1}]});
 await c.adminSave('block','',{master_id:'3',date:'2026-12-03',start_time:'13:00',end_time:'14:00'});
 assert.equal(calls[0]?.path,'/api/admin/blocks');assert.equal(calls[0]?.options.body.master_id,3);assert.ok(calls[1].path.startsWith('/api/slots?'));assert.match(c.state.success,/сохранены/);
});
test('admin creates services and edits masters with typed active values and real readback', async () => {
 const calls=[];let service,master;
 const c=ui.createController({request:async(path,options)=>{calls.push({path,options});if(options){if(path.includes('/services')){service={id:10,...options.body};return {service};}master={id:3,...options.body};return {master};}return path.endsWith('/services')?{services:[service]}:{masters:[master]};}});
 c.state.user={role:'admin'};
 await c.adminSave('service-create','',{name:'Новая услуга',description:'Описание',duration_minutes:'60',price:'1800',active:'1'});
 assert.equal(calls[0]?.options.method,'POST');assert.deepEqual(calls[0]?.options.body,{name:'Новая услуга',description:'Описание',duration_minutes:60,price:1800,active:1});assert.equal(c.state.services[0].id,10);
 await c.adminSave('master-edit',3,{name:'Анна',specialty:'Барбер',active:'0'});
 assert.equal(calls[2]?.path,'/api/admin/masters/3');assert.equal(calls[2]?.options.body.active,0);assert.equal(c.state.masters[0].active,0);
});
test('admin reschedules the same booking ID with exact date, time and master', async () => {
 const calls=[];const c=ui.createController({request:async(path,options)=>{calls.push({path,options});return options?{booking:{id:9}}:{bookings:[{id:9,date:'2026-12-03',time:'15:00',master_id:4}]};}});
 c.state.user={role:'admin'};await c.adminSave('reschedule',9,{date:'2026-12-03',time:'15:00',master_id:'4'});
 assert.equal(calls[0]?.path,'/api/admin/bookings/9');assert.deepEqual(calls[0].options.body,{date:'2026-12-03',time:'15:00',master_id:4});assert.equal(c.state.bookings[0].id,9);assert.match(c.state.success,/сохранены/);
});
test('admin loads protected sources and saves status with readback while preserving tab', async () => {
 const calls=[];let status='pending';
 const c=ui.createController({request:async(path,options)=>{calls.push({path,options});if(options){status=options.body.status;return {booking:{id:9,status}};}if(path.endsWith('/bookings'))return {bookings:[{id:9,status}]};if(path.endsWith('/services'))return {services:[]};return {masters:[]};}});
 c.state.user={role:'admin'};await c.load('admin');assert.ok(calls.some(x=>x.path==='/api/admin/bookings'));
 c.tab('services');assert.equal(c.state.adminTab,'services');
 await c.adminSave('status','9',{status:'confirmed'});
 assert.equal(c.state.bookings[0].status,'confirmed');assert.equal(c.state.adminTab,'services');assert.ok(calls.some(x=>x.options?.method==='PATCH'&&x.path==='/api/admin/bookings/9'));
 const unauthorized=[];const denied=ui.createController({request:async p=>unauthorized.push(p)});denied.state.user={role:'client'};await denied.load('admin');await denied.adminSave('status','9',{status:'completed'});assert.deepEqual(unauthorized,[]);
});
test('admin rendering protects access and exposes status, rename, catalog, masters and block forms', () => {
 assert.match(ui.render({route:'admin',user:{role:'client'}}),/Доступ только для администратора/);
 const s={route:'admin',user:{role:'admin'},adminTab:'bookings',bookings:[{id:9,service_name:'Стрижка',master_name:'Анна',status:'pending',date:'2026-12-02',time:'11:00'}],services:[{id:7,name:'Стрижка',duration_minutes:60,price:1500,active:1}],masters:[{id:3,name:'Анна',specialty:'Барбер',active:1}]};
 assert.match(ui.render(s),/data-form="status"/);assert.match(ui.render(s),/data-form="reschedule"/);
 assert.match(ui.render({...s,adminTab:'services'}),/data-form="service-edit"/);
 assert.match(ui.render({...s,adminTab:'services'}),/data-form="service-create"/);
 assert.match(ui.render({...s,adminTab:'masters'}),/data-form="master-edit"/);
 assert.match(ui.render({...s,adminTab:'blocks'}),/data-form="block"/);
});
test('logout verifies cookie session ended before clearing private state', async () => {
 const calls=[],routes=[];
 const c=ui.createController({navigate:r=>routes.push(r),request:async path=>{calls.push(path);if(path==='/api/auth/me')throw Object.assign(new Error('Нет сессии'),{status:401});return {};}});
 Object.assign(c.state,{user:{id:1},bookings:[{id:9}],serviceId:7});await c.logout();
 assert.deepEqual(calls,['/api/auth/logout','/api/auth/me']);assert.equal(c.state.user,null);assert.deepEqual(c.state.bookings,[]);assert.equal(routes.at(-1),'home');
});
test('cancel verifies changed booking via GET and does not write outside own list', async () => {
 const calls=[];const c=ui.createController({request:async(path,options)=>{calls.push({path,options});return options ? {} : {bookings:[{id:9,status:'cancelled'}]};}});
 Object.assign(c.state,{user:{id:1},bookings:[{id:9,status:'confirmed'}]});
 await c.cancel(99);assert.equal(calls.length,0);
 await c.cancel(9);assert.equal(calls[0].path,'/api/bookings/9');assert.equal(calls[0].options.method,'DELETE');assert.equal(calls[1].path,'/api/bookings');assert.equal(c.state.bookings[0].status,'cancelled');assert.match(c.state.success,/отменена/);
});
test('reserve uses selected IDs, verifies own booking readback and prevents duplicates; conflict refreshes slots', async () => {
 const calls=[],routes=[];let release;
 const c=ui.createController({navigate:r=>routes.push(r),request:async(path,options)=>{calls.push({path,options});if(path==='/api/bookings'&&options?.method==='POST') return new Promise(r=>release=r);if(path==='/api/bookings')return {bookings:[{id:21,status:'pending'}]};return {slots:['12:00']};}});
 Object.assign(c.state,{user:{id:1},route:'booking',serviceId:'7',masterId:'3',date:'2026-12-02',time:'11:00',slots:['11:00']});
 const first=c.reserve();await c.reserve();assert.equal(calls.length,1);
 assert.deepEqual(calls[0].options.body,{service_id:7,master_id:3,date:'2026-12-02',time:'11:00'});
 release({booking:{id:21}});await first;
 assert.equal(routes.at(-1),'cabinet');assert.match(c.state.success,/Запись создана/);assert.equal(c.state.bookings[0].id,21);
 const bad=ui.createController({request:async(path,options)=>{if(options?.method==='POST')throw Object.assign(new Error('Это время уже занято'),{status:409});return {slots:['12:00']};}});
 Object.assign(bad.state,{user:{id:1},serviceId:7,masterId:3,date:'2026-12-02',time:'11:00',slots:['11:00']});
 await bad.reserve();assert.equal(bad.state.error,'Это время уже занято');assert.deepEqual(bad.state.slots,['12:00']);assert.equal(bad.state.time,'');
});
test('booking loads masters and exact slots query, discarding stale slot responses', async () => {
 const calls=[]; let slow;
 const c=ui.createController({request:async path=>{calls.push(path);if(path==='/api/services')return {services:[{id:7}]};if(path==='/api/masters')return {masters:[{id:3,name:'Анна'}]};if(path.includes('master_id=3')) return new Promise(r=>slow=r);return {slots:['14:00']};}});
 c.state.user={id:1}; await c.load('booking?service=7');
 assert.equal(c.state.masters[0].name,'Анна'); assert.equal(c.state.serviceId,'7');
 const first=c.changeBooking('master_id','3');
 const second=c.changeBooking('master_id','4'); await second;
 slow({slots:['10:00']}); await first;
 assert.deepEqual(c.state.slots,['14:00']); assert.equal(c.state.time,'');
 assert.ok(calls.some(p=>p.includes('master_id=3')&&p.includes('service_id=7')&&p.includes('date='+c.state.date)));
 const routes=[]; const anon=ui.createController({navigate:r=>routes.push(r)});await anon.load('booking?service=7');assert.equal(routes.at(-1),'login?service=7');
});
test('selected booking survives login and double authentication is suppressed', async () => {
 const routes=[],calls=[]; let release;
 const c=ui.createController({navigate:r=>routes.push(r),request:async(path,options)=>{calls.push({path,options});return new Promise(r=>release=r);}});
 c.chooseService('7');
 assert.equal(routes.at(-1),'login?service=7');
 const pending=c.authenticate('login',{email:'test@example.test',password:'synthetic'});
 await c.authenticate('login',{email:'test@example.test',password:'synthetic'});
 assert.equal(calls.length,1); assert.equal(c.state.busy,true);
 release({user:{id:1,name:'Тест',role:'client'}}); await pending;
 assert.equal(c.state.user.name,'Тест'); assert.equal(routes.at(-1),'booking?service=7'); assert.equal(c.state.busy,false);
 const fail=ui.createController({request:async()=>{throw new Error('Неверный email или пароль');}});
 await fail.authenticate('login',{});
 assert.equal(fail.state.error,'Неверный email или пароль');
});
test('controller boots from session cookie and loads catalog from API', async () => {
 const calls=[],paints=[];
 const c=ui.createController({request:async path=>{calls.push(path); if(path==='/api/auth/me') throw Object.assign(new Error('Нет сессии'),{status:401}); return {services:[{id:4,name:'Из API'}]};},paint:s=>paints.push({...s}),navigate:()=>{}});
 await c.init('services');
 assert.equal(c.state.route,'services');
 assert.equal(c.state.user,null);
 assert.equal(c.state.services[0].name,'Из API');
 assert.deepEqual(calls,['/api/auth/me','/api/services']);
 assert.equal(c.state.loading,false);
 assert.ok(paints.some(s=>s.loading));
});
test('cabinet shows own booking, status, cancel only active, and empty state', () => {
 const s={route:'cabinet',user:{name:'Даниил',role:'client'},bookings:[{id:9,service_name:'Стрижка',master_name:'Анна',date:'2026-12-02',time:'11:00',price:1500,status:'confirmed'}]};
 const html=ui.render(s);
 for(const text of ['Даниил','Стрижка','Анна','Подтверждена','data-cancel="9"']) assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/href="#admin"/);
 assert.doesNotMatch(ui.render({...s,bookings:[{...s.bookings[0],status:'cancelled'}]}),/data-cancel=/);
 assert.match(ui.render({...s,bookings:[]}),/Пока нет записей/);
});
test('booking renders API masters and available slots with selected summary and guarded submit', () => {
 const state={route:'booking',services:[{id:7,name:'Стрижка',duration_minutes:60,price:1500}],serviceId:7,masters:[{id:3,name:'Анна',specialty:'Барбер'}],masterId:3,date:'2026-12-02',slots:['11:00','12:00'],time:'11:00',user:{name:'Тест'}};
 const html=ui.render(state);
 for(const text of ['Анна','Барбер','11:00','12:00','2026-12-02','data-form="booking"','Подтвердить запись','aria-pressed="true"','Стрижка']) assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/10:00/);
 assert.match(ui.render({...state,time:''}),/type="submit" disabled/);
 assert.match(ui.render({...state,slots:[],time:''}),/Свободного времени нет/);
 assert.match(ui.render({...state,slotsLoading:true}),/Загружаем свободное время/);
});
test('auth forms have stable labels, validation, server alert and no credentials prefilled', () => {
 const login=ui.render({route:'login',error:'Неверный email или пароль'});
 for(const text of ['Email','Пароль','Войти','Зарегистрироваться','role="alert"','autocomplete="current-password"']) assert.ok(login.includes(text),text);
 assert.doesNotMatch(login,/value="[^"]+"[^>]*type="password"/);
 const register=ui.render({route:'register'});
 for(const text of ['Имя','autocomplete="new-password"','minlength="8"','data-form="register"']) assert.ok(register.includes(text),text);
});
test('catalog renders real services, escaped names, loading and source errors', () => {
 const html=ui.render({route:'services',services:[{id:7,name:'Стрижка <script>',description:'Точно по форме',duration_minutes:60,price:1500}], user:null});
 assert.match(html,/Стрижка &lt;script&gt;/);
 assert.match(html,/1\s?500/);
 assert.match(html,/60 мин/);
 assert.match(html,/data-service="7"/);
 assert.match(html,/Услуги/);
 assert.match(ui.render({route:'services',services:[],loading:true}),/Загружаем услуги/);
 assert.match(ui.render({route:'services',services:[]}),/Услуги пока не добавлены/);
 assert.match(ui.render({route:'services',services:[],error:'Каталог недоступен'}),/role="alert"[^>]*>Каталог недоступен/);
});
test('API sends cookie-based JSON and preserves server error verbatim', async () => {
 let request;
 const fetcher = async (path, options) => { request={path,options}; return {ok:true,json:async()=>({user:{name:'Даниил'}})}; };
 assert.deepEqual(await ui.api('/api/auth/login',{method:'POST',body:{email:'a@b.ru',password:'secret'}},fetcher),{user:{name:'Даниил'}});
 assert.equal(request.options.credentials,'same-origin');
 assert.equal(request.options.body,JSON.stringify({email:'a@b.ru',password:'secret'}));
 assert.equal(request.options.headers['Content-Type'],'application/json');
 await assert.rejects(()=>ui.api('/bad',{},async()=>({ok:false,status:401,json:async()=>({error:'Неверный email или пароль'})})), {message:'Неверный email или пароль',status:401});
});
test('tomorrow uses local calendar and rolls over year', () => {
 assert.equal(ui.tomorrow(new Date(2026,11,31,23,45)), '2027-01-01');
 assert.equal(ui.tomorrow(new Date(2026,2,7,23)), '2026-03-08');
});
