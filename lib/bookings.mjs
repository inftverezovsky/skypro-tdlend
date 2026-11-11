export function fail(status,message){throw Object.assign(new Error(message),{status});}
export function positiveId(value){if(!/^[1-9]\d*$/.test(String(value))||!Number.isSafeInteger(Number(value)))fail(400,'Некорректный идентификатор');return Number(value);}
export function validDate(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<new Date().toISOString().slice(0,10))fail(400,'Выберите будущую дату');return date;}
export function minute(time){if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail(400,'Некорректное время');return Number(time.slice(0,2))*60+Number(time.slice(3));}
export const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export const bookingSelect=`SELECT b.id,b.user_id,b.service_id,s.name AS service_name,b.master_id,m.name AS master_name,b.date,b.time,b.price,b.status,b.start_minute,b.end_minute FROM bookings b JOIN services s ON s.id=b.service_id JOIN masters m ON m.id=b.master_id`;
export function slots(db,{date,master_id,service_id},exclude=0,durationMinutes){
 validDate(date);
 const mid=positiveId(master_id),sid=positiveId(service_id);
 const service=db.prepare('SELECT * FROM services WHERE id=?').get(sid);
 const master=db.prepare('SELECT * FROM masters WHERE id=?').get(mid);
 if(!service||!master||!service.active||!master.active)fail(400,'Услуга или мастер не найдены');
 // Existing bookings retain their purchased duration when the catalog changes.
 const duration=durationMinutes??service.duration_minutes;
 const schedule=db.prepare('SELECT * FROM schedules WHERE master_id=? AND weekday=?').get(mid,new Date(`${date}T12:00:00Z`).getUTCDay());
 if(!schedule)return [];
 const booked=[
  ...db.prepare("SELECT start_minute,end_minute FROM bookings WHERE master_id=? AND date=? AND status!='cancelled' AND id!=?").all(mid,date,exclude),
  ...db.prepare('SELECT start_minute,end_minute FROM blocks WHERE master_id=? AND date=?').all(mid,date)
 ];
 const result=[];
 for(let start=schedule.start_minute;start+duration<=schedule.end_minute;start+=30){
  if(new Date(`${date}T${clock(start)}:00`).getTime()<=Date.now())continue;
  if(!booked.some(b=>b.start_minute<start+duration&&b.end_minute>start))result.push(clock(start));
 }
 return result;
}
export function updateBooking(db,id,body){
 const old=db.prepare(bookingSelect+' WHERE b.id=?').get(positiveId(id));if(!old)fail(404,'Запись не найдена');
 if(!Object.keys(body).length||Object.keys(body).some(k=>!['date','time','master_id','status'].includes(k)))fail(400,'Некорректные поля записи');
 const reschedule=['date','time','master_id'].some(k=>k in body);const status=body.status??old.status;
 if(!['confirmed','cancelled','completed'].includes(status))fail(400,'Некорректный статус');
 const date=body.date??old.date,time=body.time??old.time,mid=positiveId(body.master_id??old.master_id);
 db.exec('BEGIN IMMEDIATE');try{
 const duration=old.end_minute-old.start_minute;
 if(reschedule&&(old.status==='cancelled'||old.status==='completed'))fail(400,'Перенос доступен только для активной записи');
 // Cancelled rows release capacity; reopening a closed row must recheck it.
 const reactivate=(old.status==='cancelled'&&status!=='cancelled')||(old.status==='completed'&&status==='confirmed');
 if(reschedule||reactivate){
  minute(time);
  if(!slots(db,{date,master_id:mid,service_id:old.service_id},old.id,duration).includes(time))fail(409,'Это время уже занято или недоступно');
 }
 db.prepare('UPDATE bookings SET date=?,time=?,master_id=?,start_minute=?,end_minute=?,status=? WHERE id=?').run(date,time,mid,minute(time),minute(time)+duration,status,old.id);
 let text;if(reschedule)text=`Запись «${old.service_name}» перенесена с ${old.date} ${old.time} на ${date} ${time}.`;
 else if(status==='cancelled'&&old.status!=='cancelled')text=`Запись «${old.service_name}» на ${date} ${time} отменена администратором.`;
 if(text)db.prepare('INSERT INTO notifications(user_id,text) VALUES(?,?)').run(old.user_id,text);
 db.exec('COMMIT');return db.prepare(bookingSelect+' WHERE b.id=?').get(old.id);
 }catch(error){db.exec('ROLLBACK');if(/booking_conflict|UNIQUE/.test(error.message))fail(409,'Это время уже занято');throw error;}
}
export function createBooking(db,user,body){const {date,time}=body;const mid=positiveId(body.master_id),sid=positiveId(body.service_id);minute(time);if(!slots(db,{date,master_id:mid,service_id:sid}).includes(time))fail(409,'Это время уже занято или недоступно');const service=db.prepare('SELECT * FROM services WHERE id=?').get(sid);try{const id=Number(db.prepare('INSERT INTO bookings(user_id,service_id,master_id,date,time,start_minute,end_minute,price) VALUES(?,?,?,?,?,?,?,?)').run(user.id,sid,mid,date,time,minute(time),minute(time)+service.duration_minutes,service.price).lastInsertRowid);return db.prepare(bookingSelect+' WHERE b.id=?').get(id);}catch(error){if(/booking_conflict|UNIQUE/.test(error.message))fail(409,'Это время уже занято');throw error;}}
