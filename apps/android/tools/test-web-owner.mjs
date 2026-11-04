import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebOwner({ baseUrl, email, emptyEmail, password, pendingCount, itemCount }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  async function login(page, address) {
    await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(address);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/home', { timeout: 60_000 });
    await page.goto(`${baseUrl}/my/items`);
    await page.getByRole('heading', { level: 1, name: /My items/i }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      let node = document.querySelector('main');
      while (node) { if (Number(getComputedStyle(node).opacity) < .999) return false; node = node.parentElement; }
      return true;
    });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    await login(page, email);
    const sections = page.locator('main section');
    assert.equal(await sections.count(), 3);
    assert.equal(await sections.nth(0).locator('article').count(), pendingCount);
    assert.equal(await sections.nth(1).locator('article').count(), itemCount);
    assert.equal(await sections.nth(2).locator('div.divide-y > div').count(), 8);
    await page.waitForFunction(() => [...document.querySelectorAll('main section:nth-of-type(2) img')]
      .every(image => image.complete && image.naturalWidth > 0));
    const measurements = [];
    for (const width of [411, 1024]) {
      await page.setViewportSize({ width, height: 838 });
      await page.evaluate(() => { scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const row = await page.evaluate(() => {
        const sections = [...document.querySelectorAll('main section')];
        const bounds = node => node.getBoundingClientRect().toJSON();
        return { viewport: innerWidth, headingSize: getComputedStyle(document.querySelector('main h1')).fontSize,
          requests: [...sections[0].querySelectorAll('article')].map(node => ({ bounds: bounds(node), reason: bounds(node.querySelector('input[name="reason"]')) })),
          listings: [...sections[1].querySelectorAll('article')].map(node => ({ bounds: bounds(node), cover: bounds(node.querySelector('a')), title: node.querySelector('div a').textContent.trim() })),
          recent: sections[2].querySelector('div.divide-y').children.length };
      });
      assert(row.listings.every(item => item.cover.width === 80 && item.cover.height === 80));
      assert.equal(row.recent, 8);
      measurements.push(row);
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-owner-top-${width}.png`, import.meta.url)) });
      await sections.nth(1).scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-owner-listings-${width}.png`, import.meta.url)) });
      await sections.nth(2).scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-owner-decisions-${width}.png`, import.meta.url)) });
    }
    await writeFile(new URL('../verification/web-owner-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
    const empty = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    await login(empty, emptyEmail);
    await empty.getByRole('heading', { name: /Nothing listed yet/i }).waitFor();
    assert.equal(await empty.locator('main article').count(), 0);
    await empty.getByText('NO PENDING REQUESTS. REQUESTS EXPIRE AUTOMATICALLY AFTER 48 HOURS.', { exact: true }).waitFor();
    await empty.screenshot({ path: fileURLToPath(new URL('../verification/web-owner-empty-411.png', import.meta.url)) });
    await empty.getByRole('link', { name: /List your first item/i }).click();
    await empty.waitForURL('**/items/new');
  } finally { await browser.close(); }
}
