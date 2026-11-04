import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const widths = [411, 640, 1024];
const require = createRequire(import.meta.url);
function runtime() {
  try { return require('playwright'); }
  catch { return require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
}
async function ready(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    let node = document.querySelector('main');
    if (!node) return false;
    while (node) { if (+getComputedStyle(node).opacity < .999) return false; node = node.parentElement; }
    return true;
  });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
}
async function login(page, baseUrl, email, password) {
  await page.bringToFront();
  await page.goto(`${baseUrl}/login?next=%2Fhome`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/home', { timeout: 60_000 });
}
async function logout(page, baseUrl) {
  await page.goto(`${baseUrl}/me`);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(url => url.origin === new URL(baseUrl).origin && url.pathname === '/');
}
async function measure(page, kind, width) {
  return page.locator('main').evaluate((main, { kind, width }) => {
    const info = node => {
      if (!node) return null;
      const s = getComputedStyle(node);
      return { bounds: node.getBoundingClientRect().toJSON(), font: s.fontFamily, size: s.fontSize,
        transform: s.textTransform, whiteSpace: s.whiteSpace, lineHeight: s.lineHeight, tracking: s.letterSpacing, color: s.color, background: s.backgroundColor,
        padding: s.padding, gap: s.gap, border: s.borderWidth, radius: s.borderRadius };
    };
    const heading = main.querySelector('h1');
    const root = heading.closest('div[class*="max-w-3xl"]');
    const rows = [...main.querySelectorAll('ol > li > a')];
    const messages = [...main.querySelectorAll('div[class*="max-w-[85%]"]')];
    return { kind, width, root: info(root), heading: info(heading),
      intro: info(heading.nextElementSibling),
      empty: info(main.querySelector('h2')?.parentElement), emptyTitle: info(main.querySelector('h2')),
      emptyBody: info(main.querySelector('h2')?.nextElementSibling),
      rows: rows.map(row => ({ panel: info(row), title: info(row.querySelector('p')), subtitle: info(row.querySelectorAll('p')[1]),
        preview: info(row.querySelectorAll('p')[2]), time: info(row.lastElementChild), unread: row.className.includes('border-accent/60') })),
      header: kind.includes('thread') ? info(root.firstElementChild) : null,
      back: info(main.querySelector('a[aria-label="Back to chats"]')),
      trust: info(main.querySelector('a[href^="/users/"]')),
      pinned: info(root.querySelector('a[href^="/loans/"]')),
      textarea: info(main.querySelector('textarea')), send: info(main.querySelector('textarea')?.nextElementSibling),
      composer: info(main.querySelector('textarea')?.parentElement.parentElement),
      messages: messages.slice(0, 6).map(row => ({ mine: row.className.includes('self-end'), row: info(row),
        bubble: info(row.querySelector('div')), sender: info(row.querySelector('span')), time: info(row.lastElementChild) })),
      emptyMessage: info(main.querySelector('p[class*="py-16"]')) };
  }, { kind, width });
}
export async function testWebChatEmptyList({ baseUrl, email, password }) {
  const browser = await runtime().chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    await login(page, baseUrl, email, password);
    await page.goto(`${baseUrl}/chat`); await ready(page);
    const empty = await page.getByRole('heading', { name: 'No conversations yet', exact: true }).count();
    // Existing community rooms belong to the user; never hide/delete them for a test.
    if (!empty) {
      await logout(page, baseUrl);
      return { measured: false, reason: 'Existing community rooms prevent an actual empty list.' };
    }
    const measurements = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 838 }); await ready(page);
      measurements.push(await measure(page, 'empty-list', width));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-chat-empty-list-${width}.png`, import.meta.url)), fullPage: true });
    }
    await writeFile(new URL('../verification/web-chat-empty-list-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
    await logout(page, baseUrl);
    return { measured: true };
  } finally { await browser.close(); }
}
export async function testWebChat({ baseUrl, email, outsiderEmail, password, privateId, communityId, emptyId }) {
  const browser = await runtime().chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    await login(page, baseUrl, email, password);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 838 });
      await page.goto(`${baseUrl}/chat`); await ready(page);
      await page.locator(`a[href="/chat/${privateId}"]`).waitFor();
      results.push(await measure(page, 'list', width));
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-chat-list-${width}.png`, import.meta.url)), fullPage: true });
      await page.goto(`${baseUrl}/chat/${privateId}`); await ready(page);
      await page.getByRole('link', { name: 'Back to chats', exact: true }).waitFor();
      await page.evaluate(() => scrollTo(0, 0));
      const row = await measure(page, 'private-thread', width);
      assert(row.messages.some(message => message.mine) && row.messages.some(message => !message.mine));
      assert(row.pinned && row.trust && row.textarea && row.send);
      assert(row.messages.every(message => message.bubble.transform === 'uppercase' && message.bubble.whiteSpace === 'normal'));
      assert.equal(row.textarea.transform, 'none');
      results.push(row);
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-chat-private-header-${width}.png`, import.meta.url)) });
      await page.locator('textarea').scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-chat-private-tail-${width}.png`, import.meta.url)) });
    }
    await logout(page, baseUrl);
    await login(page, baseUrl, outsiderEmail, password);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 838 });
      for (const [id, kind] of [[communityId, 'community-thread'], [emptyId, 'empty-thread']]) {
        await page.goto(`${baseUrl}/chat/${id}`); await ready(page);
        await page.evaluate(() => scrollTo(0, 0));
        const row = await measure(page, kind, width);
        assert(row.textarea && row.send && !row.pinned && !row.trust);
        if (kind === 'empty-thread') assert(row.emptyMessage && row.messages.length === 0);
        results.push(row);
        await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-chat-${kind}-${width}.png`, import.meta.url)) });
      }
    }
    await logout(page, baseUrl);
    await writeFile(new URL('../verification/web-chat-measurements.json', import.meta.url), JSON.stringify(results, null, 2));
    return results;
  } catch (failure) {
    // Write only computed metrics, never cookies, page HTML or input values.
    await writeFile(new URL('../verification/web-chat-partial-measurements.json', import.meta.url), JSON.stringify(results, null, 2));
    throw failure;
  } finally { await browser.close(); }
}
