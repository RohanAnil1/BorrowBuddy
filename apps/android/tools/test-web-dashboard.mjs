import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebDashboard({ baseUrl, email, password, emptyEmail }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/home', { timeout: 60_000 });
    await page.goto(`${baseUrl}/dashboard`);
    await page.getByRole('button', { name: 'BORROWING (1)', exact: true }).waitFor();
    await page.getByRole('button', { name: 'LENDING (1)', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      let node = document.querySelector('main');
      if (!node) return false;
      while (node) { if (Number(getComputedStyle(node).opacity) < .999) return false; node = node.parentElement; }
      return true;
    });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await page.screenshot({ path: fileURLToPath(new URL('../verification/web-dashboard-top-411.png', import.meta.url)) });
    await page.screenshot({ path: fileURLToPath(new URL('../verification/web-dashboard-borrowing-411.png', import.meta.url)), fullPage: true });
    await page.getByRole('button', { name: 'LENDING (1)', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('main li')].some(node => node.textContent.includes('TO ANDROID QA OWNER')));
    await page.waitForFunction(() => [...document.querySelectorAll('main li')].every(node => {
      let current = node;
      while (current && current.tagName !== 'MAIN') { if (+getComputedStyle(current).opacity < .999) return false; current = current.parentElement; }
      return true;
    }));
    const measurements = [];
    for (const width of [411, 1024]) {
      await page.setViewportSize({ width, height: 838 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      measurements.push(await page.locator('main').evaluate(main => ({
        viewport: innerWidth,
        heading: { text: main.querySelector('h1').textContent.trim(), size: getComputedStyle(main.querySelector('h1')).fontSize },
        categories: [...main.querySelectorAll('a[href^="/home?category="]')].map(node => ({ text: node.textContent, bounds: node.getBoundingClientRect().toJSON() })),
        tabs: [...main.querySelectorAll('button')].map(node => node.textContent.trim()),
        tickets: [...main.querySelectorAll('a.snap-start')].map(node => ({ text: node.textContent, bounds: node.getBoundingClientRect().toJSON() })),
      })));
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-dashboard-lending-${width}.png`, import.meta.url)), fullPage: true });
      await page.locator('main a[href^="/home?category="]').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-dashboard-categories-${width}.png`, import.meta.url)) });
      await page.locator('main li').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-dashboard-movements-${width}.png`, import.meta.url)) });
    }
    assert(measurements.every(row => row.tickets.length === 2 && row.categories.length > 0));
    for (const row of measurements) assert(row.categories.every(category => Math.abs(category.bounds.width - (row.viewport === 411 ? 183.5 : 227)) < 1));
    await writeFile(new URL('../verification/web-dashboard-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
    if (emptyEmail) {
      const context = await browser.newContext({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
      const empty = await context.newPage();
      await empty.goto(`${baseUrl}/login?next=%2Fhome`);
      await empty.locator('input[name="email"]').fill(emptyEmail);
      await empty.locator('input[name="password"]').fill(password);
      await empty.locator('form button[type="submit"]').click();
      await empty.waitForURL('**/home', { timeout: 60_000 });
      await empty.goto(`${baseUrl}/dashboard`);
      await empty.getByRole('button', { name: 'BORROWING (0)', exact: true }).waitFor();
      await empty.getByRole('button', { name: 'LENDING (0)', exact: true }).waitFor();
      await empty.getByText('[ NOTHING HERE YET ]', { exact: true }).waitFor();
      await empty.evaluate(() => document.fonts.ready);
      await empty.waitForFunction(() => {
        let node = document.querySelector('main');
        if (!node) return false;
        while (node) { if (+getComputedStyle(node).opacity < .999) return false; node = node.parentElement; }
        return true;
      });
      await empty.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      await empty.screenshot({ path: fileURLToPath(new URL('../verification/web-dashboard-empty-411.png', import.meta.url)), fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); }
}
