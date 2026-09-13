const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createServer } = require('./server.cjs');
let server, base;
before(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'build.cjs')]);
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
test('serves the built app and its actual assets', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Daymark/);
  for (const resource of [...html.matchAll(/(?:src|href)="(app.js|styles.css)"/g)]) {
    const response = await fetch(base + '/' + resource[1]);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).length > 100);
  }
});
test('blocks source files, secrets, migrations and directory listings', async () => {
  for (const resource of ['/.git/config', '/.env', '/README.md', '/package.json', '/server.cjs', '/supabase/', '/docs/']) {
    assert.equal((await fetch(base + resource)).status, 404, resource);
  }
});
test('sends security headers and only allows GET and HEAD', async () => {
  const response = await fetch(base);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  assert.equal(await (await fetch(base, { method: 'HEAD' })).text(), '');
});
test('health endpoint confirms a built app is available', async () => {
  assert.deepEqual(await (await fetch(base + '/healthz')).json(), { status: 'ok' });
});
