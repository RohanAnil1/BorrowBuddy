import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
async function openBrowser() {
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  return playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
}

async function login(page, baseUrl, email, password) {
  await page.goto(baseUrl + '/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/home', { timeout: 60_000 });
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ caret: 'initial', path: fileURLToPath(new URL('../verification/' + name + '.png', import.meta.url)) });
}

export async function testWebChatEmptyList({ baseUrl, email, password }) {
  const browser = await openBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 838 } });
    await login(page, baseUrl, email, password);
    await page.goto(baseUrl + '/chat');
    await page.getByRole('searchbox', { name: 'Search conversations' }).waitFor();
    const empty = await page.getByText('No conversations yet', { exact: true }).count();
    if (!empty) return { measured: false, reason: 'Existing community channels are visible to the verified account.' };
    await capture(page, 'web-chat-empty-list-411');
    return { measured: true };
  } finally { await browser.close(); }
}

export async function testWebChat({ baseUrl, email, outsiderEmail, password, privateId, communityId, emptyId, phoneWidth = 411 }) {
  const browser = await openBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: phoneWidth, height: 838 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    await login(page, baseUrl, email, password);
    const privateLink = page.locator('a[href="/chat/' + privateId + '"]');
    const communityLink = page.locator('a[href="/chat/' + communityId + '"]');
    const search = page.getByRole('searchbox', { name: 'Search conversations' });
    for (const width of new Set([phoneWidth, 640, 1024])) {
      await page.setViewportSize({ width, height: 838 });
      await page.goto(baseUrl + '/chat');
      await privateLink.waitFor();
      await page.getByRole('button', { name: 'Public', exact: true }).click();
      await communityLink.waitFor();
      assert.equal(await privateLink.count(), 0);
      await page.getByRole('button', { name: 'Private', exact: true }).click();
      await privateLink.waitFor();
      assert.equal(await communityLink.count(), 0);
      await search.fill('no conversation matches this');
      await page.getByText('No matching conversations', { exact: true }).waitFor();
      await search.fill('');
      await page.getByRole('button', { name: 'Unread', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Unread', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'All', exact: true }).click();
      await capture(page, 'web-chat-list-' + width);
      await privateLink.click();
      await page.getByRole('link', { name: 'Back to chats' }).waitFor();
      await page.getByText('Private loan channel', { exact: true }).waitFor();
      assert(await page.locator('.chat-loan-link').isVisible());
      assert.equal(await page.locator('.chat-sidebar').isVisible(), width >= 928);
      const composer = page.getByRole('textbox', { name: 'Write a message' });
      await page.getByRole('button', { name: 'Plan pickup', exact: true }).click();
      assert.equal(await composer.inputValue(), 'When and where works for pickup?');
      await composer.fill('Unsent Website Draft\nSecond line');
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.chat-compose-row textarea').value === 'Unsent Website Draft\nSecond line');
      await composer.fill('');
      await page.getByRole('button', { name: 'Find messages' }).click();
      const threadSearch = page.getByRole('searchbox', { name: 'Search loaded messages' });
      await threadSearch.fill('Android QA pickup coordination');
      await page.getByText('1 match in loaded messages', { exact: true }).waitFor();
      const bubble = page.locator('.chat-message').filter({ hasText: 'Android QA pickup coordination' });
      assert.equal(await bubble.locator('.chat-bubble').innerText(), 'Android QA pickup coordination');
      await bubble.getByRole('button', { name: 'Copy message' }).click();
      await bubble.getByRole('button', { name: 'Copied' }).waitFor();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Android QA pickup coordination');
      await threadSearch.fill('Native history');
      const before = await page.locator('.chat-message').count();
      await page.getByRole('button', { name: 'Load older messages' }).click();
      await page.waitForFunction(count => document.querySelectorAll('.chat-message').length > count, before);
      await page.getByRole('button', { name: 'Close message search' }).click();
      await page.locator('.chat-history').evaluate(node => { node.scrollTop = 0; });
      await page.getByRole('button', { name: 'Latest messages' }).click();
      assert(await page.locator('.chat-history').evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop < 10));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture(page, 'web-chat-private-' + width);
    }

    const outsider = await browser.newPage({ viewport: { width: phoneWidth, height: 838 }, reducedMotion: 'reduce' });
    await login(outsider, baseUrl, outsiderEmail, password);
    await outsider.goto(baseUrl + '/chat/' + privateId);
    await outsider.getByText('This page could not be found.', { exact: true }).waitFor();
    await outsider.goto(baseUrl + '/chat/' + emptyId);
    await outsider.getByTestId('chat-empty-thread').waitFor();
    await outsider.goto(baseUrl + '/chat/' + communityId);
    await outsider.getByText('Community channel', { exact: true }).waitFor();
    assert.equal(await outsider.getByRole('button', { name: 'Plan pickup' }).count(), 0);
    await capture(outsider, 'web-chat-public-' + phoneWidth);
  } finally { await browser.close(); }
}

export async function testWebChatSending({ baseUrl, email, outsiderEmail, password, privateId, communityId }) {
  const browser = await openBrowser();
  try {
    const page = await browser.newPage();
    await login(page, baseUrl, email, password);
    const outsider = await browser.newPage();
    await login(outsider, baseUrl, outsiderEmail, password);
    await outsider.goto(baseUrl + '/chat/' + communityId);
    for (const [id, body] of [[privateId, 'Website QA private message\nSecond line'], [communityId, 'Website QA public message']]) {
      await page.goto(baseUrl + '/chat/' + id);
      await page.getByRole('textbox', { name: 'Write a message' }).fill(body);
      await page.getByRole('button', { name: 'Send message' }).click();
      await page.locator('.chat-bubble').filter({ hasText: body.split('\n')[0] }).waitFor();
    }
    await outsider.locator('.chat-bubble').filter({ hasText: 'Website QA public message' }).waitFor();
  } finally { await browser.close(); }
}
