import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL } from './src/config.js';
import { daymarkCSP,scheduleAssets } from './scripts/schedule-assets.mjs';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const files = new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/styles.css','styles.css'],['/favicon.svg','favicon.svg'],...['build.json','sw.js','offline.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png'].map(f=>['/'+f,f])]);
for(const name of Object.keys(scheduleAssets))files.set('/schedule/'+name,'schedule/'+name);
const types = {'html':'text/html','js':'text/javascript','mjs':'text/javascript','css':'text/css','svg':'image/svg+xml','png':'image/png','webmanifest':'application/manifest+json','gz':'application/gzip','txt':'text/plain','json':'application/json'};
export function createServer() {
  return http.createServer(async (req,res) => {
    res.setHeader('Content-Security-Policy', daymarkCSP(SUPABASE_URL));
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
    let pathname;
    try { pathname = new URL(req.url,'http://localhost').pathname; }
    catch {res.writeHead(400);res.end();return;}
    const file = files.get(pathname);
    if (pathname==='/healthz') {
      try {await readFile(root+'index.html');res.writeHead(200,{'Content-Type':'application/json'});res.end(req.method==='HEAD'?'':'{"status":"ok"}');}
      catch {res.writeHead(503);res.end('Build required');} return;
    }
    if (!file) {res.writeHead(404);res.end('Not found');return;}
    try {
      const data = await readFile(root+file);
      res.writeHead(200,{'Content-Type':types[file.split('.').pop()]+'; charset=utf-8'});
      res.end(req.method==='HEAD'?undefined:data);
    } catch {res.writeHead(503);res.end('Run npm run build first.');}
  });
}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const server=createServer().listen(Number(process.env.PORT||4173),'0.0.0.0',()=>console.log('Daymark ready'));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
