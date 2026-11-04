import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(process.env.NODE_MODULES_PATH, 'playwright')); }
const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
try {
  const page = await browser.newPage({ viewport: { width: 411, height: 866 }, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(process.env.WEB_URL ?? 'http://localhost:3000', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const wall = page.locator('[data-wall-section]');
  await wall.scrollIntoViewIfNeeded();
  await page.getByTestId('wall-next').click(); await page.getByTestId('wall-next').click();
  await page.waitForTimeout(600);
  const output = path.join(process.cwd(), 'apps/android/verification/tag-wall-website-mobile.png');
  await wall.screenshot({ path: output, animations: 'disabled' });
  console.log(JSON.stringify(await wall.boundingBox()));
} finally { await browser.close(); }
