// Real Chromium/CacheStorage regression; synthetic pages, no Supabase fixtures.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(join(process.env.NODE_MODULES_PATH, 'playwright'));
const worker = await readFile(new URL('../../web/public/sw.js', import.meta.url), 'utf8');
const reportPath = new URL(`../verification/${process.argv[2] || 'web-offline-cache-result.json'}`, import.meta.url);
let networkAvailable = true;
const server = createServer((request, response) => {
  if (!networkAvailable) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/sw.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(worker); return; }
  if (path.startsWith('/icons/')) { response.setHeader('Content-Type', 'image/svg+xml'); response.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="orange" d="M0 0h16v16H0z"/></svg>'); return; }
  if (path === '/manifest.webmanifest') { response.setHeader('Content-Type', 'application/manifest+json'); response.end('{"name":"QA cache test"}'); return; }
  if (path.startsWith('/_next/static/')) {
    response.setHeader('Content-Type', 'text/javascript');
    if (path.endsWith('private.js')) response.setHeader('Cache-Control', 'private, no-store');
    response.end(path.endsWith('private.js') ? 'QA_PRIVATE_ASSET' : 'QA_PUBLIC_STATIC'); return;
  }
  response.setHeader('Content-Type', 'text/html');
  if (path === '/home') {
    response.setHeader('Cache-Control', 'private, no-store');
    if (!request.headers.cookie?.includes('qa_session=alpha')) { response.statusCode=401; response.end('LOGIN_REQUIRED'); return; }
    response.end('<html><body>QA_PRIVATE_ACCOUNT_ALPHA</body></html>'); return;
  }
  if (path === '/api/private') {
    response.setHeader('Cache-Control', 'private, no-store'); response.end('QA_PRIVATE_API'); return;
  }
  if (path === '/offline.html') { response.end('<html><body>PUBLIC_OFFLINE_SHELL</body></html>'); return; }
  response.end('<html><body>PUBLIC_LANDING</body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const context = await browser.newContext();
const page = await context.newPage();
const result = { syntheticOnly: true, realServiceWorker: true };
try {
  await page.goto(origin);
  await page.evaluate(async () => {
    const old = await caches.open('borrowbuddy-v1');
    await old.put('/legacy-private', new Response('QA_PREVIOUS_PRIVATE_PAGE'));
    await (await caches.open('another-app')).put('/unrelated', new Response('UNRELATED_CACHE'));
    await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.addCookies([{ name: 'qa_session', value: 'alpha', url: origin }]);
  await page.goto(`${origin}/home`);
  assert.equal(await page.locator('body').innerText(), 'QA_PRIVATE_ACCOUNT_ALPHA');
  await page.evaluate(async () => {
    await fetch('/_next/static/public.js'); await fetch('/_next/static/private.js');
  });
  // Drain pending CacheStorage work without assuming the worker's implementation.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
  const cachedPaths = await page.evaluate(async () => {
    const paths = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname);
    return paths;
  });
  result.privatePagesCached = cachedPaths.filter(path => path === '/home' || path === '/legacy-private' || path === '/_next/static/private.js');
  result.unrelatedCacheRetained = await page.evaluate(async () => (await caches.keys()).includes('another-app'));
  await context.clearCookies(); result.sessionCookieCleared = true;
  networkAvailable = false;
  await page.goto(`${origin}/home`);
  const offline = await page.locator('body').innerText();
  result.privateContentReplayedOffline = offline.includes('QA_PRIVATE_');
  result.offlineShellAvailable = offline === 'PUBLIC_OFFLINE_SHELL';
  const apiFailed = await page.evaluate(async () => {
    try { await fetch('/api/private'); return false; } catch { return true; }
  });
  result.privateApiNotCached = apiFailed;
  result.publicAssetsAvailableOffline = await page.evaluate(async () =>
    (await (await fetch('/icons/icon-192.png')).text()).includes('<svg') &&
    (await (await fetch('/_next/static/public.js')).text()) === 'QA_PUBLIC_STATIC');
  assert.deepEqual(result.privatePagesCached, [], 'Private navigation/old caches must not retain account pages');
  assert.equal(result.privateContentReplayedOffline, false, 'Offline navigation must not replay a previous private page');
  assert.equal(result.offlineShellAvailable, true, 'The existing public offline shell must remain usable');
  assert.equal(result.privateApiNotCached, true);
  assert.equal(result.publicAssetsAvailableOffline, true);
  assert.equal(result.unrelatedCacheRetained, true);
  networkAvailable = true;
  const serviceWorker = context.serviceWorkers()[0]; assert(serviceWorker);
  await serviceWorker.evaluate(() => {
    Cache.prototype.put = async () => { throw new DOMException('QA storage quota', 'QuotaExceededError'); };
  });
  await page.goto(`${origin}/?quota-check`);
  assert.equal(await page.locator('body').innerText(), 'PUBLIC_LANDING');
  assert.equal(await page.evaluate(async () => (await (await fetch('/_next/static/quota.js')).text())), 'QA_PUBLIC_STATIC');
  result.cacheWriteFailureKeepsNetwork = true;
  await serviceWorker.evaluate(() => {
    CacheStorage.prototype.open = async () => { throw new DOMException('QA storage denial', 'SecurityError'); };
  });
  assert.equal(await page.evaluate(async () => (await (await fetch('/_next/static/no-cache.js')).text())), 'QA_PUBLIC_STATIC');
  result.cacheReadFailureKeepsNetwork = true;
  result.passed = true;
  console.log('PASS private/legacy page isolation, public offline shell and uncached private API using the actual service worker');
} catch (failure) {
  result.passed = false; result.error = failure.message; throw failure;
} finally {
  await writeFile(reportPath, JSON.stringify(result, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
