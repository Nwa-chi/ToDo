import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL } from './src/config.js';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const files = new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/styles.css','styles.css'],['/favicon.svg','favicon.svg']]);
const types = {'html':'text/html','js':'text/javascript','css':'text/css','svg':'image/svg+xml'};
export function createServer() {
  return http.createServer(async (req,res) => {
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${SUPABASE_URL}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
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
