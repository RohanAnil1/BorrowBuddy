import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(join(process.env.NODE_MODULES_PATH, 'playwright'));
const plan = JSON.parse(await readFile(new URL('prepared.json', import.meta.url), 'utf8'));
const receipt = JSON.parse(await readFile(new URL('published.json', import.meta.url), 'utf8'));
assert(receipt.published && receipt.productCount === 20);
const base = process.env.BORROWBUDDY_QA_WEB_URL;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
const results = { products: 20, hostedImages: receipt.imageCount, decodedHostedImages: 0, catalogWidths: [], details: [], signedOut: false };
try {
  const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
  await page.goto(`${base}/login?next=%2Fhome`);
  await page.locator('input[name="email"]').fill(process.env.BORROWBUDDY_DEMO_EMAIL);
  await page.locator('input[name="password"]').fill(process.env.BORROWBUDDY_DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/home', { timeout: 60_000 });
  results.decodedHostedImages = await page.evaluate(async paths => {
    for (const path of paths) {
      const image = new Image();
      image.src = `https://oijteuxelpwziplqwkvi.supabase.co/storage/v1/object/public/item-images/${path}`;
      await image.decode();
      if (image.naturalWidth < 64 || image.naturalHeight < 64) throw new Error('Demo gallery image is too small');
    }
    return paths.length;
  }, receipt.imagePaths);
  assert.equal(results.decodedHostedImages, 39);
  for (const width of [411, 1024]) {
    await page.setViewportSize({ width, height: 838 });
    await page.goto(`${base}/home?q=demo+inventory`);
    for (const product of plan.products) {
      const card = page.locator(`a[href="/items/${product.id}"]`).first();
      await card.waitFor();
      // The existing website deliberately lazy-loads offscreen product photos.
      await card.scrollIntoViewIfNeeded();
      await card.locator('img').first().evaluate(image => image.decode());
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.querySelectorAll('main a[href^="/items/"] img')].length >= 20 &&
      [...document.querySelectorAll('main a[href^="/items/"] img')].every(image => image.complete && image.naturalWidth > 0));
    await page.waitForFunction(() => {
      let node = document.querySelector('main');
      while (node) { if (+getComputedStyle(node).opacity < .999) return false; node = node.parentElement; }
      return true;
    });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    const found = await page.locator('main a[href^="/items/"]').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('href')))]);
    assert.equal(found.length, 20, 'Demo search should return all twenty listings');
    results.catalogWidths.push(width);
    await page.screenshot({ path: fileURLToPath(new URL(`website-catalog-${width}.png`, import.meta.url)), fullPage: true });
  }
  for (const product of plan.products) {
    await page.goto(`${base}/items/${product.id}`);
    await page.getByRole('heading', { level: 1, name: product.title, exact: true }).waitFor();
    const text = (await page.locator('main').innerText()).toUpperCase();
    assert(text.includes('DEMO INVENTORY') && text.includes(product.pickup.toUpperCase()));
    await page.waitForFunction(() => [...document.querySelectorAll('main img')].some(image => image.complete && image.naturalWidth > 0));
    results.details.push({ id: product.id, title: product.title, imageLoaded: true, demoDescription: true, pickupVisible: true });
  }
  await page.goto(`${base}/me`);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(url => url.origin === new URL(base).origin && url.pathname === '/', { timeout: 60_000 });
  results.signedOut = true;
  await writeFile(new URL('website-verification.json', import.meta.url), JSON.stringify(results, null, 2));
  console.log('PASS normal non-admin login, all 20 demo cards/images at phone/tablet sizes, all 20 detail pages, pickup/descriptions and sign-out.');
} finally { await browser.close(); }
