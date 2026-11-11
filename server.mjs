import { createServer } from 'node:http';
import { openDatabase } from './lib/database.mjs';
import {serveStatic} from './lib/static.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {initializeDemo} from './lib/demo.mjs';
import {saveCatalog} from './lib/catalog.mjs';
import {slots,createBooking,updateBooking,bookingSelect,positiveId,validDate,minute} from './lib/bookings.mjs';
import { hashPassword,verifyPassword,publicUser,newSession,currentUser,logout } from './lib/auth.mjs';
export function createApp({dbPath='data/tdlend.sqlite',seed=true,publicDir=fileURLToPath(new URL('./public/',import.meta.url))}={}) {
 const db=openDatabase(dbPath,seed);
 const server=createServer(async(req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','same-origin');
 const url=new URL(req.url,'http://localhost');
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 try {
 const user=currentUser(db,req);
 let body={};if(['POST','PATCH','DELETE'].includes(req.method)){
 if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`)return send(403,{error:'Запрос с другого сайта запрещён'});
 if(Number(req.headers['content-length'])>16384)return send(413,{error:'Слишком большой запрос'});
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){send(413,{error:'Слишком большой запрос'});return;}chunks.push(chunk);}
 body=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!body||Array.isArray(body)||typeof body!=='object')return send(400,{error:'Ожидается JSON-объект'});
 }
 if(req.method==='GET'&&url.pathname==='/api/services')return send(200,{services:db.prepare('SELECT * FROM services WHERE active=1').all()});
 if(req.method==='GET'&&url.pathname==='/api/masters')return send(200,{masters:db.prepare('SELECT * FROM masters WHERE active=1').all()});
 if(req.method==='GET'&&url.pathname==='/api/auth/me')return send(user?200:401,user?{user:publicUser(user)}:{error:'Требуется авторизация'});
 if(req.method==='POST'&&url.pathname==='/api/auth/register'){
 const name=typeof body.name==='string'?body.name.trim():'',email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(!name||name.length>100||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof body.password!=='string'||body.password.length<8||body.password.length>128)return send(400,{error:'Проверьте имя, email и пароль (не менее 8 символов)'});
 if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return send(409,{error:'Email уже зарегистрирован'});
 const id=Number(db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name,email,hashPassword(body.password)).lastInsertRowid);
 return send(201,{user:newSession(db,db.prepare('SELECT * FROM users WHERE id=?').get(id),res)});
 }
 if(req.method==='POST'&&url.pathname==='/api/auth/login'){
 const found=typeof body.email==='string'?db.prepare('SELECT * FROM users WHERE email=?').get(body.email.trim().toLowerCase()):undefined;
 if(!found||typeof body.password!=='string'||!verifyPassword(body.password,found.password_hash))return send(401,{error:'Неверный email или пароль'});
 return send(200,{user:newSession(db,found,res)});
 }
 if(req.method==='POST'&&url.pathname==='/api/auth/logout'){logout(db,req,res);return send(200,{ok:true});}
 if(url.pathname==='/api/notifications'||url.pathname==='/api/notifications/read'){
 if(!user)return send(401,{error:'Требуется авторизация'});
 if(req.method==='GET'&&url.pathname==='/api/notifications'){const notifications=db.prepare('SELECT id,text,read FROM notifications WHERE user_id=? ORDER BY id DESC').all(user.id).map(x=>({...x,read:!!x.read}));return send(200,{notifications,unread_count:notifications.filter(x=>!x.read).length});}
 if(req.method==='POST'&&url.pathname==='/api/notifications/read'){db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(user.id);return send(200,{ok:true});}
 }
 if(url.pathname.startsWith('/api/admin/')){
 if(!user)return send(401,{error:'Требуется авторизация'});if(user.role!=='admin')return send(403,{error:'Доступ только для администратора'});
 if(req.method==='POST'&&url.pathname==='/api/admin/blocks'){
 const mid=positiveId(body.master_id),date=validDate(body.date),start=minute(body.start_time),end=minute(body.end_time);
 if(start>=end||!db.prepare('SELECT id FROM masters WHERE id=?').get(mid))return send(400,{error:'Проверьте мастера и интервал'});
 if(db.prepare("SELECT id FROM bookings WHERE master_id=? AND date=? AND status!='cancelled' AND start_minute<? AND end_minute>?").get(mid,date,end,start))return send(409,{error:'В интервале есть запись, сначала перенесите её'});
 const id=Number(db.prepare('INSERT INTO blocks(master_id,date,start_minute,end_minute) VALUES(?,?,?,?)').run(mid,date,start,end).lastInsertRowid);return send(201,{block:{id,master_id:mid,date,start_time:body.start_time,end_time:body.end_time}});
 }
 if(req.method==='GET'&&url.pathname==='/api/admin/bookings')return send(200,{bookings:db.prepare(bookingSelect+' ORDER BY b.date,b.time').all()});
 let match=url.pathname.match(/^\/api\/admin\/bookings\/([^/]+)$/);
 if(match&&req.method==='PATCH')return send(200,{booking:updateBooking(db,match[1],body)});
 match=url.pathname.match(/^\/api\/admin\/(services|masters)(?:\/([^/]+))?$/);
 if(match){const [,kind,id]=match;if(req.method==='GET'&&!id)return send(200,{[kind]:db.prepare(`SELECT * FROM ${kind} ORDER BY id`).all()});if(req.method==='POST'&&!id)return send(201,saveCatalog(db,kind,null,body));if(req.method==='PATCH'&&id)return send(200,saveCatalog(db,kind,id,body));}
 }
 if(req.method==='GET'&&url.pathname==='/api/slots')return send(200,{slots:slots(db,Object.fromEntries(url.searchParams))});
 if(url.pathname.startsWith('/api/bookings')){
 if(!user)return send(401,{error:'Требуется авторизация'});
 if(url.pathname==='/api/bookings'&&req.method==='GET')return send(200,{bookings:db.prepare(bookingSelect+' WHERE b.user_id=? ORDER BY b.date,b.time').all(user.id)});
 if(url.pathname==='/api/bookings'&&req.method==='POST')return send(201,{booking:createBooking(db,user,body)});
 const match=url.pathname.match(/^\/api\/bookings\/([^/]+)$/);if(match){const id=positiveId(match[1]);const booking=db.prepare(bookingSelect+' WHERE b.id=? AND b.user_id=?').get(id,user.id);if(!booking)return send(404,{error:'Запись не найдена'});if(req.method==='GET')return send(200,{booking});if(req.method==='DELETE'){db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(id);return send(200,{booking:{...booking,status:'cancelled'}});}}
 }
 if(await serveStatic(req,res,url.pathname,publicDir,user))return;
 send(404,{error:'Не найдено'});
 }catch(error){send(error.status||400,{error:error.status?error.message:'Некорректный запрос'});}
 });let closing;return {server,db,close:()=>closing??=(new Promise(r=>server.close(()=>{db.close();r();})))};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const host=process.env.HOST||'127.0.0.1';
 const port=Number(process.env.PORT??3187);
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be an integer from 0 to 65535');
 const dbPath=process.env.DB_PATH||'data/tdlend.sqlite';
 const app=createApp({dbPath});
 try{
  initializeDemo(app.db,{credentialsPath:process.env.DEMO_CREDENTIALS_PATH||join(dirname(dbPath),'demo-access.json')});
  app.server.once('error',error=>{console.error('Server startup failed:',error.code||error.message);app.db.close();process.exitCode=1;});
  app.server.listen(port,host,()=>console.log(`TDlend listening at http://${host}:${app.server.address().port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().then(()=>process.exit(0));});
 }catch(error){app.db.close();console.error('Server initialization failed:',error.message);process.exitCode=1;}
}
