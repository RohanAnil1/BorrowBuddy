import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** Capture the source catalog with the same isolated item/user as native validation. */
export async function testWebCatalog({ baseUrl, email, password, itemId, title, categoryId }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
  const network = [];
  page.on('response', response => { if (response.status() >= 400) network.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  page.on('requestfailed', request => network.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText }));
  try {
    const ready = async () => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        let node = document.querySelector('main');
        if (!node) return false;
        while (node) { if (Number(getComputedStyle(node).opacity) < .999) return false; node = node.parentElement; }
        return true;
      });
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
      // Native lazy loading leaves offscreen img.decode() promises pending until
      // the image enters the viewport. The initial catalog may contain many rows.
      // This screenshot needs visible photos; the filtered fixture below has its
      // own explicit decoded-size assertion, and demo galleries are checked apart.
      await page.locator('main img').evaluateAll(images => Promise.all(images.filter(image => {
        const bounds = image.getBoundingClientRect();
        return bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
      }).map(image => image.decode().catch(() => {}))));
    };
    await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/home', { timeout: 60_000 });
    await ready();
    await page.screenshot({ path: fileURLToPath(new URL('../verification/web-catalog-browse-411.png', import.meta.url)) });
    const params = new URLSearchParams({ q: title, category: categoryId });
    await page.goto(`${baseUrl}/home?${params}`); await ready();
    const card = page.locator(`main a[href="/items/${itemId}"]`);
    assert.equal(await card.count(), 1);
    assert.deepEqual(await card.locator('img').evaluate(image => [image.naturalWidth, image.naturalHeight]), [2, 2], 'Source card must decode the real uploaded fixture');
    await card.getByText('DEP ₹1,00,000', { exact: true }).waitFor();
    await writeFile(new URL('../verification/web-catalog-card-metrics.json', import.meta.url), JSON.stringify(await card.evaluate(node => {
      const title = node.querySelector('h3'), style = getComputedStyle(title), canvas = document.createElement('canvas');
      const context = canvas.getContext('2d'); context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const wraps = [];
      for (const width of [270, 345]) {
        const probe = title.cloneNode(true);
        probe.style.cssText = `position:fixed;top:0;left:0;width:${width}px;margin:0;font-family:${style.fontFamily};font-size:${style.fontSize};line-height:${style.lineHeight};font-weight:${style.fontWeight};letter-spacing:${style.letterSpacing};text-transform:uppercase`;
        document.body.appendChild(probe);
        const text = probe.firstChild, groups = [];
        for (let i = 0; i < text.length; i++) {
          const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1);
          const y = range.getBoundingClientRect().top;
          if (!groups.length || Math.abs(groups.at(-1).y - y) > 1) groups.push({ y, text: '' });
          groups.at(-1).text += text.textContent[i];
        }
        wraps.push({ widthDp: width, lines: groups.map(line => line.text.trim().toUpperCase()) });
        probe.remove();
      }
      return { width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, titleWidth: title.getBoundingClientRect().width,
        titleMaxIntrinsicWidth: context.measureText(title.textContent.toUpperCase()).width, fontSize: style.fontSize, letterSpacing: style.letterSpacing, fontWeight: style.fontWeight, wraps };
    }), null, 2));
    assert.equal(await page.getByPlaceholder('Search projectors, cameras, fans…').inputValue(), title);
    await card.screenshot({ path: fileURLToPath(new URL('../verification/web-catalog-card.png', import.meta.url)) });
    const measurements = [];
    for (const width of [411, 1024]) {
      await page.setViewportSize({ width, height: 838 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-catalog-filtered-${width}.png`, import.meta.url)) });
      measurements.push(await page.locator('main').evaluate(main => ({
        width: innerWidth,
        elements: [...main.querySelectorAll('h1,select,input,button')].map(node => {
          const style = getComputedStyle(node);
          return { tag: node.tagName, text: node.tagName === 'SELECT' ? node.selectedOptions[0].textContent : node.textContent || node.placeholder,
            bounds: node.getBoundingClientRect().toJSON(), fontSize: style.fontSize, lineHeight: style.lineHeight };
        }),
      })));
    }
    await writeFile(new URL('../verification/web-catalog-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
  } catch (failure) {
    // Read rendered text only: HTML/input values can contain QA credentials.
    // Preserve diagnostics without extending deadlines or hiding the original failure.
    try {
      const redact = value => [password, email, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY]
        .filter(Boolean).reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), value);
      const text = redact(await page.locator('body').innerText()).slice(0, 3000);
      await writeFile(new URL('../verification/web-catalog-failure.json', import.meta.url),
        redact(JSON.stringify({ path: new URL(page.url()).pathname, network, text }, null, 2)));
      await page.screenshot({ path: fileURLToPath(new URL('../verification/web-catalog-failure.png', import.meta.url)) });
    } catch { console.log('Source catalog failure diagnostics unavailable'); }
    throw failure;
  } finally { await browser.close(); }
}
