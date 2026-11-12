import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function testWebAdmin({ baseUrl, email, password, state, pendingId, incidentId, fineId, pinId, phoneWidth = 411 }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); } catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 411, height: 838 }, reducedMotion: 'reduce' });
    await page.bringToFront(); await page.goto(`${baseUrl}/login?next=%2Fhome`);
    await page.locator('input[name="email"]').fill(email); await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click(); await page.waitForURL('**/home', { timeout: 60_000 });
    for (const width of new Set([phoneWidth, 640, 1024])) {
      await page.setViewportSize({ width, height: 838 }); await page.goto(`${baseUrl}/admin`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        let node = document.querySelector('main'); if (!node) return false;
        while (node) { if (+getComputedStyle(node).opacity < .999) return false; node = node.parentElement; } return true;
      });
      await page.waitForFunction(() => [...document.querySelectorAll('main img[alt="Incident evidence"]')].every(image => image.complete && image.naturalWidth > 0));
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      const row = await page.locator('main').evaluate((main, args) => {
        const info = node => {
          if (!node) return null;
          const s = getComputedStyle(node);
          return { bounds: node.getBoundingClientRect().toJSON(), font: s.fontFamily, size: s.fontSize,
            lineHeight: s.lineHeight, tracking: s.letterSpacing, transform: s.textTransform,
            padding: s.padding, gap: s.gap, background: s.backgroundColor, color: s.color, radius: s.borderRadius, border: s.borderWidth };
        };
        const article = (key, id) => main.querySelector(`input[name="${key}"][value="${id}"]`)?.closest('article');
        const verification = article('profile_id', args.pendingId);
        const incident = article('incident_id', args.incidentId);
        const fine = article('fine_id', args.fineId);
        const pinDetails = [...main.querySelectorAll('details')].find(details => details.querySelector('input[name="id"]')?.value === args.pinId) || main.querySelector('details');
        return { state: args.state, width: args.width, root: info(main.querySelector('h1').parentElement), heading: info(main.querySelector('h1')),
          sections: [...main.querySelectorAll('section')].map(section => { const emptyTitle = section.querySelector('h2')?.nextElementSibling?.querySelector('h2'); return { heading: info(section.querySelector('h2')), count: Number(section.querySelector('h2 > span')?.textContent || 0), intro: info(section.querySelector('h2')?.nextElementSibling), panel: info(section.querySelector('article') || section.querySelector('h2')?.nextElementSibling?.firstElementChild), emptyTitle: info(emptyTitle), emptyBody: info(emptyTitle?.nextElementSibling) }; }),
          verification: info(verification), identity: info(verification?.firstElementChild?.firstElementChild), name: info(verification?.querySelector('p')), email: info(verification?.querySelectorAll('p')[1]), signup: info(verification?.querySelectorAll('p')[3]),
          idButton: info(verification?.querySelector('a')), approve: info(verification?.querySelector('button')), reject: info(verification?.querySelectorAll('button')[1]), reason: info(verification?.querySelector('input[name="note"]')),
          incident: info(incident), incidentTitle: info(incident?.querySelector('p')), incidentBody: info(incident?.querySelectorAll('p')[1]), photo: info(incident?.querySelector('img')), incidentForm: info(incident?.querySelector('form')),
          decision: info(incident?.querySelector('select[name="decision"]')), resolution: info(incident?.querySelector('input[name="resolution_note"]')), fineAmount: info(incident?.querySelector('input[name="fine_amount"]')), fineUser: info(incident?.querySelector('select[name="fine_user_id"]')),
          fine: info(fine), fineTitle: info(fine?.querySelector('p')), fineReason: info(fine?.querySelectorAll('p')[1]), fineTime: info(fine?.querySelectorAll('p')[2]), fineButton: info(fine?.querySelector('button')),
          pin: info(pinDetails?.parentElement), pinHeader: info(pinDetails?.previousElementSibling), pinPreview: info(pinDetails?.parentElement.querySelector('span[title]')), summary: info(pinDetails?.querySelector('summary')),
          footer: info(main.querySelector('section:last-of-type')?.nextElementSibling) };
      }, { state, width, pendingId, incidentId, fineId, pinId });
      if (state === 'populated') { assert(row.verification && row.incident && row.fine && row.photo && row.idButton); assert.equal(row.sections[1].count, 30); }
      results.push(row);
      const sections = page.locator('main section');
      for (let index = 0; index < 4; index++) {
        await sections.nth(index).locator(':scope > h2').scrollIntoViewIfNeeded();
        await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-admin-${state}-${index}-${width}.png`, import.meta.url)) });
      }
      const details = pinId ? page.locator(`main details:has(input[name="id"][value="${pinId}"])`) : page.locator('main details').first();
      await details.locator('summary').click();
      row.pinForm = await details.locator('[data-pin-form]').evaluate(form => {
        const s = getComputedStyle(form); const map = form.querySelector('[role="application"]');
        return { gap: s.gap, map: map.getBoundingClientRect().toJSON(), fields: [...form.querySelectorAll('input:not([type="hidden"]),select')].map(input => ({ name: input.name, bounds: input.getBoundingClientRect().toJSON(), size: getComputedStyle(input).fontSize, lineHeight: getComputedStyle(input).lineHeight })) };
      });
      await details.locator('img').first().waitFor({ state: 'visible' });
      await page.waitForFunction(() => { const image = document.querySelector('main details[open] img'); return image?.complete && image.naturalWidth > 0; });
      await details.scrollIntoViewIfNeeded();
      await page.screenshot({ path: fileURLToPath(new URL(`../verification/web-admin-pin-editor-${state}-${width}.png`, import.meta.url)) });
    }
    await page.goto(`${baseUrl}/me`); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/');
    await writeFile(new URL(`../verification/web-admin-${state}-measurements.json`, import.meta.url), JSON.stringify(results, null, 2));
    return results;
  } finally { await browser.close(); }
}
