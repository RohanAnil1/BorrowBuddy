// Opt-in development fixtures; only these generated actor IDs are ever removed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

assert.equal(process.env.BORROWBUDDY_ALLOW_TEST_FIXTURES, '1');
const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, server = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(base?.startsWith('https://') && anon && server);
const web = process.env.BORROWBUDDY_QA_WEB_URL || 'http://localhost:3016';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(join(process.env.NODE_MODULES_PATH, 'playwright')); }
const actors = [];
const password = `Qa!${randomUUID()}aA9`, run = randomUUID();
async function api(path, method = 'GET', body, token = server) {
  const response = await fetch(base + path, { method, headers: { apikey: token === server ? server : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  assert(response.ok, `${method} ${path.split('?')[0]} failed: ${response.status}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
async function actor(role) {
  const email = `android-qa-member-${role}-${run}@bennett.edu.in`;
  const user = await api('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  const current = { id: user.id, email }; actors.push(current);
  await api(`/rest/v1/profiles?id=eq.${user.id}`, 'PATCH', { full_name: role === 'admin' ? 'Aditi Rao' : 'Mira Sharma', department: 'Computer Science', year_of_study: 3, trust_score: 87.6, is_admin: role === 'admin', verification_status: 'verified' });
  const session = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, anon);
  current.token = session.access_token; return current;
}
let browser;
try {
  const student = await actor('student'), admin = await actor('admin');
  browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const results = [];
  for (const [role, user] of [['student', student], ['admin', admin]]) {
    const context = await browser.newContext({ viewport: { width: 411, height: 900 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(web + '/login');
    await page.locator('input[name="email"]').fill(user.email); await page.locator('input[name="password"]').fill(password);
    await page.locator('form button[type="submit"]').click(); await page.waitForURL('**/home', { timeout: 60_000 });
    await page.goto(web + '/me');
    const card = page.getByTestId('member-id-card'); await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-testid="member-id-card"]')?.getAttribute('data-renderer') === 'webgl', { timeout: 30_000 });
    await card.locator('[data-lanyard-settled="true"]').waitFor({ timeout: 30_000 });
    assert.equal(await card.getAttribute('data-role'), role);
    const canvas = card.locator('canvas'); assert.equal(await canvas.count(), 1);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await card.screenshot({ path: `apps/android/verification/member-card-web-${role}-411.png` });
    const before = await canvas.screenshot();
    const bounds = await canvas.boundingBox(); assert(bounds);
    // The lower center is the hanging card, leaving the empty canvas free to scroll.
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .57);
    await page.mouse.down();
    await card.locator('[data-lanyard-dragging="true"]').waitFor();
    await page.mouse.move(bounds.x + bounds.width * .72, bounds.y + bounds.height * .45, { steps: 12 }); await page.mouse.up();
    const after = await canvas.screenshot(); assert(!before.equals(after), 'The native WebGL card must visibly respond');
    await card.getByRole('button', { name: 'Show back of ID card' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="member-id-card"]')?.getAttribute('data-side') === 'back');
    await card.getByRole('button', { name: 'Show front of ID card' }).focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-testid="member-id-card"]')?.getAttribute('data-side') === 'front');
    await page.setViewportSize({ width: 1024, height: 900 }); await card.scrollIntoViewIfNeeded();
    await card.locator('[data-lanyard-settled="true"]').waitFor({ timeout: 30_000 });
    await card.screenshot({ path: `apps/android/verification/member-card-web-${role}-1024.png` });
    assert.equal(await page.locator('input[name="full_name"]').count(), 1, 'Existing profile form retained');
    await page.goto(`${web}/users/${role === 'student' ? admin.id : student.id}`);
    const publicCard = page.getByTestId('member-id-card'); await publicCard.scrollIntoViewIfNeeded();
    assert.equal(await publicCard.getAttribute('data-role'), role === 'student' ? 'admin' : 'student');
    const serialized = await page.content();
    assert(!serialized.includes(role === 'student' ? admin.email : student.email), 'Public card must not serialize the other member email');
    await page.waitForFunction(() => document.querySelector('[data-testid="member-id-card"]')?.getAttribute('data-renderer') === 'webgl', { timeout: 30_000 });
    await publicCard.locator('canvas').evaluate(canvas => {
      const context = canvas.getContext('webgl2');
      const extension = context?.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('Context-loss diagnostic unavailable');
      extension.loseContext();
    });
    await page.waitForFunction(() => document.querySelector('[data-testid="member-id-card"]')?.getAttribute('data-renderer') === 'static');
    await publicCard.locator('img').waitFor({ state: 'visible' });
    await publicCard.getByRole('button', { name: 'Show back of ID card' }).click();
    assert.equal(await publicCard.getAttribute('data-side'), 'back');
    assert.equal(errors.length, 0, 'No client runtime errors');
    results.push({ role, webgl: true, responsive: true, flipKeyboard: true, existingForm: true, publicCounterpart: true, contextLossFallback: true, clientErrors: errors.length });
    await context.close(); console.log(`PASS ${role} member card, real WebGL, drag, flip/keyboard, responsive profile and public counterpart`);
  }
  await writeFile('apps/android/verification/member-card-web-result.json', JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
} finally {
  await browser?.close();
  let failure;
  for (const user of actors) {
    try {
      if (user.token) await api('/auth/v1/logout?scope=global', 'POST', undefined, user.token);
      await api(`/rest/v1/audit_log?actor_id=eq.${user.id}`, 'DELETE');
      await api(`/auth/v1/admin/users/${user.id}`, 'DELETE');
    } catch (error) { failure = error; }
  }
  if (failure) throw failure;
  console.log('PASS targeted member-card fixture cleanup');
}
