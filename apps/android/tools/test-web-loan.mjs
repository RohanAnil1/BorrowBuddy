import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebLoan({ baseUrl, email, password, loanId }) {
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
    await page.goto(`${baseUrl}/loans/${loanId}`);
    await page.getByText('COUNTERPARTY TRUST', { exact: true }).waitFor();
    await page.getByText('IN-APP 6-DIGIT CODE', { exact: true }).waitFor();
    await page.getByText('No deposit', { exact: true }).waitFor();
    await page.getByText('You already rated this loan.', { exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      let node = document.querySelector('main');
      if (!node) return false;
      while (node) { if (Number(getComputedStyle(node).opacity) < .999) return false; node = node.parentElement; }
      return true;
    });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const measurements = [];
    for (const width of [411, 768, 1024]) {
      await page.setViewportSize({ width, height: 838 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => scrollTo(0, 0));
      measurements.push(await page.locator('main').evaluate(main => ({
        viewport: innerWidth,
        facts: [...main.querySelectorAll('div.grid > div')].map(node => ({
          text: node.textContent, bounds: node.getBoundingClientRect().toJSON(),
        })),
        title: main.querySelector('h1')?.textContent,
        titleStyle: main.querySelector('h1') ? (() => {
          const style = getComputedStyle(main.querySelector('h1'));
          return { fontSize: style.fontSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing };
        })() : null,
      })));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-loan-returned-${width}.png`, import.meta.url)) });
    }
    assert(measurements.every(row => row.facts.length === 4), 'All source facts must be measured');
    for (const row of measurements) {
      const expectedWidth = row.viewport >= 1024 ? 195 : row.viewport >= 640 ? 362 : 379;
      assert(row.facts.every(fact => Math.abs(fact.bounds.width - expectedWidth) < 1), 'Source fact widths must reflect the current viewport');
      assert(Math.abs(parseFloat(row.titleStyle.fontSize) - Math.max(40, Math.min(64, row.viewport * .06))) < .1,
        'Computed title styles must reflect the current viewport');
    }
    await page.setViewportSize({ width: 411, height: 838 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.getByText('[ CUSTODY CHAIN ]', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL('../verification/web-loan-timeline-411.png', import.meta.url)) });
    await writeFile(new URL('../verification/web-loan-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
  } finally { await browser.close(); }
}
