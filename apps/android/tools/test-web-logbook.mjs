import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebLogbook({ baseUrl, email, password }) {
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
    try {
      await page.waitForURL('**/home', { timeout: 60_000 });
    } catch (failure) {
      // Retain the source form's actual error, without credentials or input values.
      // A navigation timeout alone cannot distinguish auth/transport/app failures.
      const redact = value => String(value).replaceAll(password, '[QA PASSWORD REDACTED]')
        .replaceAll(email, '[QA EMAIL REDACTED]')
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[TOKEN REDACTED]');
      const diagnostic = { url: redact(page.url()), text: redact(await page.locator('body').innerText()) };
      await writeFile(new URL('../verification/web-logbook-login-failure.json', import.meta.url), JSON.stringify(diagnostic, null, 2));
      throw failure;
    }
    await page.goto(`${baseUrl}/my/borrows`);
    await page.getByText('[ YOUR ITEMS OUT ON LOAN ]', { exact: true }).waitFor();
    await page.getByText(/DATES JUST OPENED UP/).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
      let node = document.querySelector('main');
      if (!node) return false;
      while (node) { if (Number(getComputedStyle(node).opacity) < .999) return false; node = node.parentElement; }
      return true;
    });
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const measurements = [];
    for (const width of [411, 1024]) {
      await page.setViewportSize({ width, height: 838 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => scrollTo(0, 0));
      measurements.push(await page.locator('main').evaluate(main => ({
        viewport: innerWidth,
        heading: main.querySelector('h1').getBoundingClientRect().toJSON(),
        headingSize: getComputedStyle(main.querySelector('h1')).fontSize,
        sections: [...main.querySelectorAll('h2')].map(node => node.textContent.trim()),
        loanRows: [...main.querySelectorAll('a[href^="/loans/"]')].map(node => ({ text: node.textContent, bounds: node.getBoundingClientRect().toJSON() })),
      })));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-logbook-${width}.png`, import.meta.url)), fullPage: true });
    }
    assert(measurements.every(row => row.loanRows.length >= 2), 'Source logbook must show both loan roles');
    await writeFile(new URL('../verification/web-logbook-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
  } finally { await browser.close(); }
}
