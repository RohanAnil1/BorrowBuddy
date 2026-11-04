import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(join(process.env.NODE_MODULES_PATH, 'playwright'));
const web = process.env.BORROWBUDDY_QA_WEB_URL;
assert(web?.startsWith('http://localhost:'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const context = await browser.newContext({ viewport: { width: 411, height: 1000 } });
const page = await context.newPage(), result = {};
try {
  await page.goto(web + '/offline.html');
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => (await (await caches.open('borrowbuddy-v3')).keys()).map(r => new URL(r.url).pathname));
  assert(cached.includes('/offline.html') && cached.filter(p => p.startsWith('/offline-assets/')).length === 3);
  assert(!cached.some(p => p.startsWith('/campus') || p.startsWith('/auth') || p.startsWith('/loans')));
  await context.setOffline(true);
  await page.goto(web + '/campus/giveaways?offline-production-test=1');
  await page.getByRole('heading', { name: 'A little out of reach.' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').length === 3));
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByText('Still out of reach.', { exact: false }).waitFor();
  await page.screenshot({ path: 'apps/web/verification/offline-production-411.png', fullPage: true });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Resume my page' }).waitFor();
  await page.getByRole('button', { name: 'Resume my page' }).click();
  await page.waitForURL(url => url.pathname === '/login');
  assert.equal(new URL(page.url()).searchParams.get('next'), '/campus/giveaways?offline-production-test=1');
  result.passed = true; result.cachedPaths = cached;
  console.log('PASS actual Next production offline fallback, all three precached fonts, browser disconnect/reconnect, original URL recovery and authentication guard');
} catch (error) { result.passed = false; result.failure = error.stack; throw error; }
finally { await writeFile('apps/web/verification/offline-production-result.json', JSON.stringify(result, null, 2)); await browser.close(); }
