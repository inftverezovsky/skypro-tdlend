import {fail,positiveId} from './bookings.mjs';
export function saveCatalog(db,kind,id,body){
 const isService=kind==='services',key=isService?'service':'master';
 const existing=id?db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(positiveId(id)):null;
 if(id&&!existing)fail(404,'Объект не найден');
 const allowed=isService?['name','description','duration_minutes','price','active']:['name','specialty','active'];
 if(!Object.keys(body).length||Object.keys(body).some(x=>!allowed.includes(x)))fail(400,'Некорректные поля');
 const value={...(isService?{description:''}:{specialty:'Мастер'}),active:1,...existing,...body};
 if(typeof value.name!=='string'||!value.name.trim()||value.name.length>100)fail(400,'Некорректное имя');
 for(const field of isService?['description']:['specialty'])if(typeof value[field]!=='string'||value[field].length>1000)fail(400,'Некорректное описание');
 if(isService&&(!Number.isInteger(value.duration_minutes)||value.duration_minutes<30||value.duration_minutes>480||value.duration_minutes%30||!Number.isInteger(value.price)||value.price<0||value.price>1000000))fail(400,'Проверьте длительность и цену');
 if(![0,1,true,false].includes(value.active))fail(400,'Некорректная активность');value.active=Number(value.active);value.name=value.name.trim();
 const fields=allowed;db.exec('BEGIN IMMEDIATE');try{
 let target=id?positiveId(id):0;
 if(target)db.prepare(`UPDATE ${kind} SET ${fields.map(x=>x+'=?').join(',')} WHERE id=?`).run(...fields.map(x=>value[x]),target);
 else target=Number(db.prepare(`INSERT INTO ${kind}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).run(...fields.map(x=>value[x])).lastInsertRowid);
 if(!isService&&!id)for(let day=0;day<7;day++)db.prepare('INSERT INTO schedules VALUES(?,?,?,?)').run(target,day,600,1140);
 db.exec('COMMIT');return {[key]:db.prepare(`SELECT * FROM ${kind} WHERE id=?`).get(target)};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
