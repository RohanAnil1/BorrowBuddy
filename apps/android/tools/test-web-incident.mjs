import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Actual website form + storage + Server Action; callers own isolated fixture cleanup. */
export async function testWebIncident({ baseUrl, email, password, loanId, png }) {
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 }, reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/login?next=${encodeURIComponent(`/loans/${loanId}`)}`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(`**/loans/${loanId}`, { timeout: 60_000 });
    await page.getByRole('button', { name: 'Report a problem', exact: true }).click();
    const form = page.locator('form').filter({ has: page.locator(`input[name="loan_id"][value="${loanId}"]`) });
    await form.getByRole('button', { name: /OTHER/i }).click();
    await form.getByRole('button', { name: /^NEXT/i }).click();
    await form.locator('input[type="file"]').setInputFiles([
      { name: 'synthetic-evidence-a.png', mimeType: 'image/png', buffer: png },
      { name: 'synthetic-evidence-b.png', mimeType: 'image/png', buffer: png },
    ]);
    await page.waitForFunction(() => {
      const field = document.querySelector('input[name="photo_paths"]');
      return field && JSON.parse(field.value).length === 2;
    }, null, { timeout: 30_000 });
    await form.getByRole('button', { name: /^NEXT/i }).click();
    await form.locator('textarea[name="description"]').waitFor({ state: 'visible' });
    assert.equal(await form.locator('input[type="file"]').count(), 0, 'Evidence step must really have unmounted');
    const paths = JSON.parse(await form.locator('input[name="photo_paths"]').inputValue());
    assert.equal(paths.length, 2, 'Final form must retain both uploaded evidence paths');
    await form.getByRole('button', { name: /BACK/i }).click();
    await form.locator('input[type="file"]').waitFor({ state: 'attached' });
    assert.deepEqual(JSON.parse(await form.locator('input[name="evidence_preview_paths"]').inputValue()), paths,
      'Returning to evidence must restore the actual uploader paths');
    await form.getByRole('button', { name: /^NEXT/i }).click();
    const description = 'Synthetic website incident: evidence persists across step changes.';
    await form.locator('textarea[name="description"]').fill(description);
    await form.getByRole('button', { name: /FILE THE REPORT/i }).click();
    await page.getByText('[ REPORT FILED ]', { exact: true }).waitFor({ timeout: 30_000 });
    await page.screenshot({ path: fileURLToPath(new URL('../verification/web-incident-filed.png', import.meta.url)), fullPage: true });
    return { description, paths };
  } finally { await browser.close(); }
}
