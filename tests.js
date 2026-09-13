const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const js = fs.readFileSync('app.js', 'utf8');
for (const token of ['<main', '<nav', '<dialog', 'aria-live="polite"', 'aria-label="Task controls"', 'class="skip-link"']) {
  assert.ok(html.includes(token), `Missing accessible structure: ${token}`);
}
assert.ok(css.includes('@media(max-width:760px)'), 'Missing mobile rules');
assert.ok(css.includes(':focus-visible'), 'Missing keyboard focus');
assert.ok(css.includes('prefers-reduced-motion'), 'Missing reduced-motion preference');
for (const feature of ['localStorage.setItem', 'localStorage.getItem', 'isOverdue', 'openForm', 'confirmAction', 'showToast', 'undoState', 'crypto.randomUUID', 'Notification.requestPermission', 'scheduleAlerts', 'notifiedAt']) {
  assert.ok(js.includes(feature), `Missing task-flow feature: ${feature}`);
}
console.log('Source structure checks passed. Browser flows have not been tested by this script.');
