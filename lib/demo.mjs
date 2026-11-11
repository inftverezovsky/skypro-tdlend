import {randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {hashPassword} from './auth.mjs';
import {createBooking} from './bookings.mjs';
export function initializeDemo(db,{credentialsPath='data/demo-access.json',adminPassword=process.env.ADMIN_PASSWORD,clientPassword=process.env.CLIENT_PASSWORD}={}) {
 if(db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get())return {credentialsPath,created:false};
 const access={admin:{email:'admin@tdlend.local',password:adminPassword||randomBytes(24).toString('base64url')},client:{email:'client@tdlend.local',password:clientPassword||randomBytes(24).toString('base64url')}};
 for(const x of Object.values(access))if(x.password.length<8||x.password.length>128)throw new Error('Demo passwords must be 8–128 characters');
 if(existsSync(credentialsPath))throw new Error('Credential file already exists; refusing to overwrite');
 db.exec('BEGIN IMMEDIATE');try{
 for(const [role,data] of Object.entries(access))db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(role==='admin'?'Администратор':'Демо-клиент',data.email,hashPassword(data.password),role);
 const client=db.prepare('SELECT * FROM users WHERE email=?').get(access.client.email);
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
 createBooking(db,client,{service_id:1,master_id:1,date,time:'10:00'});
 mkdirSync(dirname(credentialsPath),{recursive:true});writeFileSync(credentialsPath,JSON.stringify(access,null,2)+'\n',{mode:0o600,flag:'wx'});
 db.exec('COMMIT');return {credentialsPath,created:true};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
