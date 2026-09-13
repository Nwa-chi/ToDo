import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(root + 'dist', { recursive: true });
await cp(root+'public/',root+'dist/',{recursive:true});
await build({ absWorkingDir:root, entryPoints:['src/main.js'], outfile:'dist/app.js',
  bundle:true, minify:true, format:'esm', target:['es2022'], sourcemap:false });
const hash=createHash('sha256');
for(const name of ['app.js','index.html','styles.css','offline.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png'])hash.update(await readFile(root+'dist/'+name));
const worker=await readFile(root+'public/sw.js','utf8');
await writeFile(root+'dist/sw.js',worker.replace('__BUILD_ID__',hash.digest('hex').slice(0,16)));
console.log('Daymark 1.0 build complete.');
