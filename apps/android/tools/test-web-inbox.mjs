import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebInbox({ baseUrl, email, emptyEmail, password, phase, unread }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); } catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  async function login(page, address) {
    await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(address); await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click(); await page.waitForURL('**/home', { timeout: 60_000 });
  }
  async function settle(page) {
    await page.getByRole('heading', { level: 1, name: 'Notifications', exact: true }).waitFor();
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
    const measurements = [];
    for (const width of [411, 1024]) {
      await page.setViewportSize({ width, height: 838 }); await page.goto(`${baseUrl}/notifications`); await settle(page);
      assert.equal(await page.locator('main ol > li').count(), 40);
      assert.equal(await page.locator('main .blink-label').count(), unread);
      assert.equal(await page.getByRole('button', { name: 'Mark all read', exact: true }).count(), unread > 0 ? 1 : 0);
      const rows = page.locator('main ol > li');
      assert((await rows.nth(0).locator('a').getAttribute('href')).startsWith('/loans/'));
      assert((await rows.nth(1).locator('a').getAttribute('href')).startsWith('/items/'));
      for (const index of [2, 3, 4]) assert.equal(await rows.nth(index).locator('a').count(), 0);
      measurements.push(await page.evaluate(() => {
        const bounds = node => node.getBoundingClientRect().toJSON();
        const style = node => { const css = getComputedStyle(node); return { font: css.fontFamily, size: css.fontSize, lineHeight: css.lineHeight, background: css.backgroundColor, border: css.borderColor }; };
        return { viewport: innerWidth, title: { ...style(document.querySelector('main h1')), bounds: bounds(document.querySelector('main h1')) },
          rows: [...document.querySelectorAll('main article')].slice(0, 5).map(node => ({ bounds: bounds(node), style: style(node),
            title: style(node.querySelector('p')), body: node.querySelector('.type-body') ? style(node.querySelector('.type-body')) : null,
            dot: node.querySelector('.blink-label') ? bounds(node.querySelector('.blink-label')) : null })) };
      }));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-inbox-${phase}-${width}.png`, import.meta.url)) });
    }
    if (emptyEmail) {
      const empty = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
      await login(empty, emptyEmail); await empty.goto(`${baseUrl}/notifications`); await settle(empty);
      assert.equal(await empty.locator('main article').count(), 0); assert.equal(await empty.getByRole('button', { name: 'Mark all read', exact: true }).count(), 0);
      const title = empty.getByRole('heading', { name: 'Nothing on the wire', exact: true }); await title.waitFor(); await title.locator('..').scrollIntoViewIfNeeded();
      await empty.screenshot({ path: fileURLToPath(new URL('../verification/web-inbox-empty-411.png', import.meta.url)) });
    }
    await writeFile(new URL(`../verification/web-inbox-${phase}-measurements.json`, import.meta.url), JSON.stringify(measurements, null, 2));
  } finally { await browser.close(); }
}
