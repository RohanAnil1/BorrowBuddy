import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Source-site captures use a normal fixture user's browser session. */
export async function testWebShell({ baseUrl, email, password }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/home', { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    // Reduced motion still permits the source template's opacity entrance.
    await page.waitForFunction(() => {
      let node = document.querySelector('header');
      if (!node) return false;
      while (node) {
        if (Number(getComputedStyle(node).opacity) < .999) return false;
        node = node.parentElement;
      }
      return true;
    });
    // Exclude only Next's development indicator from reference captures.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const header = page.locator('header');
    await header.getByRole('link', { name: 'My items' }).getByText('61', { exact: true }).waitFor();
    assert.match(await header.getByRole('link', { name: /^Notifications/ }).getAttribute('aria-label'), /\(\d+ unread\)/);
    const measurements = [];
    for (const width of [411, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-shell-${width}.png`, import.meta.url)) });
      await header.screenshot({ path: fileURLToPath(new URL(`../verification/web-shell-header-${width}.png`, import.meta.url)) });
      measurements.push(await header.evaluate((node) => ({
        width: innerWidth, bounds: node.getBoundingClientRect().toJSON(),
        controls: [...node.querySelectorAll('a')].map(link => {
          const style = getComputedStyle(link);
          return { label: link.getAttribute('aria-label') || link.textContent.trim(),
            bounds: link.getBoundingClientRect().toJSON(), font: style.fontFamily,
            size: style.fontSize, lineHeight: style.lineHeight, color: style.color };
        }),
      })));
    }
    await writeFile(new URL('../verification/web-shell-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
    return measurements;
  } finally { await browser.close(); }
}
