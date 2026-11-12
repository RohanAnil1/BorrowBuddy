import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebAccountLedger({ baseUrl, email, emptyEmail, password }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const measurements = [];
  const browserDiagnostics = new WeakMap();
  function watch(page) {
    const events = []; browserDiagnostics.set(page, events);
    page.on('pageerror', failure => events.push({ error: failure.message.replace(/eyJ[A-Za-z0-9._-]+/g, '[TOKEN REDACTED]').slice(0, 500) }));
    page.on('response', response => { if (response.status() >= 400) events.push({ status: response.status(), path: new URL(response.url()).pathname }); });
    page.on('requestfailed', request => events.push({ failedPath: new URL(request.url()).pathname, reason: request.failure()?.errorText }));
  }
  async function login(page, address) {
    await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(address);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/home', { timeout: 60_000 });
  }
  async function settle(page) {
    await page.evaluate(() => document.fonts.ready);
    try {
      await page.waitForFunction(() => {
        let node = document.querySelector('main');
        while (node) { if (Number(getComputedStyle(node).opacity) < .999) return false; node = node.parentElement; }
        return true;
      });
    } catch (failure) {
      const state = await page.evaluate(() => {
        const chain = []; let node = document.querySelector('main');
        while (node) { const css = getComputedStyle(node); chain.push({ tag: node.tagName, classes: node.className, opacity: css.opacity, visibility: css.visibility, transform: css.transform }); node = node.parentElement; }
        return { path: location.pathname, visible: document.visibilityState, focused: document.hasFocus(), ready: document.readyState, chain,
          animations: document.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime })) };
      });
      state.browserEvents = browserDiagnostics.get(page);
      await writeFile(new URL('../verification/account-ledger-source-visibility-failure.json', import.meta.url), JSON.stringify(state, null, 2));
      await page.screenshot({ path: fileURLToPath(new URL('../verification/account-ledger-source-visibility-failure.png', import.meta.url)) });
      throw failure;
    }
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  }
  async function capture(page, route, name, width) {
    await page.setViewportSize({ width, height: 838 });
    await page.goto(`${baseUrl}/${route}`); await page.locator('main h1').waitFor(); await settle(page);
    const measured = await page.evaluate(() => {
      const root = document.querySelector('main h1').parentElement;
      const bounds = node => node?.getBoundingClientRect().toJSON();
      const style = node => { const css = getComputedStyle(node); return { font: css.fontFamily, size: css.fontSize, lineHeight: css.lineHeight, padding: css.padding }; };
      return { viewport: innerWidth, root: bounds(root), heading: { ...style(root.querySelector('h1')), bounds: bounds(root.querySelector('h1')) },
        cards: [...root.querySelectorAll('article')].map(node => ({ bounds: bounds(node), style: style(node) })),
        links: [...root.querySelectorAll('a')].filter(node => ['/fines', '/map'].includes(node.getAttribute('href'))).map(node => ({ route: node.getAttribute('href'), bounds: bounds(node) })),
        name: bounds(root.querySelector('input[name="full_name"]')), phone: bounds(root.querySelector('input[name="phone"]')),
        bodyStyles: [...root.querySelectorAll('.type-body')].slice(0, 4).map(style),
        yearOptions: [...root.querySelectorAll('select[name="year_of_study"] option')].map(node => node.value) };
    });
    measurements.push({ route, ...measured });
    if (route === 'fines') assert.equal(measured.cards.length, 54);
    else {
      assert.equal(measured.links.length, 2);
      if (width >= 640) assert.equal(measured.links[0].bounds.y, measured.links[1].bounds.y);
      assert.deepEqual(measured.yearOptions, ['1', '2', '3', '4', '5']);
    }
    await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-account-ledger-${name}-${width}.png`, import.meta.url)) });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    watch(page);
    await login(page, email);
    for (const width of [411, 1024]) {
      await capture(page, 'me', 'account', width);
      await page.getByText('Trust score 71', { exact: true }).waitFor();
      await capture(page, 'fines', 'ledger', width);
      await page.getByText('₹520', { exact: true }).waitFor();
      assert.equal(await page.locator('main article').count(), 54);
    }
    const empty = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    watch(empty);
    await login(empty, emptyEmail); await empty.goto(`${baseUrl}/fines`); await empty.locator('main h1').waitFor(); await settle(empty);
    assert.equal(await empty.locator('main article').count(), 0);
    await empty.getByRole('heading', { name: /No fines on record/i }).waitFor();
    await empty.getByText('₹0', { exact: true }).waitFor();
    await empty.screenshot({ path: fileURLToPath(new URL('../verification/web-account-ledger-empty-411.png', import.meta.url)) });
    await writeFile(new URL('../verification/web-account-ledger-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
    return measurements;
  } finally { await browser.close(); }
}
