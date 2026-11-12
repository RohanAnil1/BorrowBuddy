// Opt-in hosted development test for the Buddy assistant. Creates one verified
// QA student and one fixture item, drives the real UI with Playwright, then
// removes both by exact ID and confirms existing inventory is unchanged.
//
// BORROWBUDDY_ALLOW_TEST_FIXTURES=1 SUPABASE_URL=… SUPABASE_ANON_KEY=… \
// SUPABASE_SERVICE_ROLE_KEY=… BORROWBUDDY_QA_WEB_URL=http://localhost:3000 \
// NODE_MODULES_PATH=… [CHROMIUM_EXECUTABLE=…] node apps/web/tools/test-assistant.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

assert.equal(process.env.BORROWBUDDY_ALLOW_TEST_FIXTURES, '1');
const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, server = process.env.SUPABASE_SERVICE_ROLE_KEY;
const web = process.env.BORROWBUDDY_QA_WEB_URL;
assert(base?.startsWith('https://') && anon && server && web);

const run = randomUUID().slice(0, 8), password = `Qa!${randomUUID()}aA9`, actors = [], items = [], checks = [];
const out = 'apps/web/verification';
await mkdir(out, { recursive: true });
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };
let browser, failure, baseline;

async function api(token, path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: { apikey: token === server ? server : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text(); const data = text ? JSON.parse(text) : null;
  assert(response.ok, `${method} ${path.split('?')[0]}: ${response.status} ${data?.message ?? ''}`);
  return data;
}
const snapshot = () => Promise.all(['profiles?select=id', 'items?select=id,status'].map((p) => api(server, `/rest/v1/${p}&order=id`)));

try {
  baseline = await snapshot();

  // Logged-out callers get a JSON 401, not a login redirect.
  const anonymous = await fetch(`${web}/api/assistant`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }), redirect: 'manual' });
  assert.equal(anonymous.status, 401);
  pass('logged-out API request is rejected with 401');

  const email = `buddy-qa-${run}@bennett.edu.in`;
  const user = await api(server, '/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  actors.push(user.id);
  await api(server, `/rest/v1/profiles?id=eq.${user.id}`, 'PATCH', { full_name: 'Buddy Tester', department: 'Computer Science', year_of_study: 2, verification_status: 'verified' });

  // A second student lends a uniquely named item so search has a known answer.
  const lenderEmail = `buddy-qa-lender-${run}@bennett.edu.in`;
  const lender = await api(server, '/auth/v1/admin/users', 'POST', { email: lenderEmail, password, email_confirm: true });
  actors.push(lender.id);
  await api(server, `/rest/v1/profiles?id=eq.${lender.id}`, 'PATCH', { full_name: 'Buddy Lender', department: 'Design', year_of_study: 3, verification_status: 'verified' });
  const [category] = await api(server, '/rest/v1/categories?select=id&limit=1');
  const keyword = `zorbcalc${run}`;
  const [item] = await api(server, '/rest/v1/items', 'POST', {
    owner_id: lender.id, category_id: category.id, title: `Buddy QA ${keyword}`, description: 'Fixture for the assistant test.',
    condition: 'good', images: [], deposit_amount: 200, max_loan_days: 7, status: 'available',
  });
  items.push(item.id);

  const require = createRequire(import.meta.url);
  const { chromium } = require(join(process.env.NODE_MODULES_PATH, 'playwright'));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });

  for (const viewport of [{ width: 1280, height: 860, name: 'desktop' }, { width: 411, height: 860, name: 'mobile' }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => sessionStorage.setItem('borrowbuddy.buddy.nudged', '1'));
    await page.goto(`${web}/login`);
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL('**/home', { timeout: 60000 });

    const launcher = page.getByRole('button', { name: 'Open Buddy assistant' });
    await launcher.waitFor({ timeout: 20000 });
    await launcher.click();
    const dialog = page.getByRole('dialog', { name: 'Buddy' });
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Open Buddy assistant');
    pass(`${viewport.name}: launcher opens the dialog, Escape closes it and restores focus`);

    await launcher.click();
    const input = dialog.getByLabel('Message Buddy');
    const ask = async (text) => {
      await input.fill(text);
      await input.press('Enter');
      await page.waitForFunction(() => !document.querySelector('[role=log][aria-busy=true]'), null, { timeout: 45000 });
    };

    await ask(`find ${keyword}`);
    await dialog.locator(`a[href="/items/${item.id}"]`).first().waitFor({ timeout: 10000 });
    pass(`${viewport.name}: catalog search returns the fixture as a linked item card`);

    await ask('do I owe any fines?');
    await dialog.getByText('[ OUTSTANDING ]').last().waitFor();
    assert(await dialog.getByText('₹0').last().isVisible());
    pass(`${viewport.name}: account question renders the student's own ledger`);

    await ask('how much is the fine per day for late returns?');
    await dialog.getByText('₹20').last().waitFor();
    pass(`${viewport.name}: policy answer is grounded in the shared fine constant`);

    await ask('take me to the map');
    await dialog.locator('a.buddy-action[href="/map"]').last().waitFor();
    pass(`${viewport.name}: navigation proposals render as an internal link`);

    await page.screenshot({ path: `${out}/assistant-${viewport.name}.png` });
    await page.goto(`${web}/assistant`);
    await page.getByRole('heading', { name: 'Buddy' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Open Buddy assistant' }).count(), 0);
    await page.screenshot({ path: `${out}/assistant-page-${viewport.name}.png` });
    pass(`${viewport.name}: full page shares the conversation and hides the launcher`);

    assert.deepEqual(errors, []);
    await context.close();
  }
} catch (e) {
  failure = String(e.stack ?? e).replaceAll(password, '[REDACTED]').replaceAll(server, '[REDACTED]').replaceAll(anon, '[REDACTED]');
} finally {
  if (browser) await browser.close();
  for (const id of items) await api(server, `/rest/v1/items?id=eq.${id}`, 'DELETE');
  for (const id of actors) {
    await api(server, `/rest/v1/notifications?user_id=eq.${id}`, 'DELETE');
    await api(server, `/rest/v1/audit_log?actor_id=eq.${id}`, 'DELETE');
    await api(server, `/auth/v1/admin/users/${id}`, 'DELETE');
  }
  if (baseline) assert.deepEqual(await snapshot(), baseline, 'Existing profiles and inventory must be unchanged');
  pass('fixture cleanup leaves existing profiles and inventory unchanged');
  await writeFile(`${out}/assistant-result.json`, JSON.stringify({ passed: !failure, checks, failure: failure ?? null }, null, 2));
}
if (failure) throw new Error(failure);
console.log(`Completed ${checks.length} assistant checks.`);
