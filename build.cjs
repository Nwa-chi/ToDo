const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = __dirname;
execFileSync(process.execPath, ['--check', path.join(root, 'app.js')]);
const assets = ['index.html', 'app.js', 'styles.css'];
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const name of assets) fs.copyFileSync(path.join(root, name), path.join(root, 'dist', name));
console.log('Built Daymark static assets in dist/.');
