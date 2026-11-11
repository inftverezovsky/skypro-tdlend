import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path, seed=true) {
 if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);
 db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 db.exec(readFileSync(new URL('../migrations/001-initial.sql',import.meta.url),'utf8'));
 if(!db.prepare('PRAGMA table_info(services)').all().some(x=>x.name==='active'))db.exec('ALTER TABLE services ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))');
 if(!db.prepare('PRAGMA table_info(masters)').all().some(x=>x.name==='active'))db.exec('ALTER TABLE masters ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))');
 if(seed && !db.prepare('SELECT id FROM services LIMIT 1').get()) {
 const s=db.prepare('INSERT INTO services(id,name,description,duration_minutes,price) VALUES(?,?,?,?,?)');s.run(1,'Стрижка','Форма и укладка',60,1800);s.run(2,'Окрашивание','Однотонное окрашивание',120,4500);s.run(3,'Уход за волосами','Восстановление и блеск',60,2200);
 const m=db.prepare('INSERT INTO masters(id,name,specialty) VALUES(?,?,?)');m.run(1,'Анна Смирнова','Стилист');m.run(2,'Мария Волкова','Колорист');m.run(3,'Алексей Орлов','Стилист');
 }if(seed){for(const m of db.prepare('SELECT id FROM masters').all())for(let day=0;day<7;day++)db.prepare('INSERT OR IGNORE INTO schedules VALUES(?,?,?,?)').run(m.id,day,600,1140);}return db;
}
