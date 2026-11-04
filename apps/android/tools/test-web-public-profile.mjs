import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebPublicProfile({ baseUrl, email, adminEmail, password, studentId, emptyId, newestItemId, excludedItemId, studentEmail }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); } catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const measurements = [], errors = [], navigation = [];
  let activePage;
  try {
    let page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    function watch(target, actor) {
      target.on('framenavigated', frame => { if (frame === target.mainFrame()) navigation.push({ actor, path: new URL(frame.url()).pathname }); });
    }
    watch(page, 'student');
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(email); await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click(); await page.waitForURL('**/home', { timeout: 60_000 });
    const studentPage = page;
    await page.goto(`${baseUrl}/users/${emptyId}`);
    // Next streams its not-found boundary with HTTP 200 after headers are sent.
    // Assert the rendered denial, rather than treating that status as disclosure.
    await page.locator('meta[name="robots"][content="noindex"]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('main [data-testid="member-id-card"]').count(), 0, 'Ordinary students cannot read unverified profiles');
    const adminPage = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    watch(adminPage, 'admin');
    adminPage.on('pageerror', error => errors.push(error.message));
    await adminPage.goto(`${baseUrl}/login?next=%2Fhome`);
    await adminPage.locator('input[name="email"]').fill(adminEmail); await adminPage.locator('input[name="password"]').fill(password);
    await adminPage.locator('form button[type="submit"]').click(); await adminPage.waitForURL('**/home', { timeout: 60_000 });
    async function visit(id, name, width) {
      activePage = page; await page.bringToFront();
      await page.setViewportSize({ width, height: 838 }); await page.goto(`${baseUrl}/users/${id}`);
      await page.locator('main h1').waitFor(); await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        let node = document.querySelector('main');
        while (node) { if (Number(getComputedStyle(node).opacity) < .999) return false; node = node.parentElement; }
        return true;
      });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      const result = await page.evaluate(() => {
        const bounds = node => node?.getBoundingClientRect().toJSON();
        const style = node => { const css = getComputedStyle(node); return { font: css.fontFamily, size: css.fontSize, lineHeight: css.lineHeight, padding: css.padding, gap: css.gap, display: css.display }; };
        const title = document.querySelector('main h1'), panel = title.closest('section'), root = panel.parentElement;
        const sections = [...root.querySelectorAll(':scope > section')];
        const reputation = sections.find(node => node.querySelector('h2')?.textContent?.includes('REPUTATION'));
        const reviews = [...root.querySelectorAll('article')], listings = [...root.querySelectorAll('a[href^="/items/"]')];
        return { viewport: innerWidth, root: bounds(root), identity: { bounds: bounds(panel), ...style(panel) },
          heading: { bounds: bounds(title), ...style(title) },
          initial: { bounds: bounds(panel.querySelector(':scope > div > span')), ...style(panel.querySelector(':scope > div > span')) },
          identityText: panel.innerText, stats: { bounds: bounds(panel.lastElementChild), ...style(panel.lastElementChild) },
          reputation: { bounds: bounds(reputation), heading: bounds(reputation.firstElementChild), text: reputation.firstElementChild.innerText },
          reviews: reviews.map(node => ({ bounds: bounds(node), ...style(node), text: node.innerText,
            comment: node.querySelector('.type-body') ? { bounds: bounds(node.querySelector('.type-body')), ...style(node.querySelector('.type-body')) } : null,
            stars: [...node.querySelectorAll('svg')].map(star => ({ bounds: bounds(star), fill: getComputedStyle(star).fill })) })),
          listings: listings.map(node => ({ href: node.getAttribute('href'), bounds: bounds(node) })),
          memberCard: bounds(root.querySelector('[data-testid="member-id-card"]')) };
      });
      result.state = name; measurements.push(result);
      await writeFile(new URL('../verification/web-profile-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
      assert(!await page.locator('main').innerText().then(text => text.includes(studentEmail)), 'Public profile must not display the other student email');
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-profile-${name}-identity-${width}.png`, import.meta.url)) });
      return result;
    }
    for (const width of [411, 640, 1024]) {
      page = studentPage;
      const measured = await visit(studentId, 'populated', width);
      assert.equal(measured.reviews.length, 20); assert.equal(measured.listings.length, 12);
      assert.match(measured.reputation.text, /3\.9 FROM 21 REVIEWS/i);
      assert.match(measured.identityText, /88/); assert.match(measured.identityText, /VERIFIED STUDENT/i);
      assert.equal(measured.listings[0].href, `/items/${newestItemId}`);
      assert(!measured.listings.some(row => row.href === `/items/${excludedItemId}`));
      assert.equal(measured.reviews.filter(row => row.comment === null).length, 2);
      assert.match(measured.reviews[0].text, /LENT TO THEM/i);
      assert.match(measured.reviews[1].text, /BORROWED FROM THEM/i);
      assert(measured.memberCard.height > 500, 'Existing membership card remains in the source flow');
      assert.equal(parseFloat(measured.heading.size), Math.max(40, Math.min(64, width * .06)));
      assert.equal(measured.reviews[0].stars.length, 5);
      await page.getByRole('heading', { name: '[ REPUTATION ]', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-profile-populated-reviews-${width}.png`, import.meta.url)) });
      await page.locator(`main a[href="/items/${newestItemId}"]`).scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-profile-populated-listings-${width}.png`, import.meta.url)) });
      await Promise.all([page.waitForURL(`**/items/${newestItemId}`), page.locator(`main a[href="/items/${newestItemId}"]`).click()]);
      await page.goBack(); await page.waitForURL(`**/users/${studentId}`);
      page = adminPage;
      const empty = await visit(emptyId, 'empty', width);
      assert.equal(empty.reviews.length, 0); assert.equal(empty.listings.length, 0);
      assert.match(empty.identityText, /UNNAMED STUDENT/i); assert.match(empty.identityText, /BENNETT UNIVERSITY/i);
      assert(!/YEAR|VERIFIED STUDENT/i.test(empty.identityText));
      await page.getByText('NO REVIEWS YET. REPUTATION BUILDS AFTER COMPLETED LOANS.', { exact: true }).scrollIntoViewIfNeeded();
      await page.getByRole('heading', { name: 'No active listings', exact: true }).waitFor();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-profile-empty-sections-${width}.png`, import.meta.url)) });
    }
    assert.equal(errors.length, 0, 'Public profile must have no client runtime errors');
    await writeFile(new URL('../verification/web-profile-measurements.json', import.meta.url), JSON.stringify(measurements, null, 2));
    return measurements;
  } catch (failure) {
    await writeFile(new URL('../verification/web-profile-navigation-failure.json', import.meta.url), JSON.stringify(navigation, null, 2));
    if (activePage) await activePage.screenshot({ path: fileURLToPath(new URL('../verification/web-profile-failure.png', import.meta.url)) }).catch(() => {});
    throw failure;
  } finally { await browser.close(); }
}
