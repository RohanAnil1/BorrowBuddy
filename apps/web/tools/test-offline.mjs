// Actual self-contained offline document, fonts and service worker in Chromium.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(join(process.env.NODE_MODULES_PATH, 'playwright'));
const root = resolve('apps/web/public');
let online = true;
const server = createServer(async (req, res) => {
  if (!online) { req.socket.destroy(); return; }
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/bootstrap') { res.setHeader('Content-Type', 'text/html'); res.end('<html><body>Ready</body></html>'); return; }
  if (path === '/campus/giveaways') { res.setHeader('Content-Type', 'text/html'); res.setHeader('Cache-Control', 'private, no-store'); res.end('<html><body>PRIVATE_CAMPUS_RETURNED</body></html>'); return; }
  if (path === '/manifest.webmanifest') { res.setHeader('Content-Type', 'application/manifest+json'); res.end('{"name":"BorrowBuddy"}'); return; }
  const file = resolve(root, '.' + path);
  if (!file.startsWith(root + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) { res.statusCode = 403; res.end(); return; }
  try {
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.woff2') ? 'font/woff2' : 'image/png');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 411, height: 900 } });
const page = await context.newPage(), result = { checks: [] }, errors = [];
page.on('pageerror', e => errors.push(e.message));
await mkdir('apps/web/verification', { recursive: true });
try {
  await page.goto(origin + '/bootstrap');
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  online = false;
  // This document and all three fonts have never been visited in the browser.
  await page.goto(origin + '/campus/giveaways?from=offline-test');
  await page.getByRole('heading', { name: 'A little out of reach.' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => document.fonts.check('16px CargoTitle') && document.fonts.check('16px CargoBody') && document.fonts.check('16px CargoLabel')));
  assert(!await page.locator('body').innerText().then(t => t.includes('PRIVATE_CAMPUS')));
  result.checks.push('first-visit offline navigation, uncached private page, all original fonts available without React/network');
  for (const width of [320, 411, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`);
    await page.screenshot({ path: `apps/web/verification/offline-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Pause animation' }).click();
  assert.equal(await page.locator('.parcel').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
  await page.getByRole('button', { name: 'Play animation' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.parcel').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.setViewportSize({ width: 411, height: 1000 });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Overflow at 200% zoom');
  await page.screenshot({ path: 'apps/web/verification/offline-200-percent.png', fullPage: true });
  await page.evaluate(() => { document.body.style.zoom = ''; });
  await page.getByRole('button', { name: 'Try again' }).focus();
  await page.keyboard.press('Enter');
  await page.getByText('Still out of reach.', { exact: false }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/campus/giveaways');
  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByRole('button', { name: 'Resume my page' }).waitFor();
  await page.getByRole('button', { name: 'Resume my page' }).click();
  await page.getByText('PRIVATE_CAMPUS_RETURNED', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).search, '?from=offline-test');
  assert.deepEqual(errors, []);
  result.checks.push('320/411/768/1440 layouts, 200% zoom, pause/play, reduced motion, keyboard retry, server reachability and original URL recovery');
  result.passed = true;
  console.log('PASS ' + result.checks.join('\nPASS '));
} catch (error) { result.passed = false; result.failure = error.stack; await page.screenshot({ path: 'apps/web/verification/offline-failure.png', fullPage: true }); throw error; }
finally { await writeFile('apps/web/verification/offline-result.json', JSON.stringify(result, null, 2)); await browser.close(); await new Promise(resolve => server.close(resolve)); }
