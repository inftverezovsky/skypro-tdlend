import { randomBytes,scryptSync,timingSafeEqual,createHash } from 'node:crypto';
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(password,hash){const [,salt,key]=hash.split('$');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex'));}
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export const publicUser=({id,name,email,role})=>({id,name,email,role});
export function newSession(db,user,res){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(token),user.id,Date.now()+7*86400000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);return publicUser(user);}
export function currentUser(db,req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);return token?db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token),Date.now()):undefined;}
export function logout(db,req,res){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');}
