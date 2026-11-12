// Explicit development-only native integration. No credentials are written into source or APKs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { syntheticPng } from './qa-image.mjs';
import { requireDisposableQaDevice, resetQaApplication } from './qa-device.mjs';

assert.equal(process.env.BORROWBUDDY_ALLOW_TEST_FIXTURES, '1');
const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, server = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(base?.startsWith('https://') && anon && server);
const adb = process.env.BORROWBUDDY_QA_ADB, serial = process.env.ANDROID_SERIAL;
assert(adb, 'ADB executable required');
requireDisposableQaDevice(serial);
const physical = !serial.startsWith('emulator-');
const mainApk = 'apps/android/app/build/outputs/apk/debug/app-debug.apk';
const pickerMethod = 'publishPhotoWithNativePickerAndEditWithoutLosingDraft';
assert(!physical || process.env.BORROWBUDDY_QA_CAMPUS_FOCUS !== pickerMethod,
  'Campus photo-picker workflow requires an isolated emulator gallery');
const run = randomUUID(), password = `Qa!${randomUUID()}aA9`, users = [], checks = [], reportDir = 'apps/android/verification';
let baseline, failure, cleanupVerified = false, device;
await mkdir(reportDir, { recursive: true });
const redact = value => String(value).replaceAll(password, '[QA PASSWORD]').replaceAll(server, '[SERVER KEY]').replaceAll(anon, '[PUBLIC KEY]').replace(/android-qa-[a-z0-9-]+@bennett\.edu\.in/gi, '[QA EMAIL]');
async function api(token, path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { apikey: token === server ? server : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const raw = await response.text(), data = raw ? JSON.parse(raw) : null;
  assert(response.ok, `${method} ${path.split('?')[0]}: ${response.status} ${data?.message ?? ''}`);
  assert(data?.ok !== false, data?.error); return data;
}
const rpc = (actor, action, data) => api(actor.token, '/rest/v1/rpc/campus_api', 'POST', { p_action: action, p_data: data });
const snapshot = () => Promise.all(['profiles?select=id', 'items?select=id,images,status', 'pickup_locations?select=id,name,is_active'].map(path => api(server, `/rest/v1/${path}&order=id`)));
async function actor(role, admin = false) {
  const email = `android-qa-native-campus-${role}-${run}@bennett.edu.in`;
  const user = await api(server, '/auth/v1/admin/users', 'POST', { email, password, email_confirm: true }); users.push(user.id);
  await api(server, `/rest/v1/profiles?id=eq.${user.id}`, 'PATCH', { full_name: `Native Campus QA ${role}`, verification_status: 'verified', is_admin: admin, department: 'Computer Science', year_of_study: 2 });
  const session = await api(anon, '/auth/v1/token?grant_type=password', 'POST', { email, password });
  return { id: user.id, email, token: session.access_token };
}
async function execute(args, timeout = 180000) {
  return await new Promise((resolve, reject) => {
    const child = spawn(adb, ['-s', serial, ...args], { windowsHide: true, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' } }); let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const timer = setTimeout(() => { child.kill(); reject(new Error(`ADB operation timed out after ${timeout}ms`)); }, timeout);
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}
async function capture(name) {
  const buffer = await new Promise((resolve, reject) => {
    const child = spawn(adb, ['-s', serial, 'exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', `files/${name}`], { windowsHide: true, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' } });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 10000);
    const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk)); child.on('error', reject);
    child.stderr.resume(); child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : resolve(null); });
  });
  if (!buffer?.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return false;
  await writeFile(`${reportDir}/${name.replace('.png', `-${run}.png`)}`, buffer);
  return true;
}
async function seed(host, kind, category, spot) {
  const id = randomUUID(), path = `${host.id}/${id}/fixture.png`;
  const response = await fetch(`${base}/storage/v1/object/campus-photos/${path}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${host.token}`, 'Content-Type': 'image/png' }, body: syntheticPng });
  assert(response.ok);
  await rpc(host, 'save_post', { id, kind, title: `Native QA ${kind} ${run}`, description: 'Detailed isolated native campus workflow fixture. Removed after verification.', category_id: category, location: 'Library area', pickup_location_id: spot, found_on: kind === 'found' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) : null, condition: kind === 'giveaway' ? 'good' : null, hold_hours: 48, identifying_notes: kind === 'found' ? 'Private finder mark: amber triangle inside the case.' : '', images: [path] }); return id;
}
async function verifyWebsite(recipient, host, found, giveaway) {
  const web = process.env.BORROWBUDDY_QA_WEB_URL;
  const require = createRequire(import.meta.url);
  const { chromium } = require(join(process.env.NODE_MODULES_PATH, 'playwright'));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  try {
    const verified = [];
    const page = await browser.newPage({ viewport: { width: 411, height: 900 } });
    await page.goto(web + '/login');
    await page.locator('input[name=email]').fill(recipient.email);
    await page.locator('input[name=password]').fill(password);
    await page.locator('form button[type=submit]').click();
    await page.waitForURL('**/home');
    for (const [method, postId] of [
      ['foundClaimAdminReviewAndTwoPartyCollection', found],
      ['giveawayBookingRealtimeOfflineDraftAndReceipt', giveaway],
    ]) {
      if (!checks.includes(method)) continue;
      const [transfer] = await api(recipient.token, `/rest/v1/campus_transfers?post_id=eq.${postId}&select=id,status,completed_at`);
      assert(transfer?.status === 'completed' && transfer.completed_at);
      await page.goto(web + '/campus/collections/' + transfer.id);
      await page.getByTestId('collection-receipt').waitFor();
      assert(await page.getByLabel('Collection message', { exact: true }).isDisabled());
      if (postId === giveaway) {
        await page.getByText('Host realtime reply', { exact: true }).waitFor();
        await page.goto(web + '/campus/handovers');
        await page.locator('article').filter({ has: page.locator(`a[href="/campus/collections/${transfer.id}"]`) })
          .filter({ hasText: /collection\s*·\s*cancelled/i }).first().waitFor();
      }
      verified.push(postId === found ? 'found-item receipt' : 'giveaway receipt, chat and cancelled appointment');
    }
    if (checks.includes('publishPhotoWithNativePickerAndEditWithoutLosingDraft')) {
      const [post] = await api(recipient.token, `/rest/v1/campus_posts?owner_id=eq.${host.id}&title=eq.${encodeURIComponent('Updated native campus publication ' + run)}&select=id,title,hold_hours`);
      assert(post?.hold_hours === 72);
      await page.goto(web + '/campus/giveaways/' + post.id);
      await page.getByRole('heading', { name: post.title, exact: true }).waitFor();
      const photo = page.getByRole('img', { name: post.title + ', photo 1', exact: true });
      await photo.scrollIntoViewIfNeeded();
      await page.waitForFunction(title => [...document.images].some(image =>
        image.alt === title + ', photo 1' && image.complete && image.naturalWidth > 0), post.title);
      verified.push('edited giveaway and its photo');
    }
    const result = 'website reflects Android activity (' + verified.join(', ') + ')';
    checks.push(result);
    console.log('PASS ' + result);
  } finally { await browser.close(); }
}
try {
  const boot = await execute(['shell', 'getprop', 'sys.boot_completed'], 15000);
  assert.equal(boot.stdout.trim(), '1', 'Selected device has not finished booting');
  const model = await execute(['shell', 'getprop', 'ro.product.model'], 15000);
  const sdk = await execute(['shell', 'getprop', 'ro.build.version.sdk'], 15000);
  device = { model: model.stdout.trim(), api: Number(sdk.stdout.trim()), physical };
  for (const apk of [mainApk, 'apps/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']) {
    const installed = await execute(['install', '-r', apk]); assert.equal(installed.code, 0, installed.stderr); assert(installed.stdout.includes('Success'));
  }
  baseline = await snapshot();
  const [host, recipient, admin] = await Promise.all([actor('host'), actor('recipient'), actor('admin', true)]);
  const category = (await api(server, '/rest/v1/categories?order=sort_order&limit=1'))[0];
  const spot = (await api(server, '/rest/v1/pickup_locations?is_active=eq.true&order=name&limit=1'))[0];
  const found = await seed(host, 'found', category.id, spot.id), giveaway = await seed(host, 'giveaway', category.id, spot.id);
  await rpc(host, 'save_schedule', { pickup_location_id: spot.id, slot_minutes: 15, weekly: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: '00:00', end: '23:59' })), exceptions: [] });
  if (physical && !process.env.BORROWBUDDY_QA_CAMPUS_FOCUS) console.log('COVERAGE: Campus photo-picker workflow requires an isolated emulator gallery');
  for (const method of ['foundClaimAdminReviewAndTwoPartyCollection', 'giveawayBookingRealtimeOfflineDraftAndReceipt', pickerMethod]
    .filter(name => !physical || name !== pickerMethod)
    .filter(name => !process.env.BORROWBUDDY_QA_CAMPUS_FOCUS || name === process.env.BORROWBUDDY_QA_CAMPUS_FOCUS)) {
    const clear = await resetQaApplication(async args => {
      const result = await execute(args);
      return { code: result.code, output: result.stdout + result.stderr };
    }, serial, mainApk);
    assert(clear.code === 0 && clear.output.includes('Success'), 'Dedicated Campus QA app reset failed');
    const runnerArgs = { class: `in.borrowbuddy.android.HostedCampusTest#${method}`, qaCampus: '1', qaEmail: recipient.email, qaHostEmail: host.email, qaAdminEmail: admin.email, qaPassword: password, qaUserId: recipient.id, qaHostId: host.id, qaRunId: run, qaFoundId: found, qaGiveawayId: giveaway, qaLocationName: spot.name, qaCategoryName: category.name };
    const args = ['shell', 'am', 'instrument', '--user', '0', '-w', '-r'];
    for (const [key, value] of Object.entries(runnerArgs)) args.push('-e', key, key.endsWith('Name') ? Buffer.from(value).toString('base64') : value);
    args.push('in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner');
    const result = await execute(args, 360000), output = redact(result.stdout + result.stderr);
    await writeFile(`${reportDir}/campus-native-${method}-${run}.txt`, output);
    const expectedCaptures = method.startsWith('found') ? ['native-campus-found-receipt.png']
      : method.startsWith('giveaway') ? ['native-campus-offline.png', 'native-campus-giveaway-receipt.png'] : ['native-campus-published.png'];
    const captureResults = await Promise.all(expectedCaptures.map(name => capture(name)));
    if (result.code !== 0 || !/OK \(1 test\)/.test(output) || /INSTRUMENTATION_STATUS_CODE: -[1234]/.test(output)) {
      failure ??= new Error(`${method} failed; see redacted native report`);
      console.error(`FAIL ${method}; report preserved`);
      const diagnostic = await execute(['logcat', '-d', '-s', 'BorrowBuddyQa:I', '*:S'], 10000);
      await writeFile(`${reportDir}/campus-native-diagnostic-${method}-${run}.txt`, redact(diagnostic.stdout + diagnostic.stderr));
      const devices = await execute(['get-state'], 10000);
      if (!devices.stdout.includes('device')) break;
    } else {
      assert(captureResults.every(Boolean), `${method} passed but its PNG evidence could not be exported`);
      checks.push(method); console.log(`PASS ${method}`);
    }
  }
  if (!failure && process.env.BORROWBUDDY_QA_WEB_URL) await verifyWebsite(recipient, host, found, giveaway);
} catch (error) { failure = error; console.error(redact(error.stack)); }
finally {
  try {
    if (users.length) {
      const ids = users.join(',');
      const posts = await api(server, `/rest/v1/campus_posts?owner_id=in.(${ids})&select=id`);
      const postIds = posts.map(row => row.id);
      const claims = postIds.length ? await api(server, `/rest/v1/campus_claims?post_id=in.(${postIds.join(',')})&select=id`) : [];
      const transfers = postIds.length ? await api(server, `/rest/v1/campus_transfers?post_id=in.(${postIds.join(',')})&select=id`) : [];
      for (const [key, rows] of [['campus_post_id', posts], ['campus_claim_id', claims], ['campus_transfer_id', transfers]]) if (rows.length) await api(server, `/rest/v1/notifications?payload->>${key}=in.(${rows.map(row => row.id).join(',')})`, 'DELETE');
      const removeTree = async prefix => {
        const rows = await api(server, '/storage/v1/object/list/campus-photos', 'POST', { prefix, limit: 1000 });
        for (const row of rows) {
          const path = `${prefix}/${row.name}`;
          if (row.id) await api(server, '/storage/v1/object/campus-photos', 'DELETE', { prefixes: [path] });
          else await removeTree(path);
        }
      };
      if (postIds.length) await api(server, `/rest/v1/campus_posts?id=in.(${postIds.join(',')})`, 'DELETE');
      for (const id of users) await removeTree(id);
      await api(server, `/rest/v1/notifications?user_id=in.(${ids})`, 'DELETE');
      await api(server, `/rest/v1/audit_log?actor_id=in.(${ids})`, 'DELETE');
      for (const row of transfers) await api(server, `/rest/v1/audit_log?entity=eq.campus_transfer&entity_id=eq.${row.id}`, 'DELETE');
      for (const id of users) await api(server, `/auth/v1/admin/users/${id}`, 'DELETE');
    }
    if (baseline) { assert.deepEqual(await snapshot(), baseline, 'Existing profiles, inventory/images and pickup locations must remain unchanged'); cleanupVerified = true; }
    if (cleanupVerified) console.log('PASS isolated fixture cleanup and preservation of all existing inventory/images/accounts');
  } catch (error) { failure ??= error; console.error(redact(`Cleanup failed: ${error.stack}`)); }
  await writeFile(`${reportDir}/campus-native-result-${run}.json`, JSON.stringify({ run, device, passed: !failure, checks, cleanupVerified, productionReady: false, failure: failure ? redact(failure.message) : null }, null, 2));
}
if (failure) process.exitCode = 1;
