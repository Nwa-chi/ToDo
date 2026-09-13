import { build } from 'esbuild';
import { mkdir, copyFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(root + 'dist', { recursive: true });
// Remove only generated files from this app's explicit output directory.
for (const name of await readdir(root + 'dist')) {
  if (['index.html','app.js','app.css','styles.css','favicon.svg'].includes(name))
    await unlink(root + 'dist/' + name);
}
await build({ absWorkingDir:root, entryPoints:['src/main.js'], outfile:'dist/app.js',
  bundle:true, minify:true, format:'esm', target:['es2022'], sourcemap:false });
for (const file of ['index.html','styles.css','favicon.svg'])
  await copyFile(root+'public/'+file, root+'dist/'+file);
console.log('Daymark build complete.');
