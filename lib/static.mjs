import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
export async function serveStatic(req,res,pathname,publicDir,user){
 if(!['GET','HEAD'].includes(req.method)||pathname.startsWith('/api/'))return false;
 let path;try{path=decodeURIComponent(pathname);}catch{return false;}
 if(path.includes('..')||path.includes('\\')||path.includes('\0')||path.split('/').some(x=>x.startsWith('.')))return false;
 if(/^\/admin(?:\/|$)/.test(path)&&user?.role!=='admin'){res.writeHead(user?403:401,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Нет доступа</title><h1>Доступ только для администратора</h1><a href="/login">Войти</a></html>');return true;}
 const ext=extname(path);if(ext&&!types[ext])return false;
 const target=resolve(publicDir,ext?path.slice(1):'index.html');
 try{const root=await realpath(publicDir),actual=await realpath(target);if(!actual.startsWith(root+sep))return false;const body=await readFile(actual);res.writeHead(200,{'Content-Type':types[ext||'.html'],'Content-Length':body.length,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);return true;}catch{return false;}
}
