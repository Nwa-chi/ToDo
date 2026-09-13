const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Explicit allowlist: source, migrations, secrets and repository metadata cannot
// be downloaded, even when this server runs from the repository root.
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
function createServer(root = path.join(__dirname, 'dist')) {
  return http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') {
      const ready = assets.size > 0 && fs.existsSync(path.join(root, 'index.html'));
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: ready ? 'ok' : 'build_required' }));
      return;
    }
    const asset = assets.get(url.pathname);
    if (!asset) { res.writeHead(404); res.end('Not found'); return; }
    fs.readFile(path.join(root, asset[0]), (error, data) => {
      if (error) { res.writeHead(503); res.end('Build required: run npm run build.'); return; }
      res.writeHead(200, { 'Content-Type': asset[1] });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const server = createServer();
  server.listen(port, '0.0.0.0', () => console.log('Daymark listening on port ' + port));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
module.exports = { createServer };
