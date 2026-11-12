// Explicitly opt in against a development database. Never run against production.
// Credentials stay in environment/memory; output contains only test step names.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { syntheticPng } from './qa-image.mjs';
import { requireDisposableQaDevice, resetQaApplication } from './qa-device.mjs';

const base = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(process.env.BORROWBUDDY_ALLOW_TEST_FIXTURES, '1', 'Development-fixture opt-in required');
assert(base?.startsWith('https://') && anon && service, 'Hosted test credentials required');
const users = [];
const objects = [];
let itemId;
let loanId;
let nativeItemId;
let nativeStudentId;
let nativeEvidenceUserId;
let nativePinItemId;
const nativePinNames = [];
const nativeModerationItems = [];
const nativeChatRooms = [];
const nativeShellItems = [];
const nativeLogbookItems = [];
const nativeOwnerItems = [];
const nativeMediaCleanups = [];
const nativeProfileSessions = [];
const nativeProfileItems = [];
const steps = [];
const password = `Qa!${randomUUID()}aA9`;
const runId = randomUUID();
const redactDiagnostic = output => String(output).replaceAll(password, '[QA PASSWORD REDACTED]').replaceAll(service, '[SERVER KEY REDACTED]').replaceAll(anon, '[PUBLIC KEY REDACTED]').replace(/android-qa-[a-z0-9-]+@bennett\.edu\.in/gi, '[QA EMAIL REDACTED]');
let workflowFailure;
const api = async (actor, path, method = 'GET', body, expected = true, extraHeaders = {}) => {
  const key = actor === 'service' ? service : anon;
  const token = typeof actor === 'object' ? actor.token : key;
  const response = await fetch(`${base}${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (expected) assert(response.ok, `${method} ${path.split('?')[0]} failed (${response.status}): ${data?.message ?? data?.error ?? 'API error'}`);
  else assert(!response.ok, `Expected access rejection for ${path.split('?')[0]}`);
  return data;
};
const rpc = (actor, name, params) => api(actor, `/rest/v1/rpc/${name}`, 'POST', params);
async function removeFixtureItem(id) {
  await removeFixtureItems([id]);
}
async function removeFixtureItems(itemIds) {
  for (let itemOffset = 0; itemOffset < itemIds.length; itemOffset += 50) {
    const itemChunk = itemIds.slice(itemOffset, itemOffset + 50).join(',');
    const loans = await api('service', `/rest/v1/loans?item_id=in.(${itemChunk})&select=id`);
    for (let offset = 0; offset < loans.length; offset += 50) {
      const ids = loans.slice(offset, offset + 50).map(loan => loan.id).join(',');
      // Incident alerts can reach existing admins; remove only this fixture's payloads.
      await api('service', `/rest/v1/notifications?payload->>loan_id=in.(${ids})`, 'DELETE');
      await api('service', `/rest/v1/loans?id=in.(${ids})`, 'DELETE');
    }
    await api('service', `/rest/v1/items?id=in.(${itemChunk})`, 'DELETE');
  }
}
const pass = name => { steps.push(name); console.log(`PASS ${name}`); };
const assertNoPublicSecrets = row => {
  assert(row, 'Public loan response required');
  assert(row.handover_token_hash == null && row.return_token_hash == null,
    'A public loan response exposes handover secrets');
};
async function createActor(role, fullName = `Android QA ${role}`) {
  const email = `android-qa-${role}-${runId}@bennett.edu.in`;
  const user = await api('service', '/auth/v1/admin/users', 'POST', { email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  const id = user.id;
  assert(id, 'Auth user ID required');
  users.push(id);
  const session = await api('anon', '/auth/v1/token?grant_type=password', 'POST', { email, password });
  assert(session.access_token && session.refresh_token, 'Real password session required');
  return { id, token: session.access_token, refresh: session.refresh_token };
}
async function requireBootedNativeDevice() {
  if (!process.env.BORROWBUDDY_QA_GRADLE) return;
  requireDisposableQaDevice(process.env.ANDROID_SERIAL);
  const adb = process.env.BORROWBUDDY_QA_ADB ?? join(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const result = await new Promise((resolve, reject) => {
    const child = spawn(adb, ['-s', process.env.ANDROID_SERIAL, 'shell', 'getprop', 'sys.boot_completed'], { env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' } });
    let output = '';
    const timeout = setTimeout(() => child.kill(), 15_000);
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume();
    child.on('error', failure => { clearTimeout(timeout); reject(failure); });
    child.on('close', code => { clearTimeout(timeout); resolve({ code, output }); });
  });
  assert(result.code === 0 && result.output.trim() === '1', 'Dedicated emulator/device must finish booting before creating hosted QA actors');
}
try {
  await requireBootedNativeDevice();
  const admin = await createActor('admin');
  const owner = await createActor('owner');
  const borrower = await createActor('borrower');
  const outsider = await createActor('outsider');
  pass('confirmed isolated accounts and real password authentication');
  await api('service', `/rest/v1/profiles?id=eq.${admin.id}`, 'PATCH', { is_admin: true, verification_status: 'verified', full_name: 'Android QA admin', department: 'Computer Science', year_of_study: 2 });
  const categories = await api(owner, '/rest/v1/categories?order=sort_order');
  assert(categories.length);
  await api(owner, '/rest/v1/items', 'POST', { owner_id: owner.id, category_id: categories[0].id, title: 'Android QA forbidden listing' }, false);
  await api(owner, `/rest/v1/profiles?id=eq.${owner.id}`, 'PATCH', { is_admin: true }, false);
  await api(owner, `/rest/v1/profiles?id=eq.${owner.id}`, 'PATCH', { full_name: 'Android QA owner', department: 'Computer Science', year_of_study: 2 });
  // Synthetic PNG fixture; no student document or personal image is used.
  const png = syntheticPng;
  const uploadPath = `${owner.id}/${randomUUID()}.png`;
  const upload = await fetch(`${base}/storage/v1/object/student-ids/${uploadPath}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${owner.token}`, 'Content-Type': 'image/png' }, body: png, signal: AbortSignal.timeout(30_000) });
  assert(upload.ok, `Private fixture upload failed (${upload.status})`);
  objects.push({ bucket: 'student-ids', path: uploadPath });
  const submitted = await rpc(owner, 'submit_student_id', { p_path: uploadPath });
  assert.equal(submitted.verification_status, 'pending');
  await api(outsider, `/storage/v1/object/sign/student-ids/${uploadPath}`, 'POST', { expiresIn: 60 }, false);
  await rpc(admin, 'admin_set_verification', { p_profile_id: owner.id, p_status: 'rejected', p_note: 'Synthetic QA rejection' });
  assert.equal((await rpc(owner, 'submit_student_id', { p_path: uploadPath })).verification_status, 'pending');
  for (const actor of [owner, borrower, outsider]) await rpc(admin, 'admin_set_verification', { p_profile_id: actor.id, p_status: 'verified' });
  const signed = await api(admin, `/storage/v1/object/sign/student-ids/${uploadPath}`, 'POST', { expiresIn: 60 });
  assert(signed.signedURL, 'Admin evidence access required');
  pass('onboarding, private upload, rejection/resubmission, admin approval and privilege denial');
  const helperCalls = [
    ['create_notification', { p_user_id: owner.id, p_type: 'loan_cancelled', p_title: 'Forbidden QA helper notification' }],
    ['write_audit', { p_action: 'qa.helper_denied', p_entity: 'qa_fixture', p_entity_id: owner.id }],
    ['recompute_trust_score', { p_user_id: owner.id }],
    ['notify_waitlist_for_item', { p_item_id: randomUUID() }],
  ];
  for (const actor of ['anon', owner]) {
    for (const [name, params] of helperCalls) {
      const denied = await api(actor, `/rest/v1/rpc/${name}`, 'POST', params, false);
      assert(['42501', 'PGRST202'].includes(denied?.code), 'Internal helper must be inaccessible or permission denied');
    }
  }
  pass('anonymous/student denial of internal notification, audit, trust and waitlist helpers');
  const item = (await api(owner, '/rest/v1/items', 'POST', { owner_id: owner.id, category_id: categories[0].id, title: `Android QA ${runId}`, description: 'Isolated API\nworkflow fixture,  automatically removed', max_loan_days: 14 }))[0];
  itemId = item.id;
  const imagePaths = [];
  for (let photo = 0; photo < 3; photo++) {
    const path = `${owner.id}/${randomUUID()}.png`;
    const response = await fetch(`${base}/storage/v1/object/item-images/${path}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${owner.token}`, 'Content-Type': 'image/png' }, body: png, signal: AbortSignal.timeout(30_000) });
    assert(response.ok, `Item fixture upload failed (${response.status})`);
    objects.push({ bucket: 'item-images', path }); imagePaths.push(path);
  }
  await api(owner, `/rest/v1/items?id=eq.${itemId}`, 'PATCH', { images: imagePaths, deposit_amount: 100000 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const due = new Date(`${today}T12:00:00Z`); due.setUTCDate(due.getUTCDate() + 2);
  const end = due.toISOString().slice(0, 10);
  const request = (await api(borrower, '/rest/v1/borrow_requests', 'POST', { item_id: itemId, borrower_id: borrower.id, start_date: today, end_date: end, message: 'Isolated Android QA request' }))[0];
  const loan = await rpc(owner, 'approve_request', { p_request_id: request.id });
  loanId = loan.id;
  assert.equal(loan.status, 'awaiting_pickup');
  assert.equal((await api(outsider, `/rest/v1/loans?id=eq.${loanId}`)).length, 0);
  assert((await rpc(outsider, 'get_item_availability', { p_item_id: itemId })).some(window => window.start_date === today && window.end_date === end));
  const waiting = await rpc(outsider, 'join_waitlist', { p_item_id: itemId, p_start: today, p_end: end });
  pass('listing/request/approval, private loan visibility and public availability');
  const conversations = await api(owner, `/rest/v1/conversations?loan_id=eq.${loanId}`);
  assert.equal(conversations.length, 1);
  const conversation = conversations[0].id;
  await api(borrower, '/rest/v1/messages', 'POST', { conversation_id: conversation, sender_id: borrower.id, body: 'Android QA pickup coordination' });
  assert.equal((await api(owner, `/rest/v1/messages?conversation_id=eq.${conversation}`)).length, 1);
  assert.equal((await api(outsider, `/rest/v1/messages?conversation_id=eq.${conversation}`)).length, 0);
  await rpc(owner, 'mark_conversation_read', { p_conversation_id: conversation });
  pass('private conversation, message delivery, read tracking and membership isolation');
  let code = await rpc(borrower, 'generate_handover_token', { p_loan_id: loanId, p_kind: 'pickup' });
  for (const actor of [owner, borrower, admin]) {
    assertNoPublicSecrets((await api(actor, `/rest/v1/loans?id=eq.${loanId}`))[0]);
    await api(actor, '/rest/v1/handover_secrets', 'GET', undefined, false, { 'Accept-Profile': 'borrowbuddy_private' });
  }
  const wrong = code === '000000' ? '111111' : '000000';
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal((await rpc(owner, 'confirm_handover_v2', { p_loan_id: loanId, p_token: wrong, p_kind: 'pickup' })).ok, false);
    assert.equal((await api(owner, `/rest/v1/loans?id=eq.${loanId}&select=handover_attempts`))[0].handover_attempts, attempt);
  }
  assert.equal((await rpc(owner, 'confirm_handover_v2', { p_loan_id: loanId, p_token: code, p_kind: 'pickup' })).ok, false);
  code = await rpc(borrower, 'generate_handover_token', { p_loan_id: loanId, p_kind: 'pickup' });
  assert.equal((await rpc(owner, 'confirm_handover_v2', { p_loan_id: loanId, p_token: code, p_kind: 'pickup' })).status, 'active');
  const returnCode = await rpc(owner, 'generate_handover_token', { p_loan_id: loanId, p_kind: 'return' });
  assertNoPublicSecrets((await api(borrower, `/rest/v1/loans?id=eq.${loanId}`))[0]);
  assert.equal((await rpc(borrower, 'confirm_handover_v2', { p_loan_id: loanId, p_token: returnCode, p_kind: 'return' })).status, 'returned');
  assert.equal((await api(outsider, `/rest/v1/waitlist_entries?id=eq.${waiting.id}`))[0].status, 'notified');
  pass('persistent lockout across HTTP transactions, regeneration, pickup/return and waitlist notification');
  const review = { loan_id: loanId, reviewer_id: borrower.id, reviewee_id: owner.id, role: 'as_borrower', rating: 5, comment: 'Synthetic Android QA review' };
  await api(borrower, '/rest/v1/reviews', 'POST', review);
  await api(borrower, '/rest/v1/reviews', 'POST', review, false);
  const reputation = (await rpc(outsider, 'get_public_profile_stats', { p_profile_id: owner.id }))[0];
  assert.equal(reputation.completed_loans, 1); assert.equal(reputation.review_count, 1); assert.equal(reputation.rating_average, 5);
  const notifications = await api(owner, `/rest/v1/notifications?user_id=eq.${owner.id}`);
  assert(notifications.some(notification => notification.type === 'new_review'));
  const refreshed = await api(borrower, '/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: borrower.refresh });
  assert(refreshed.access_token);
  await api({ token: refreshed.access_token }, '/auth/v1/logout', 'POST');
  pass('review uniqueness, notification delivery, session refresh and logout');
  if (process.env.BORROWBUDDY_QA_GRADLE) {
    const result = await new Promise((resolve, reject) => {
      const tasks = process.env.BORROWBUDDY_QA_FOCUS === 'release' ? [':smoke:assembleRelease'] : [':app:assembleDebug', ':app:assembleDebugAndroidTest'];
      const args = [...tasks, '--console=plain', '--no-daemon', '-Dorg.gradle.jvmargs=-Xmx1536m'];
      const command = process.platform === 'win32' ? 'powershell.exe' : process.env.BORROWBUDDY_QA_GRADLE;
      const commandArgs = process.platform === 'win32' ? ['-NoProfile', '-Command', `& $env:BORROWBUDDY_QA_GRADLE ${tasks.join(' ')} --console=plain --no-daemon "-Dorg.gradle.jvmargs=-Xmx1536m"; exit $LASTEXITCODE`] : args;
      const child = spawn(command, commandArgs, {
        cwd: new URL('..', import.meta.url), stdio: 'inherit',
        env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' },
      });
      child.on('error', reject); child.on('exit', resolve);
    });
    assert.equal(result, 0, 'Native test APK build failed');
    const adb = process.env.BORROWBUDDY_QA_ADB ?? join(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    assert(process.env.ANDROID_SERIAL, 'A dedicated Android QA device serial is required');
    const runAdb = args => new Promise((resolve, reject) => {
      const child = spawn(adb, ['-s', process.env.ANDROID_SERIAL, ...args], { cwd: new URL('..', import.meta.url), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' } });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject); child.on('close', code => resolve({ code, output }));
    });
    const captureNativeFile = (name, destination, packageName = 'in.borrowbuddy.android') => new Promise((resolve, reject) => {
      const child = spawn(adb, ['-s', process.env.ANDROID_SERIAL, 'exec-out', 'run-as', packageName, 'cat', `files/${name}`],
        { env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '' } });
      const chunks = [];
      child.stdout.on('data', chunk => chunks.push(chunk));
      child.stderr.resume(); child.on('error', reject);
      child.on('close', async code => {
        try {
          assert.equal(code, 0, 'Native QA screenshot export failed');
          const bytes = Buffer.concat(chunks);
          assert(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'Native screenshot must be a PNG');
          await writeFile(destination, bytes); resolve();
        } catch (failure) { reject(failure); }
      });
    });
    // These are disposable QA packages; clear previous captures/session files
    // before PackageManager allocates space for another APK installation.
    if (process.env.ANDROID_SERIAL.startsWith('emulator-')) {
      await runAdb(['shell', 'pm', 'clear', '--user', '0', 'in.borrowbuddy.android']);
    }
    const mainApk = process.env.BORROWBUDDY_QA_MAIN_APK ?? 'app/build/outputs/apk/debug/app-debug.apk';
    const resetQaApp = () => resetQaApplication(runAdb, process.env.ANDROID_SERIAL, mainApk);
    assert(!process.env.BORROWBUDDY_QA_MAIN_APK || process.env.BORROWBUDDY_QA_FOCUS === 'release', 'APK overrides are restricted to the black-box release diagnostic');
    const releaseCheck = process.env.BORROWBUDDY_QA_FOCUS === 'release';
    const testApk = releaseCheck ? 'smoke/build/outputs/apk/release/smoke-release.apk' : 'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';
    // The physical release check installs the main APK cleanly in its own step.
    const apks = releaseCheck && !process.env.ANDROID_SERIAL.startsWith('emulator-') ? [testApk] : [mainApk, testApk];
    for (const apk of apks) {
      const installed = await runAdb(['install', '-r', apk]);
      assert.equal(installed.code, 0, `QA APK installation failed: ${installed.output}`); assert(installed.output.includes('Success'), 'QA APK installation not confirmed');
    }
    const redact = output => output.replaceAll(password, '[QA PASSWORD REDACTED]').replaceAll(service, '[SERVER KEY REDACTED]').replaceAll(anon, '[PUBLIC KEY REDACTED]').replace(/android-qa-[a-z0-9-]+@bennett\.edu\.in/gi, '[QA EMAIL REDACTED]');
    const printSummary = report => console.log(report.split('\n').filter(line => /INSTRUMENTATION_STATUS: (class|test|stack)=|INSTRUMENTATION_STATUS_CODE:|^OK \(|^Tests run:|^FAILURES/.test(line)).join('\n'));
    await mkdir(new URL('../verification/', import.meta.url), { recursive: true });
    let baselineReport = '';
    // Each scenario owns a fresh process/app state. Memory stress remains a separate release gate.
    const focus = process.env.BORROWBUDDY_QA_FOCUS;
    assert(!focus || ['handover', 'verification', 'moderation', 'chat', 'pins', 'shell', 'catalog', 'logbook', 'owner', 'ledger', 'inbox', 'profile', 'release', 'admin', 'admin-source', 'admin-workflows'].includes(focus), 'Unknown native test focus');
    const isolatedGallery = process.env.ANDROID_SERIAL.startsWith('emulator-');
    let phoneWidth = 411;
    let compareDefaultTextGeometry = true;
    if (!isolatedGallery && (!focus || ['chat', 'profile', 'admin', 'admin-source'].includes(focus))) {
      const size = (await runAdb(['shell', 'wm', 'size'])).output;
      const density = (await runAdb(['shell', 'wm', 'density'])).output;
      const pixels = Number((/Override size: (\d+)x/.exec(size) ?? /Physical size: (\d+)x/.exec(size))?.[1]);
      const dpi = Number((/Override density: (\d+)/.exec(density) ?? /Physical density: (\d+)/.exec(density))?.[1]);
      assert(pixels > 0 && dpi > 0, 'Could not read the connected phone viewport');
      phoneWidth = Math.round(pixels * 160 / dpi);
      const fontScale = (await runAdb(['shell', 'settings', 'get', 'system', 'font_scale'])).output.trim();
      compareDefaultTextGeometry = fontScale === 'null' || Number(fontScale) === 1;
      if (!compareDefaultTextGeometry) {
        console.log('COVERAGE: preserving phone text scaling; default-text browser geometry checks run on the emulator');
      }
    }
    assert(isolatedGallery || !['verification', 'moderation'].includes(focus), 'Photo-picker workflows require an isolated emulator gallery');
    if (!isolatedGallery && (!focus || focus === 'admin-workflows')) {
      console.log('COVERAGE: verification and moderation picker workflows require an isolated emulator gallery');
    }
    if (focus) console.log(`FOCUSED RUN (${focus}): other native scenarios are not included in this result`);
    for (const testClass of focus === 'catalog' ? ['HostedItemFlowTest'] : focus ? [] : ['HostedSessionTest', 'HostedItemFlowTest']) {
      const cleared = await resetQaApp();
      assert(cleared.output.includes('Success'), 'Dedicated QA app reset failed');
      const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', `in.borrowbuddy.android.${testClass}`,
        '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaItemId', itemId, '-e', 'qaItemTitle', item.title.replaceAll(' ', '_'),
        '-e', 'qaAdaptiveWindow', process.env.ANDROID_SERIAL?.startsWith('emulator-') ? '1' : '0',
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(native.output); baselineReport += `\n${testClass}\n${report}`;
      await writeFile(new URL('../verification/hosted-native-workflow.txt', import.meta.url), baselineReport);
      printSummary(report);
      if (testClass === 'HostedItemFlowTest' && (!/OK \(1 test\)/.test(report) || /INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report))) {
        await captureNativeFile('native-catalog-finished.png', new URL('../verification/native-catalog-failure-api36.png', import.meta.url)).catch(failure => console.log(`Catalog failure capture unavailable: ${failure.message}`));
      }
      assert.equal(native.code, 0, 'Native instrumentation command failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), `${testClass} must finish with one passing test; zero/failed/skipped tests cannot pass`);
      if (testClass === 'HostedItemFlowTest') {
        for (const name of ['browse', 'filtered', 'empty', 'card', 'profile', 'profile-reviews']) await captureNativeFile(`native-catalog-${name}.png`, new URL(`../verification/native-catalog-${name}-api36.png`, import.meta.url));
        if (process.env.ANDROID_SERIAL?.startsWith('emulator-')) await captureNativeFile('native-catalog-wide.png', new URL('../verification/native-catalog-wide-api36.png', import.meta.url));
        const metrics = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-catalog-metrics.json']);
        assert.equal(metrics.code, 0); JSON.parse(metrics.output);
        await writeFile(new URL('../verification/native-catalog-metrics.json', import.meta.url), metrics.output);
        if (process.env.BORROWBUDDY_QA_WEB_URL) {
          const { testWebCatalog } = await import('./test-web-catalog.mjs');
          await testWebCatalog({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
            email: `android-qa-borrower-${runId}@bennett.edu.in`, password, itemId, title: item.title, categoryId: categories[0].id });
          pass('source catalog phone/tablet filters and matching fixture card captured and measured');
        }
      }
    }
    if (!focus) pass('native session/realtime lifecycle and catalog/gallery/calendar/request/cancellation');
    if (focus === 'catalog') pass('native catalog automatic filters, restored query/category, empty/clear states, gallery/calendar/request/cancellation');
    if (focus === 'release') {
      assert(process.env.BORROWBUDDY_QA_MAIN_APK, 'Signed optimized QA APK must be supplied explicitly');
      const reset = await resetQaApp(); assert(reset.output.includes('Success'));
      const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r', '-e', 'class', 'in.borrowbuddy.android.smoke.MinifiedAppTest',
        '-e', 'qaMinifiedApp', '1', '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaRequireProcessDeath', isolatedGallery ? '1' : '0',
        'in.borrowbuddy.android.smoke/androidx.test.runner.AndroidJUnitRunner']);
      const report = redact(native.output);
      await writeFile(new URL('../verification/hosted-native-minified-app.txt', import.meta.url), report); printSummary(report);
      if (!/OK \(1 test\)/.test(report)) {
        await captureNativeFile('minified-failure.png', new URL('../verification/native-minified-failure.png', import.meta.url), 'in.borrowbuddy.android.smoke').catch(() => {});
        const details = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android.smoke', 'cat', 'files/minified-failure.xml']);
        if (details.code === 0) await writeFile(new URL('../verification/native-minified-failure.xml', import.meta.url), redact(details.output));
      }
      assert.equal(native.code, 0); assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Minified release must finish one passing black-box test');
      const summary = /INSTRUMENTATION_STATUS: qaMinifiedResult=(.+)/.exec(report);
      assert(summary, 'Release checks must export their actual completion evidence');
      const result = JSON.parse(summary[1]); assert(result.debuggable === false && result.authenticated && result.chatLoadedAndSent && result.animatedMembershipCard && result.signedOut);
      assert(result.campusRoutesLoaded, 'Optimized app must load the native Lost & Found, Giveaways and Handover routes');
      assert(result.sessionRestoredAfterResume && result.chatRouteRestoredAfterResume && result.draftRestoredAfterResume);
      if (isolatedGallery) assert(result.actualProcessDeath && result.previousPid !== result.restoredPid);
      const unsent = await api(owner, `/rest/v1/messages?conversation_id=eq.${conversation}&body=eq.Unsent%20process%20recovery%20draft`);
      assert.equal(unsent.length, 0, 'Restoring a draft must never automatically send it');
      const sent = await api(owner, `/rest/v1/messages?conversation_id=eq.${conversation}&body=eq.Optimized%20native%20chat%20message`);
      assert.equal(sent.length, 1); assert.equal(sent[0].sender_id, borrower.id);
      result.chatPersistedExactlyOnceWithOriginalCase = true;
      result.restoredDraftNeverAutoSent = true;
      await writeFile(new URL('../verification/native-minified-app-result.json', import.meta.url), JSON.stringify(result, null, 2));
      const recovery = result.actualProcessDeath ? 'process death' : 'backgrounding';
      pass(`non-debuggable R8 app loads native campus routes, restores session/route/unsent draft after ${recovery}, persists original-case chat once, loads public profile, renders moving ID card and signs out`);
    }
    if (!focus || focus === 'shell') {
      const shellCreatedAt = Date.now();
      const fixtures = await api(owner, '/rest/v1/items', 'POST', Array.from({ length: 62 }, (_, index) => ({
        owner_id: owner.id, category_id: categories[0].id, title: `Android QA shell ${runId} ${index}`,
        description: 'Isolated header counter fixture', max_loan_days: 14,
        created_at: new Date(shellCreatedAt + index).toISOString(),
      })));
      nativeShellItems.push(...fixtures.map(row => row.id));
      await api(borrower, '/rest/v1/borrow_requests', 'POST', fixtures.slice(0, 61).map(row => ({
        item_id: row.id, borrower_id: borrower.id, start_date: today, end_date: end,
      })));
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebShell } = await import('./test-web-shell.mjs');
        await testWebShell({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
          email: `android-qa-owner-${runId}@bennett.edu.in`, password });
        pass('source website header rendered and measured at phone and tablet widths');
      }
      const cleared = await resetQaApp();
      assert(cleared.output.includes('Success'), 'Dedicated shell app reset failed');
      const shell = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedShellTest',
        '-e', 'qaOwnerEmail', `android-qa-owner-${runId}@bennett.edu.in`,
        '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaShellItemId', fixtures[61].id,
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(shell.output);
      await writeFile(new URL('../verification/hosted-native-shell.txt', import.meta.url), report); printSummary(report);
      assert.equal(shell.code, 0, 'Native shell instrumentation failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native shell must complete one passing test');
      const requests = await api('service', `/rest/v1/borrow_requests?item_id=in.(${nativeShellItems.join(',')})&select=status`);
      assert.equal(requests.filter(row => row.status === 'pending').length, 61);
      assert.equal(requests.filter(row => row.status === 'approved').length, 1);
      assert.equal((await api('service', `/rest/v1/notifications?user_id=eq.${owner.id}&read_at=is.null`)).length, 0);
      await writeFile(new URL('../verification/hosted-native-shell-state.json', import.meta.url), JSON.stringify({
        pending: 61, approved: 1, unread: 0, countAboveSixty: true, incomingRequestRealtime: true,
        tickerScrollAndRestoration: true, boundedPrimaryNavigation: true,
      }, null, 2));
      for (const name of ['expanded', 'scrolled', 'notifications-read']) {
        await captureNativeFile(`native-shell-${name}.png`, new URL(`../verification/native-shell-${name}-api36.png`, import.meta.url));
      }
      pass('native source header, exact counters above sixty, realtime incoming/approval/read updates, ticker scroll/restoration and bounded navigation');
      // Keep the large counter fixture out of subsequent handover and memory scenarios.
      for (const id of nativeShellItems) await removeFixtureItem(id);
      nativeShellItems.length = 0;
    }
    if (!focus || focus === 'pins' || focus === 'admin-workflows') {
      const localCleared = await resetQaApp();
      assert(localCleared.output.includes('Success'), 'Local pin-dialog app reset failed');
      const localDialog = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.PinDialogTest', '-e', 'qaPinDialog', '1',
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const localReport = redact(localDialog.output);
      await writeFile(new URL('../verification/native-pin-dialog-local.txt', import.meta.url), localReport); printSummary(localReport);
      assert.equal(localDialog.code, 0, 'Local pin-dialog instrumentation failed');
      assert(/OK \(1 test\)/.test(localReport) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(localReport), 'Local pin-dialog regression must complete one passing test');
      const localResult = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/pin-dialog-local-result.json']);
      assert.equal(localResult.code, 0); const localState = JSON.parse(localResult.output);
      assert.equal(localState.cancelCycles, 11); assert(localState.openDialogRestored && localState.focusedDraftRetained && localState.backDismisses && localState.normalComposeSynchronization);
      await writeFile(new URL('../verification/native-pin-dialog-local-result.json', import.meta.url), JSON.stringify(localState, null, 2));
      nativePinNames.push(`Android QA pin ${runId}`, `Android QA pin updated ${runId}`, `Forbidden QA pin ${runId}`);
      nativePinItemId = (await api(admin, '/rest/v1/items', 'POST', {
        owner_id: admin.id, category_id: categories[0].id, title: `Android QA map shelf ${runId}`,
        description: 'Isolated native campus pin fixture', max_loan_days: 14,
      }))[0].id;
      const forbidden = { p_id: null, p_name: `Forbidden QA pin ${runId}`, p_description: '', p_xp: 50, p_yp: 42, p_map_label: 'right', p_is_active: true };
      for (const actor of ['anon', borrower]) {
        await api(actor, '/rest/v1/rpc/admin_save_pickup_location', 'POST', forbidden, false);
        await api(actor, '/rest/v1/rpc/admin_delete_pickup_location', 'POST', { p_id: randomUUID() }, false);
      }
      await api(borrower, '/rest/v1/pickup_locations', 'POST', { name: `Forbidden QA pin ${runId}` }, false);
      const cleared = await resetQaApp();
      assert(cleared.output.includes('Success'), 'Dedicated pin app reset failed');
      const pins = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedPinTest',
        '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`,
        '-e', 'qaAdminEmail', `android-qa-admin-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaRunId', runId, '-e', 'qaPinItemId', nativePinItemId,
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(pins.output);
      await writeFile(new URL('../verification/hosted-native-pins.txt', import.meta.url), report); printSummary(report);
      assert.equal(pins.code, 0, 'Native campus pin instrumentation failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native pins must complete one passing test');
      for (const name of nativePinNames) assert.equal((await api('service', `/rest/v1/pickup_locations?name=eq.${encodeURIComponent(name)}`)).length, 0);
      const listing = (await api('service', `/rest/v1/items?id=eq.${nativePinItemId}&select=pickup_location_id,status`))[0];
      assert(listing && listing.pickup_location_id === null && listing.status === 'available');
      const audit = await api('service', `/rest/v1/audit_log?actor_id=eq.${admin.id}&entity=eq.pickup_location&select=action,metadata`);
      assert.equal(audit.filter(row => row.action === 'pickup_location.saved').length, 3);
      assert.equal(audit.filter(row => row.action === 'pickup_location.deleted').length, 1);
      await writeFile(new URL('../verification/hosted-native-pins-state.json', import.meta.url), JSON.stringify({
        deleted: true, linkedItemPreserved: true, pickupReference: listing.pickup_location_id,
        audit: audit.map(row => row.action), nativeTapDragNumericRotationVisibilityCatalog: true,
      }, null, 2));
      await captureNativeFile('native-pin-deleted.png', new URL('../verification/native-pin-deleted-api36.png', import.meta.url));
      await captureNativeFile('native-map-route.png', new URL('../verification/native-map-route-api36.png', import.meta.url));
      await captureNativeFile('native-map-details.png', new URL('../verification/native-map-details-api36.png', import.meta.url));
      pass('native pin tap/drag/numeric placement, draft restoration, visibility, student shelf routes, safe deletion, audit and admin permission boundaries');
    }
    if (!focus || focus === 'logbook') {
      const emptyActor = await createActor('logbook-empty');
      await api('service', `/rest/v1/profiles?id=eq.${emptyActor.id}`, 'PATCH', { verification_status: 'verified', full_name: 'Android QA empty logbook', department: 'Computer Science', year_of_study: 2 });
      const fixtures = [];
      for (const [index, actor] of [owner, borrower, owner, owner, owner].entries()) {
        const item = (await api(actor, '/rest/v1/items', 'POST', { owner_id: actor.id, category_id: categories[0].id,
          title: `Android QA logbook ${runId} ${index}`, description: 'Isolated logbook parity fixture', max_loan_days: 14 }))[0];
        nativeLogbookItems.push(item.id); fixtures.push(item);
      }
      const approve = async (item, requester, lender) => {
        const request = (await api(requester, '/rest/v1/borrow_requests', 'POST', { item_id: item.id, borrower_id: requester.id, start_date: today, end_date: end }))[0];
        await rpc(lender, 'approve_request', { p_request_id: request.id });
        return (await api(requester, `/rest/v1/loans?request_id=eq.${request.id}`))[0];
      };
      const borrowLoan = await approve(fixtures[0], borrower, owner);
      const lendLoan = await approve(fixtures[1], owner, borrower);
      // Direct synthetic history tests query limits, not 121 real handover workflows.
      // All reads/assertions remain authenticated as the normal native student.
      const historyClock = Date.now();
      await api('service', `/rest/v1/loans?id=eq.${lendLoan.id}`, 'PATCH', { created_at: new Date(historyClock - 200 * 86_400_000).toISOString() });
      const historyItems = Array.from({ length: 121 }, (_, index) => ({ id: randomUUID(), owner_id: owner.id,
        category_id: categories[0].id, title: `Android QA history ${runId} ${index}`, description: 'Synthetic historical query-limit fixture' }));
      nativeLogbookItems.push(...historyItems.map(item => item.id));
      await api(owner, '/rest/v1/items', 'POST', historyItems);
      const historyRequests = Array.from({ length: 121 }, (_, index) => {
        const created = new Date(historyClock - (123 - index) * 86_400_000);
        const date = created.toISOString().slice(0, 10);
        return { id: randomUUID(), item_id: historyItems[index].id, borrower_id: borrower.id,
          start_date: date, end_date: date, status: 'approved', created_at: created.toISOString() };
      });
      await api('service', '/rest/v1/borrow_requests', 'POST', historyRequests);
      // The insert guard forces pending even for privileged fixture inserts. Keep
      // that guard enabled and transition only these known historical request IDs.
      for (let offset = 0; offset < historyRequests.length; offset += 50) {
        const ids = historyRequests.slice(offset, offset + 50).map(request => request.id).join(',');
        await api('service', `/rest/v1/borrow_requests?id=in.(${ids})`, 'PATCH', { status: 'approved' });
      }
      const historyLoans = historyRequests.map(request => ({
        id: randomUUID(), request_id: request.id, item_id: request.item_id, owner_id: owner.id, borrower_id: borrower.id,
        start_date: request.start_date, due_date: request.end_date, status: 'returned', created_at: request.created_at,
        pickup_confirmed_at: new Date(Date.parse(request.created_at) + 3_600_000).toISOString(),
        returned_at: new Date(Date.parse(request.created_at) + 7_200_000).toISOString(),
        return_confirmed_at: new Date(Date.parse(request.created_at) + 7_200_000).toISOString(),
      }));
      await api('service', '/rest/v1/loans', 'POST', historyLoans);
      const freedLoan = await approve(fixtures[3], outsider, owner);
      const notified = await rpc(borrower, 'join_waitlist', { p_item_id: fixtures[3].id, p_start: today, p_end: end });
      await rpc(owner, 'cancel_loan', { p_loan_id: freedLoan.id, p_reason: 'Synthetic logbook notification fixture' });
      assert.equal((await api(borrower, `/rest/v1/waitlist_entries?id=eq.${notified.id}`))[0].status, 'notified');
      const pending = (await api(borrower, '/rest/v1/borrow_requests', 'POST', { item_id: fixtures[4].id, borrower_id: borrower.id, start_date: today, end_date: end }))[0];
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebDashboard } = await import('./test-web-dashboard.mjs');
        await testWebDashboard({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL, email: `android-qa-borrower-${runId}@bennett.edu.in`,
          emptyEmail: `android-qa-logbook-empty-${runId}@bennett.edu.in`, password });
        pass('source dashboard loan tickets, counted tabs and category grid captured at phone/tablet widths');
        const { testWebLogbook } = await import('./test-web-logbook.mjs');
        await testWebLogbook({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL, email: `android-qa-borrower-${runId}@bennett.edu.in`, password });
        pass('source populated logbook borrowing/lending, notified waitlist and policy captured at phone/tablet widths');
      }
      const cleared = await resetQaApp();
      assert.equal(cleared.code, 0, 'Cannot reset dedicated logbook QA app');
      const logbook = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedLogbookTest',
        '-e', 'qaAdaptiveWindow', process.env.ANDROID_SERIAL.startsWith('emulator-') ? '1' : '0',
        '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaEmptyEmail', `android-qa-logbook-empty-${runId}@bennett.edu.in`,
        '-e', 'qaBorrowLoan', borrowLoan.id, '-e', 'qaLendLoan', lendLoan.id,
        '-e', 'qaExcludedLoan', historyLoans[0].id,
        '-e', 'qaWaitItem', fixtures[2].id, '-e', 'qaWaitTitle', fixtures[2].title.replaceAll(' ', '_'),
        '-e', 'qaNotifiedEntry', notified.id, '-e', 'qaPendingRequest', pending.id,
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(logbook.output);
      await writeFile(new URL('../verification/hosted-native-logbook.txt', import.meta.url), report); printSummary(report);
      if (!/OK \(1 test\)/.test(report) || /INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report)) {
        await captureNativeFile('native-logbook-failure.png', new URL('../verification/native-logbook-failure.png', import.meta.url))
          .catch(error => console.log(`Logbook failure capture unavailable: ${error.message}`));
        const stages = await runAdb(['logcat', '-d', '-s', 'BorrowBuddyQa:I', '*:S']);
        await writeFile(new URL('../verification/logbook-failure-stages.txt', import.meta.url), redact(stages.output));
      }
      assert.equal(logbook.code, 0, 'Native logbook command failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native logbook must complete one passing test');
      const historyReport = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-loan-history.json']);
      assert.equal(historyReport.code, 0);
      const historyCounts = JSON.parse(historyReport.output);
      assert.deepEqual(historyCounts, { borrowerRows: 60, ownerRows: 1, totalRows: 61, uniqueRows: 61, olderOwnerLoanVisible: true, oldBorrowerExcluded: true,
        counterpartOwnerRows: 60, counterpartBorrowerRows: 1, counterpartReadRespectsRls: true });
      await writeFile(new URL('../verification/native-loan-history.json', import.meta.url), JSON.stringify(historyCounts, null, 2));
      for (const name of ['active', 'waitlist', 'policy', 'empty']) await captureNativeFile(`native-logbook-${name}.png`, new URL(`../verification/native-logbook-${name}-api36.png`, import.meta.url));
      for (const name of ['dashboard', 'dashboard-lending', 'dashboard-empty', ...(process.env.ANDROID_SERIAL.startsWith('emulator-') ? ['dashboard-wide'] : [])]) await captureNativeFile(`native-logbook-${name}.png`, new URL(`../verification/native-${name}-api36.png`, import.meta.url));
      assert.equal((await api(borrower, `/rest/v1/borrow_requests?id=eq.${pending.id}`))[0].status, 'cancelled');
      const entries = await api(borrower, `/rest/v1/waitlist_entries?item_id=in.(${fixtures[2].id},${fixtures[3].id})`);
      assert.equal(entries.length, 2); assert(entries.every(entry => entry.status === 'cancelled'));
      pass('native independent loan role limits with 121 historical fixtures, borrowing/lending logbook, real waitlist join/leave, cancellation, rotation, policy and empty browse');
      await removeFixtureItems(nativeLogbookItems);
    }
    if (!focus || focus === 'chat') {
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebChatEmptyList } = await import('./test-web-chat.mjs');
        const empty = await testWebChatEmptyList({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
          email: `android-qa-outsider-${runId}@bennett.edu.in`, password });
        console.log(empty.measured ? 'SOURCE chat empty list measured at three widths' : `SOURCE chat empty-list reference unavailable: ${empty.reason}`);
      }
      const room = await rpc(admin, 'create_community_conversation', { p_title: `Android QA chat ${runId}` });
      nativeChatRooms.push(room.id);
      const emptyRoom = await rpc(admin, 'create_community_conversation', { p_title: `Android QA empty chat ${runId}` });
      nativeChatRooms.push(emptyRoom.id);
      const history = Array.from({ length: 130 }, (_, index) => ({
        id: randomUUID(), conversation_id: conversation, sender_id: index === 0 ? borrower.id : owner.id,
        body: `Native history ${String(index).padStart(3, '0')}`,
        // Shared timestamps exercise the UUID tie-breaker across page boundaries.
        created_at: new Date(Date.now() - 86_400_000 + Math.floor(index / 60) * 1000).toISOString(),
      }));
      await api(borrower, '/rest/v1/messages', 'POST', history.slice(0, 1));
      await api(owner, '/rest/v1/messages', 'POST', history.slice(1));
      const earliest = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
      await api(owner, '/rest/v1/messages', 'POST', Array.from({ length: 350 }, (_, index) => ({
        conversation_id: room.id, sender_id: owner.id, body: `Busy community fixture ${index}`,
      })));
      assert.equal((await api(borrower, `/rest/v1/conversation_members?conversation_id=eq.${room.id}`)).length, 0);
      const heads = await rpc(borrower, 'get_conversation_message_heads', {});
      assert.equal(heads.find(row => row.conversation_id === conversation).body, 'Android QA pickup coordination');
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebChat } = await import('./test-web-chat.mjs');
        await testWebChat({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
          email: `android-qa-borrower-${runId}@bennett.edu.in`, outsiderEmail: `android-qa-outsider-${runId}@bennett.edu.in`,
          password, phoneWidth, privateId: conversation, communityId: room.id, emptyId: emptyRoom.id });
        pass('website chat filters, history search, older history, copy, draft restoration, private access and responsive layout');
      }
      const cleared = await resetQaApp();
      assert(cleared.output.includes('Success'), 'Dedicated chat app reset failed');
      const chat = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedChatTest',
        '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`,
        '-e', 'qaOwnerEmail', `android-qa-owner-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaBorrowerId', borrower.id, '-e', 'qaConversationId', conversation,
        '-e', 'qaCommunityId', room.id, '-e', 'qaEarliestId', earliest.id,
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(chat.output);
      await writeFile(new URL('../verification/hosted-native-chat.txt', import.meta.url), report); printSummary(report);
      if (!/OK \(1 test\)/.test(report)) await captureNativeFile('native-chat-timeout.png', new URL('../verification/native-chat-timeout.png', import.meta.url)).catch(() => {});
      assert.equal(chat.code, 0, 'Native chat instrumentation command failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native chat must complete one passing test');
      const messages = await api(borrower, `/rest/v1/messages?conversation_id=eq.${conversation}&select=body`);
      assert.equal(messages.length, 137);
      const members = await api(borrower, `/rest/v1/conversation_members?conversation_id=eq.${room.id}`);
      assert.equal(members.length, 1); assert.equal(members[0].user_id, borrower.id); assert(members[0].last_read_at);
      assert.equal((await api(outsider, `/rest/v1/messages?conversation_id=eq.${conversation}`)).length, 0);
      const community = await api(borrower, `/rest/v1/messages?conversation_id=eq.${room.id}&body=eq.Community%20message%20from%20native%20UI`);
      assert.equal(community.length, 1); assert.equal(community[0].sender_id, borrower.id);
      assert(Date.parse(members[0].last_read_at) >= Date.parse(community[0].created_at), 'Community reader cursor must include the sent message');
      await writeFile(new URL('../verification/hosted-native-chat-state.json', import.meta.url), JSON.stringify({
        privateMessages: messages.length, communityReaderCursorsVisible: members.length,
        communitySent: community.length, privateOutsiderMessages: 0, historyLoaded: 131,
        lifecycleAndSocketReconnect: true, filteredRealtime: true,
      }, null, 2));
      await captureNativeFile('native-chat-community.png', new URL('../verification/native-chat-community-api36.png', import.meta.url));
      pass('native private/community chat, keyset history, both send actions, filtered realtime, rotation, stopped read cursor and socket reconnection');
      const originalSize = /Override size: (\d+x\d+)/.exec((await runAdb(['shell', 'wm', 'size'])).output)?.[1];
      const originalDensity = /Override density: (\d+)/.exec((await runAdb(['shell', 'wm', 'density'])).output)?.[1];
      const results = [];
      try { for (const { suffix, viewport } of [{ suffix: 'phone', viewport: phoneWidth }, ...(isolatedGallery ? [{ suffix: 'medium', viewport: 640 }, { suffix: 'wide', viewport: 1024 }] : [])]) {
        await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
        if (suffix !== 'phone') {
          assert.equal((await runAdb(['shell', 'wm', 'size', `${viewport}x838`])).code, 0);
          assert.equal((await runAdb(['shell', 'wm', 'density', '160'])).code, 0);
        }
        const reset = await resetQaApp(); assert(reset.output.includes('Success'));
        const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
          '-e', 'class', 'in.borrowbuddy.android.HostedChatPresentationTest', '-e', 'qaChatSize', suffix,
          '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
          '-e', 'qaPrivateId', conversation, '-e', 'qaCommunityId', room.id, '-e', 'qaEmptyRoomId', emptyRoom.id,
          '-e', 'qaOwnerId', owner.id, '-e', 'qaLoanId', loanId,
          'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
        const report = redact(native.output);
        await writeFile(new URL(`../verification/hosted-native-chat-${suffix}.txt`, import.meta.url), report); printSummary(report);
        if (!/OK \(1 test\)/.test(report)) await captureNativeFile(`native-chat-presentation-failure-${suffix}.png`, new URL(`../verification/native-chat-presentation-failure-${suffix}.png`, import.meta.url)).catch(() => {});
        assert.equal(native.code, 0); assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Chat presentation must complete one passing test');
        for (const name of ['list', 'private', 'empty-thread', 'community', 'empty-list']) await captureNativeFile(`native-chat-${name}-${suffix}.png`, new URL(`../verification/native-chat-${name}-${suffix}-api36.png`, import.meta.url));
        const result = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', `files/native-chat-presentation-${suffix}.json`]); assert.equal(result.code, 0);
        results.push(JSON.parse(result.output));
      } } finally {
        await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
        if (isolatedGallery) {
          await runAdb(['shell', 'wm', 'size', originalSize || 'reset']); await runAdb(['shell', 'wm', 'density', originalDensity || 'reset']);
        }
      }
      await writeFile(new URL('../verification/native-chat-presentation-result.json', import.meta.url), JSON.stringify(results, null, 2));
      pass('native chat filters, search, suggestions, message formatting, loan/profile navigation, keyboard, input limits and empty states');
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebChatSending } = await import('./test-web-chat.mjs');
        await testWebChatSending({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
          email: `android-qa-borrower-${runId}@bennett.edu.in`, outsiderEmail: `android-qa-outsider-${runId}@bennett.edu.in`,
          password, privateId: conversation, communityId: room.id });
        const sent = await api(owner, `/rest/v1/messages?conversation_id=eq.${conversation}&body=eq.${encodeURIComponent('Website QA private message\nSecond line')}`);
        assert.equal(sent.length, 1);
        pass('website private and public sends, private multiline persistence and public delivery to another session');
      }

    }
    if (!focus || focus === 'handover') {
    // Keep the resulting loan below the first owner viewport. Readiness must not
    // depend on a lazy offscreen status badge already being composed.
    const handoverPadding = await api(owner, '/rest/v1/items', 'POST', Array.from({ length: 12 }, (_, index) => ({
      owner_id: owner.id, category_id: categories[0].id, title: `Android QA handover shelf ${index} ${runId}`,
      description: 'Isolated owner scrolling fixture', max_loan_days: 14,
    })));
    nativeOwnerItems.push(...handoverPadding.map(item => item.id));
    // A separate item avoids the website's one-pending-request-per-item constraint
    // interfering with the catalog test above. All actions after this seed run in native UI.
    nativeItemId = (await api(owner, '/rest/v1/items', 'POST', {
      owner_id: owner.id, category_id: categories[0].id, title: `Android QA native handover ${runId}`,
      description: 'Isolated native handover fixture, automatically removed', max_loan_days: 14,
    }))[0].id;
    const nativeEnd = new Date(`${today}T12:00:00Z`); nativeEnd.setUTCDate(nativeEnd.getUTCDate() + 1);
    const nativeRequest = (await api(borrower, '/rest/v1/borrow_requests', 'POST', {
      item_id: nativeItemId, borrower_id: borrower.id, start_date: today,
      end_date: nativeEnd.toISOString().slice(0, 10), message: 'Synthetic native two-party handover QA',
    }))[0];
    const handover = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
      '-e', 'class', 'in.borrowbuddy.android.HostedLoanFlowTest',
      '-e', 'qaAdaptiveWindow', process.env.ANDROID_SERIAL.startsWith('emulator-') ? '1' : '0',
      '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`,
      '-e', 'qaOwnerEmail', `android-qa-owner-${runId}@bennett.edu.in`,
      '-e', 'qaPassword', password, '-e', 'qaRequestId', nativeRequest.id,
      'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
    const handoverReport = handover.output.replaceAll(password, '[QA PASSWORD REDACTED]').replaceAll(service, '[SERVER KEY REDACTED]').replaceAll(anon, '[PUBLIC KEY REDACTED]').replace(/android-qa-[a-z0-9-]+@bennett\.edu\.in/gi, '[QA EMAIL REDACTED]');
    await writeFile(new URL('../verification/hosted-native-handover.txt', import.meta.url), handoverReport);
    console.log(handoverReport.split('\n').filter(line => /INSTRUMENTATION_STATUS: (class|test|stack)=|INSTRUMENTATION_STATUS_CODE:|^OK \(|^Tests run:|^FAILURES/.test(line)).join('\n'));
    const handoverState = await api('service', `/rest/v1/loans?item_id=eq.${nativeItemId}&select=status,handover_attempts,return_attempts,pickup_confirmed_at,returned_at`);
    await writeFile(new URL('../verification/hosted-native-handover-state.json', import.meta.url), JSON.stringify(handoverState, null, 2));
    console.log(`Native handover database state: ${JSON.stringify(handoverState)}`);
    if (!/OK \(1 test\)/.test(handoverReport) || /INSTRUMENTATION_STATUS_CODE: -[1234]/.test(handoverReport)) {
      await captureNativeFile('hosted-loan-failure.png', new URL('../verification/hosted-loan-failure.png', import.meta.url)).catch(error => console.log(`Handover failure capture unavailable: ${error.message}`));
      const failedLoans = await api('service', `/rest/v1/loans?item_id=eq.${nativeItemId}&select=id`);
      if (failedLoans[0]) {
        const reviewState = await api('service', `/rest/v1/reviews?loan_id=eq.${failedLoans[0].id}&select=rating,role`);
        console.log(`Native handover review state: ${JSON.stringify(reviewState)}`);
      }
    }
    assert.equal(handover.code, 0, 'Native handover instrumentation command failed');
    assert(/OK \(1 test\)/.test(handoverReport) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(handoverReport), 'Native two-party handover must finish with one passing test');
    const nativeLoans = await api('service', `/rest/v1/loans?item_id=eq.${nativeItemId}`);
    assert.equal(nativeLoans.length, 1); assert.equal(nativeLoans[0].status, 'returned');
    const nativeReviews = await api('service', `/rest/v1/reviews?loan_id=eq.${nativeLoans[0].id}`);
    assert.equal(nativeReviews.length, 1); assert.equal(nativeReviews[0].rating, 4);
    for (const name of ['facts', 'returned', 'timeline']) await captureNativeFile(`native-loan-${name}.png`, new URL(`../verification/native-loan-${name}-api36.png`, import.meta.url));
    if (process.env.ANDROID_SERIAL.startsWith('emulator-')) for (const width of [768, 1024]) await captureNativeFile(`native-loan-facts-${width}.png`, new URL(`../verification/native-loan-facts-${width}-api36.png`, import.meta.url));
    if (process.env.BORROWBUDDY_QA_WEB_URL) {
      const { testWebLoan } = await import('./test-web-loan.mjs');
      await testWebLoan({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
        email: `android-qa-borrower-${runId}@bennett.edu.in`, password, loanId: nativeLoans[0].id });
      pass('source loan facts at phone/tablet widths and returned custody timeline captured');
    }
    pass('native owner approval, decoded QR tickets, rotation, persistent lockout/regeneration, pickup/return and review');
    }
    if (isolatedGallery && (!focus || focus === 'verification' || focus === 'admin-workflows')) {
      const student = await createActor('student', '');
      nativeStudentId = student.id;
      nativeMediaCleanups.push(async () => {
        const removed = await runAdb(['shell', 'content', 'delete', '--uri', 'content://media/external/images/media',
          '--where', `"_display_name='borrowbuddy-qa-${student.id}.png'"`]);
        assert.equal(removed.code, 0, 'Isolated native media cleanup failed');
        assert(!/Error|Exception/.test(removed.output), 'Isolated native media provider rejected cleanup');
      });
      const cleared = await resetQaApp();
      assert(cleared.output.includes('Success'), 'Dedicated verification app reset failed');
      const verification = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedVerificationTest',
        '-e', 'qaStudentEmail', `android-qa-student-${runId}@bennett.edu.in`,
        '-e', 'qaAdminEmail', `android-qa-admin-${runId}@bennett.edu.in`,
        '-e', 'qaPassword', password, '-e', 'qaStudentId', student.id,
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(verification.output);
      await writeFile(new URL('../verification/hosted-native-verification.txt', import.meta.url), report);
      printSummary(report);
      assert.equal(verification.code, 0, 'Native verification instrumentation command failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native verification must complete one passing test');
      const state = (await api('service', `/rest/v1/profiles?id=eq.${student.id}&select=verification_status,is_admin,department,year_of_study,student_id_path`))[0];
      assert.equal(state.verification_status, 'verified'); assert.equal(state.is_admin, false);
      assert(state.student_id_path, 'Native ID submission must persist its private path');
      await api(outsider, `/storage/v1/object/sign/student-ids/${state.student_id_path}`, 'POST', { expiresIn: 60 }, false);
      const audit = await api('service', `/rest/v1/audit_log?entity_id=eq.${student.id}&select=action&order=created_at`);
      for (const action of ['verification.rejected', 'verification.verified']) assert(audit.some(entry => entry.action === action));
      assert.equal(audit.filter(entry => entry.action === 'profile.student_id_submitted').length, 2);
      const { student_id_path: privatePath, ...verificationState } = state;
      await writeFile(new URL('../verification/hosted-native-verification-state.json', import.meta.url), JSON.stringify({ ...verificationState, audit: audit.map(entry => entry.action) }, null, 2));
      pass('native real photo picker, ID onboarding/private viewer, rotation, admin rejection/resubmission/approval and audit');
    }
    if (isolatedGallery && (!focus || focus === 'moderation' || focus === 'admin-workflows')) {
      const loanIds = [];
      nativeEvidenceUserId = borrower.id;
      for (const kind of ['damage', 'late', 'other']) {
        const fixture = (await api(owner, '/rest/v1/items', 'POST', {
          owner_id: owner.id, category_id: categories[0].id, title: `Android QA moderation ${kind} ${runId}`,
          description: 'Isolated native moderation fixture, automatically removed', max_loan_days: 14,
        }))[0];
        nativeModerationItems.push(fixture.id);
        const request = (await api(borrower, '/rest/v1/borrow_requests', 'POST', {
          item_id: fixture.id, borrower_id: borrower.id, start_date: today, end_date: end,
        }))[0];
        const loan = await rpc(owner, 'approve_request', { p_request_id: request.id });
        loanIds.push(loan.id);
        const token = await rpc(borrower, 'generate_handover_token', { p_loan_id: loan.id, p_kind: 'pickup' });
        assert.equal((await rpc(owner, 'confirm_handover_v2', { p_loan_id: loan.id, p_kind: 'pickup', p_token: token })).status, 'active');
      }
      nativeMediaCleanups.push(async () => {
        for (let index = 0; index < 2; index++) {
          const removed = await runAdb(['shell', 'content', 'delete', '--uri', 'content://media/external/images/media',
            '--where', `"_display_name='borrowbuddy-qa-moderation-${borrower.id}-${index}.png'"`]);
          assert.equal(removed.code, 0); assert(!/Error|Exception/.test(removed.output), 'Evidence media cleanup rejected');
        }
      });
      const cleared = await resetQaApp();
      assert(cleared.output.includes('Success'), 'Dedicated moderation app reset failed');
      const moderation = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedModerationTest',
        '-e', 'qaEmail', `android-qa-borrower-${runId}@bennett.edu.in`,
        '-e', 'qaAdminEmail', `android-qa-admin-${runId}@bennett.edu.in`,
        '-e', 'qaPassword', password, '-e', 'qaBorrowerId', borrower.id, '-e', 'qaLoanIds', loanIds.join(','),
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(moderation.output);
      await writeFile(new URL('../verification/hosted-native-moderation.txt', import.meta.url), report);
      printSummary(report);
      if (!/OK \(1 test\)/.test(report)) await captureNativeFile('native-moderation-viewer-failure.png',
        new URL('../verification/native-moderation-viewer-failure.png', import.meta.url)).catch(() => {});
      if (!/OK \(1 test\)/.test(report)) await captureNativeFile('native-moderation-login-failure.png',
        new URL('../verification/native-moderation-login-failure.png', import.meta.url)).catch(() => {});
      assert.equal(moderation.code, 0, 'Native moderation instrumentation command failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native moderation must complete one passing test');
      const incidents = await api('service', `/rest/v1/incidents?loan_id=in.(${loanIds.join(',')})&select=id,loan_id,type,status,photos:incident_photos(path)`);
      assert.equal(incidents.length, 3);
      assert.deepEqual(incidents.map(incident => incident.status).sort(), ['rejected', 'resolved', 'resolved']);
      const damage = incidents.find(incident => incident.type === 'damage'); assert.equal(damage.photos.length, 2);
      assert.equal((await api(outsider, `/rest/v1/incidents?loan_id=in.(${loanIds.join(',')})`)).length, 0);
      for (const photo of damage.photos) await api(outsider, `/storage/v1/object/sign/incident-photos/${photo.path}`, 'POST', { expiresIn: 60 }, false);
      const fines = await api('service', `/rest/v1/fines?loan_id=in.(${loanIds.join(',')})&select=id,amount,status,settled_at,settled_by`);
      assert.deepEqual(fines.map(fine => [fine.amount, fine.status]).sort((a,b) => a[0]-b[0]), [[250,'waived'],[750,'settled']]);
      assert(fines.every(fine => fine.settled_at && fine.settled_by === admin.id));
      const audit = await api('service', `/rest/v1/audit_log?entity_id=in.(${[...incidents.map(row => row.id), ...fines.map(row => row.id)].join(',')})&select=action`);
      for (const action of ['incident.opened', 'incident.resolved', 'incident.rejected', 'fine.settle', 'fine.waive']) assert(audit.some(entry => entry.action === action));
      await writeFile(new URL('../verification/hosted-native-moderation-state.json', import.meta.url), JSON.stringify({
        incidents: incidents.map(({type,status,photos}) => ({type,status,evidence:photos.length})),
        fines: fines.map(({amount,status,settled_at}) => ({amount,status,settled_at})), audit: audit.map(entry => entry.action)
      }, null, 2));
      pass('native multi-photo incidents, draft restoration, admin evidence/decisions, fine-linked loans/timestamps, offline settlement/waiver and audit');
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebIncident } = await import('./test-web-incident.mjs');
        const result = await testWebIncident({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
          email: `android-qa-borrower-${runId}@bennett.edu.in`, password, loanId: loanIds[2], png });
        const webIncident = (await api('service', `/rest/v1/incidents?loan_id=eq.${loanIds[2]}&select=id,description,photos:incident_photos(path)`))
          .find(incident => incident.description === result.description);
        assert(webIncident, 'Website Server Action must persist the report');
        assert.deepEqual(webIncident.photos.map(photo => photo.path).sort(), [...result.paths].sort());
        await writeFile(new URL('../verification/web-incident-state.json', import.meta.url), JSON.stringify({ submitted: true, evidence: webIncident.photos.length, restoredAfterBack: true }, null, 2));
        pass('website real upload paths survive step unmount/back and persist through the final Server Action');
      }
      // The website submission intentionally leaves a new open report. Remove
      // only this completed scenario's owned items/loans after all evidence,
      // privacy, fine and audit assertions, before later admin queue fixtures.
      const remainingReports = await api('service', `/rest/v1/incidents?loan_id=in.(${loanIds.join(',')})&status=eq.open&select=id`);
      assert.equal(remainingReports.length, process.env.BORROWBUDDY_QA_WEB_URL ? 1 : 0);
      const ownedCount = nativeModerationItems.length;
      await removeFixtureItems(nativeModerationItems);
      nativeModerationItems.length = 0;
      const afterCleanup = await api('service', `/rest/v1/incidents?loan_id=in.(${loanIds.join(',')})&select=id`);
      assert.equal(afterCleanup.length, 0, 'Completed moderation fixtures must not contaminate subsequent admin queues');
      await writeFile(new URL('../verification/native-moderation-phase-cleanup.json', import.meta.url), JSON.stringify({
        ownedItemsRemoved: ownedCount, openWebReportsBeforeCleanup: remainingReports.length, ownedIncidentsRemaining: afterCleanup.length,
      }, null, 2));
      console.log('PASS completed moderation fixtures removed before subsequent admin queue checks');
    }
    if (!focus || focus === 'inbox') {
      const student = await createActor('inbox', 'Android QA Inbox Student');
      const empty = await createActor('inbox-empty', 'Android QA Empty Inbox');
      for (const actor of [student, empty]) await api('service', `/rest/v1/profiles?id=eq.${actor.id}`, 'PATCH', {
        verification_status: 'verified', full_name: actor === student ? 'Android QA Inbox Student' : 'Android QA Empty Inbox', department: 'Design', year_of_study: 2,
      });
      const listings = await api(owner, '/rest/v1/items', 'POST', ['loan', 'available'].map(kind => ({ owner_id: owner.id, category_id: categories[0].id, title: `Android QA inbox ${kind} ${runId}` })));
      nativeOwnerItems.push(...listings.map(row => row.id));
      const request = (await api(student, '/rest/v1/borrow_requests', 'POST', { item_id: listings[0].id, borrower_id: student.id, start_date: today, end_date: today }))[0];
      const inboxLoan = await rpc(owner, 'approve_request', { p_request_id: request.id });
      const channel = (await api(student, `/rest/v1/conversations?loan_id=eq.${inboxLoan.id}`))[0];
      // Only this freshly created actor's automatically generated setup alerts.
      await api('service', `/rest/v1/notifications?user_id=eq.${student.id}`, 'DELETE');
      const clock = Date.now();
      const payloads = [{ loan_id: inboxLoan.id, item_id: listings[1].id, conversation_id: channel.id },
        { item_id: listings[1].id, conversation_id: channel.id }, { conversation_id: channel.id }, {}, { loan_id: { malformed: true }, item_id: 42 }];
      const rows = Array.from({ length: 42 }, (_, index) => ({ id: randomUUID(), user_id: student.id, type: 'new_review',
        title: index === 0 ? 'Loan handover update' : index === 1 ? 'Item shelf update' : index === 2 ? 'Conversation update' : `Inbox record ${index}`,
        body: index === 3 ? '' : `Synthetic notification ${index}. Requests, approvals and handovers stay in the original inbox.`,
        payload: payloads[index] ?? {}, read_at: index % 3 === 0 ? new Date(clock - 120_000).toISOString() : null,
        created_at: new Date(clock - (index + 1) * 60_000).toISOString(),
      }));
      await api('service', '/rest/v1/notifications', 'POST', rows);
      const foreign = (await api('service', '/rest/v1/notifications', 'POST', { user_id: outsider.id, type: 'new_review', title: 'Android QA other student private alert', payload: {}, body: 'Must remain unread' }))[0];
      assert.equal((await api(student, `/rest/v1/notifications?user_id=eq.${outsider.id}`)).length, 0);
      assert.equal((await api(student, `/rest/v1/notifications?id=eq.${foreign.id}`, 'PATCH', { read_at: new Date().toISOString() })).length, 0);
      await api(student, `/rest/v1/notifications?id=eq.${rows[0].id}`, 'PATCH', { user_id: outsider.id }, false);
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebInbox } = await import('./test-web-inbox.mjs');
        await testWebInbox({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL, email: `android-qa-inbox-${runId}@bennett.edu.in`, emptyEmail: `android-qa-inbox-empty-${runId}@bennett.edu.in`, password, phase: 'mixed', unread: 26 });
        pass('source mixed/empty inbox at phone/tablet widths with source link priority and 40-row window');
      }
      const cleared = await resetQaApp(); assert.equal(cleared.code, 0);
      const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r', '-e', 'class', 'in.borrowbuddy.android.HostedInboxTest',
        '-e', 'qaAdaptiveWindow', isolatedGallery ? '1' : '0',
        '-e', 'qaEmail', `android-qa-inbox-${runId}@bennett.edu.in`, '-e', 'qaEmptyEmail', `android-qa-inbox-empty-${runId}@bennett.edu.in`,
        '-e', 'qaPassword', password, '-e', 'qaStudentId', student.id, '-e', 'qaIds', rows.map(row => row.id).join(','),
        '-e', 'qaLoanId', inboxLoan.id, '-e', 'qaItemId', listings[1].id, '-e', 'qaConversationId', channel.id,
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = native.output.replaceAll(password, '[QA PASSWORD REDACTED]').replaceAll(service, '[SERVER KEY REDACTED]').replaceAll(anon, '[PUBLIC KEY REDACTED]').replace(/android-qa-[a-z0-9-]+@bennett\.edu\.in/gi, '[QA EMAIL REDACTED]');
      await writeFile(new URL('../verification/hosted-native-inbox.txt', import.meta.url), report); printSummary(report);
      if (!/OK \(1 test\)/.test(report)) await captureNativeFile('inbox-failure.png', new URL('../verification/inbox-failure.png', import.meta.url)).catch(() => {});
      assert.equal(native.code, 0); assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native inbox scenario must complete one passing test');
      for (const name of ['mixed', 'read', 'empty', ...(isolatedGallery ? ['wide'] : [])]) await captureNativeFile(`native-inbox-${name}.png`, new URL(`../verification/native-inbox-${name}-api36.png`, import.meta.url));
      for (const name of ['result', ...(isolatedGallery ? ['capture-checks'] : [])]) {
        const file = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', `files/native-inbox-${name}.json`]); assert.equal(file.code, 0);
        await writeFile(new URL(`../verification/native-inbox-${name}.json`, import.meta.url), file.output);
      }
      assert.equal((await api('service', `/rest/v1/notifications?user_id=eq.${student.id}&read_at=is.null`)).length, 0);
      assert.equal((await api('service', `/rest/v1/notifications?id=eq.${foreign.id}`))[0].read_at, null);
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebInbox } = await import('./test-web-inbox.mjs');
        await testWebInbox({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL, email: `android-qa-inbox-${runId}@bennett.edu.in`, password, phase: 'read', unread: 0 });
      }
      pass('native inbox whole-card loan/item/chat links, read-all beyond visible window, restored read state, empty inbox and cross-user read/update/reassignment denial');
      for (const item of listings) { await removeFixtureItem(item.id); nativeOwnerItems.splice(nativeOwnerItems.indexOf(item.id), 1); }
    }
    if (!focus || focus === 'ledger' || focus === 'admin-workflows') {
      const student = await createActor('ledger', 'Android QA Ledger Student');
      const empty = await createActor('ledger-empty', 'Android QA Empty Ledger');
      for (const actor of [student, empty]) await api('service', `/rest/v1/profiles?id=eq.${actor.id}`, 'PATCH', {
        verification_status: 'verified', full_name: actor === student ? 'Android QA Ledger Student' : 'Android QA Empty Ledger',
        department: 'Computer Science', year_of_study: actor === student ? 6 : 2,
      });
      const ledgerItem = (await api(owner, '/rest/v1/items', 'POST', {
        owner_id: owner.id, category_id: categories[0].id, title: `Android QA ledger loan ${runId}`,
      }))[0];
      nativeOwnerItems.push(ledgerItem.id);
      const request = (await api(student, '/rest/v1/borrow_requests', 'POST', {
        item_id: ledgerItem.id, borrower_id: student.id, start_date: today, end_date: today,
      }))[0];
      const ledgerLoan = await rpc(owner, 'approve_request', { p_request_id: request.id });
      const pickup = await rpc(student, 'generate_handover_token', { p_loan_id: ledgerLoan.id, p_kind: 'pickup' });
      assert.equal((await rpc(owner, 'confirm_handover_v2', { p_loan_id: ledgerLoan.id, p_token: pickup, p_kind: 'pickup' })).status, 'active');
      const returned = await rpc(owner, 'generate_handover_token', { p_loan_id: ledgerLoan.id, p_kind: 'return' });
      assert.equal((await rpc(student, 'confirm_handover_v2', { p_loan_id: ledgerLoan.id, p_token: returned, p_kind: 'return' })).status, 'returned');
      const pending = Array.from({ length: 52 }, (_, index) => ({
        id: randomUUID(), loan_id: ledgerLoan.id, user_id: student.id, amount: 10, source: 'other',
        reason: `Android QA queue position ${String(index).padStart(2, '0')}`, status: 'pending',
        created_at: new Date(Date.UTC(2000, 0, 1, 0, index)).toISOString(),
      }));
      const settled = { id: randomUUID(), loan_id: ledgerLoan.id, user_id: student.id, amount: 75, source: 'other', reason: 'Android QA settled history', status: 'settled', created_at: new Date(Date.now() - 60_000).toISOString() };
      const waived = { ...settled, id: randomUUID(), amount: 125, reason: 'Android QA waived history', status: 'waived', created_at: new Date(Date.now() - 120_000).toISOString() };
      await api('service', '/rest/v1/fines', 'POST', [...pending, settled, waived]);
      // Return completion recomputes trust; set the rounding fixture afterwards.
      await api('service', `/rest/v1/profiles?id=eq.${student.id}`, 'PATCH', { trust_score: 70.6 });
      let sourceAccountTitleHeight;
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebAccountLedger } = await import('./test-web-account-ledger.mjs');
        const measured = await testWebAccountLedger({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
          email: `android-qa-ledger-${runId}@bennett.edu.in`, emptyEmail: `android-qa-ledger-empty-${runId}@bennett.edu.in`, password });
        sourceAccountTitleHeight = measured.find(row => row.route === 'me' && row.viewport === 1024).heading.bounds.height;
        pass('source account and populated/empty ledger measured at phone/tablet widths');
      }
      const reset = await resetQaApp(); assert.equal(reset.code, 0);
      const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedAccountLedgerTest',
        '-e', 'qaAdaptiveWindow', isolatedGallery ? '1' : '0',
        '-e', 'qaEmail', `android-qa-ledger-${runId}@bennett.edu.in`,
        '-e', 'qaEmptyEmail', `android-qa-ledger-empty-${runId}@bennett.edu.in`,
        '-e', 'qaAdminEmail', `android-qa-admin-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaStudentId', student.id, '-e', 'qaPendingIds', pending.map(row => row.id).join(','),
        ...(sourceAccountTitleHeight ? ['-e', 'qaSourceTitleHeight', String(sourceAccountTitleHeight)] : []),
        '-e', 'qaSettledId', settled.id, '-e', 'qaWaivedId', waived.id,
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = native.output.replaceAll(password, '[QA PASSWORD REDACTED]').replaceAll(service, '[SERVER KEY REDACTED]').replaceAll(anon, '[PUBLIC KEY REDACTED]').replace(/android-qa-[a-z0-9-]+@bennett\.edu\.in/gi, '[QA EMAIL REDACTED]');
      await writeFile(new URL('../verification/hosted-native-account-ledger.txt', import.meta.url), report); printSummary(report);
      if (!/OK \(1 test\)/.test(report)) await captureNativeFile('account-ledger-failure.png', new URL('../verification/account-ledger-failure.png', import.meta.url)).catch(() => {});
      assert.equal(native.code, 0); assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Account/ledger scenario must complete one passing test');
      for (const name of ['account-phone', 'ledger-phone', 'empty-phone', ...(isolatedGallery ? ['account-wide', 'ledger-wide'] : [])]) await captureNativeFile(`native-account-ledger-${name}.png`, new URL(`../verification/native-account-ledger-${name}-api36.png`, import.meta.url));
      const result = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-account-ledger-result.json']); assert.equal(result.code, 0);
      await writeFile(new URL('../verification/native-account-ledger-result.json', import.meta.url), result.output);
      if (isolatedGallery) {
        const titleMetrics = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-account-ledger-title-metrics.json']); assert.equal(titleMetrics.code, 0);
        await writeFile(new URL('../verification/native-account-ledger-title-metrics.json', import.meta.url), titleMetrics.output);
        const captureChecks = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-account-ledger-capture-checks.json']); assert.equal(captureChecks.code, 0);
        await writeFile(new URL('../verification/native-account-ledger-capture-checks.json', import.meta.url), captureChecks.output);
      }
      const saved = (await api('service', `/rest/v1/profiles?id=eq.${student.id}&select=full_name,phone,department,year_of_study`))[0];
      assert.deepEqual(saved, { full_name: 'Android QA Ledger Updated', phone: '9876543210', department: 'Design', year_of_study: 6 });
      assert.equal((await api('service', `/rest/v1/fines?id=eq.${pending[0].id}&select=status`))[0].status, 'settled');
      pass('native account draft/save/error/navigation, personal ledger states, private rows and oldest-fifty admin queue replenishment');
      await removeFixtureItem(ledgerItem.id);
      nativeOwnerItems.splice(nativeOwnerItems.indexOf(ledgerItem.id), 1);
    }
    if (!focus || focus === 'profile') {
      const student = await createActor('profile-student', 'Mira Sharma');
      const reviewer = await createActor('profile-reviewer', 'Arjun Mehta');
      const empty = await createActor('profile-empty', '');
      nativeProfileSessions.push(student, reviewer, empty);
      for (const actor of [student, reviewer]) await api('service', `/rest/v1/profiles?id=eq.${actor.id}`, 'PATCH', { verification_status: 'verified', department: 'Computer Science', year_of_study: 3 });
      await api('service', `/rest/v1/profiles?id=eq.${empty.id}`, 'PATCH', { full_name: '', department: null, year_of_study: null, verification_status: 'rejected', created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() });
      const clock = Date.now();
      // Synthetic completed history exercises the source's public aggregate and
      // twenty-review window. Normal student sessions perform every read/review.
      const historyItems = Array.from({ length: 21 }, (_, index) => ({ id: randomUUID(), owner_id: index === 20 ? reviewer.id : student.id, category_id: categories[0].id,
        title: `Android QA profile history ${runId} ${index}`, status: 'available' }));
      nativeProfileItems.push(...historyItems.map(row => row.id));
      await api('service', '/rest/v1/items', 'POST', historyItems);
      const requests = Array.from({ length: 21 }, (_, index) => {
        const created = new Date(clock - (30 - index) * 86_400_000).toISOString();
        return { id: randomUUID(), item_id: historyItems[index].id, borrower_id: index === 20 ? student.id : reviewer.id,
          start_date: created.slice(0, 10), end_date: created.slice(0, 10), created_at: created };
      });
      await api('service', '/rest/v1/borrow_requests', 'POST', requests);
      await api('service', `/rest/v1/borrow_requests?id=in.(${requests.map(row => row.id).join(',')})`, 'PATCH', { status: 'approved' });
      const loans = requests.map((request, index) => ({ id: randomUUID(), request_id: request.id, item_id: request.item_id,
        owner_id: index === 20 ? reviewer.id : student.id, borrower_id: request.borrower_id, start_date: request.start_date, due_date: request.end_date,
        status: 'returned', created_at: request.created_at, pickup_confirmed_at: request.created_at,
        returned_at: request.created_at, return_confirmed_at: request.created_at }));
      await api('service', '/rest/v1/loans', 'POST', loans);
      await api('service', `/rest/v1/items?id=in.(${historyItems.map(row => row.id).join(',')})`, 'PATCH', { status: 'paused' });
      const reviews = loans.map((loan, index) => ({ id: randomUUID(), loan_id: loan.id, reviewer_id: reviewer.id, reviewee_id: student.id,
        role: index === 20 ? 'as_owner' : 'as_borrower', rating: index === 0 ? 1 : 4,
        comment: index === 20 ? 'Reliable\n  equipment' : index === 19 ? null : index === 18 ? '' : `Careful borrower ${index}`,
        created_at: new Date(clock - (21 - index) * 60_000).toISOString() }));
      await api(reviewer, '/rest/v1/reviews', 'POST', reviews);
      await api('service', `/rest/v1/profiles?id=eq.${student.id}`, 'PATCH', { trust_score: 87.5, created_at: new Date(clock - 2 * 3_600_000).toISOString() });
      const listings = Array.from({ length: 16 }, (_, index) => ({ id: randomUUID(), owner_id: student.id, category_id: categories[0].id,
        title: `Android QA profile listing ${index.toString().padStart(2, '0')}`, description: 'Original campus equipment, carefully maintained.',
        status: index === 14 ? 'paused' : index === 15 ? 'retired' : 'available',
        created_at: new Date(clock - (16 - index) * 60_000).toISOString(), deposit_amount: index % 2 ? 250 : 0 }));
      nativeProfileItems.push(...listings.map(row => row.id));
      await api(student, '/rest/v1/items', 'POST', listings);
      const summary = (await rpc(reviewer, 'get_public_profile_stats', { p_profile_id: student.id }))[0];
      assert.equal(summary.completed_loans, 21); assert.equal(summary.review_count, 21);
      assert.equal(Number(summary.rating_average).toFixed(1), '3.9');
      pass('normal-credential public aggregate includes all twenty-one completed loans/reviews');
      let source, sourceFailure;
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        try {
        const { testWebPublicProfile } = await import('./test-web-public-profile.mjs');
        source = await testWebPublicProfile({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL, phoneWidth,
          email: `android-qa-profile-reviewer-${runId}@bennett.edu.in`, adminEmail: `android-qa-admin-${runId}@bennett.edu.in`, password, studentId: student.id, emptyId: empty.id,
          newestItemId: listings[13].id, excludedItemId: listings[1].id, studentEmail: `android-qa-profile-student-${runId}@bennett.edu.in` });
        pass('source public profiles measured at phone/tablet widths with twenty reviews, twelve listings, aggregate stars, empty/unverified state and membership cards');
        } catch (failure) { sourceFailure = failure; console.log('FAIL source public-profile checks; continuing independent native checks before reporting failure'); }
      }
      const originalSize = /Override size: (\d+x\d+)/.exec((await runAdb(['shell', 'wm', 'size'])).output)?.[1];
      const originalDensity = /Override density: (\d+)/.exec((await runAdb(['shell', 'wm', 'density'])).output)?.[1];
      const results = [];
      try { for (const { suffix, viewport } of [{ suffix: 'phone', viewport: phoneWidth }, ...(isolatedGallery ? [{ suffix: 'medium', viewport: 640 }, { suffix: 'wide', viewport: 1024 }] : [])]) {
        const wide = suffix !== 'phone';
        if (wide) {
          await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
          assert.equal((await runAdb(['shell', 'wm', 'size', `${viewport}x838`])).code, 0);
          assert.equal((await runAdb(['shell', 'wm', 'density', '160'])).code, 0);
        }
        const reset = await resetQaApp(); assert(reset.output.includes('Success'));
        const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r', '-e', 'class', 'in.borrowbuddy.android.HostedPublicProfileTest',
        '-e', 'qaWide', wide ? '1' : '0',
        '-e', 'qaViewport', String(viewport), '-e', 'qaProfileSize', suffix,
        '-e', 'qaEmail', `android-qa-profile-reviewer-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaAdminEmail', `android-qa-admin-${runId}@bennett.edu.in`,
        '-e', 'qaStudentId', student.id, '-e', 'qaEmptyId', empty.id, '-e', 'qaNewestItem', listings[13].id,
        '-e', 'qaNewestReview', reviews[20].id, '-e', 'qaNullReview', reviews[19].id, '-e', 'qaBlankReview', reviews[18].id,
        '-e', 'qaExcludedReview', reviews[0].id, '-e', 'qaExcludedItem', listings[1].id,
        ...(source && compareDefaultTextGeometry ? [
          '-e', 'qaPhoneTitleHeight', String(source.find(row => row.viewport === phoneWidth && row.state === 'populated').heading.bounds.height),
          '-e', 'qaSourceStatsWidth', String(source.find(row => row.viewport === phoneWidth && row.state === 'populated').stats.bounds.width),
          '-e', 'qaSourceAvatarWidth', String(source.find(row => row.state === 'populated' && row.viewport === viewport).initial.bounds.width),
          '-e', 'qaSourceIdentityHeight', String(source.find(row => row.state === 'populated' && row.viewport === viewport).identity.bounds.height),
        ] : []),
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
        const report = redact(native.output);
        await writeFile(new URL(`../verification/hosted-native-public-profile-${suffix}.txt`, import.meta.url), report); printSummary(report);
        if (!/OK \(1 test\)/.test(report)) await captureNativeFile('native-profile-failure.png', new URL('../verification/native-profile-failure.png', import.meta.url)).catch(() => {});
        assert.equal(native.code, 0); assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Public profile must complete one passing test');
        for (const name of ['identity', 'card', 'reviews', 'listings', 'empty']) {
          await captureNativeFile(`native-profile-${name}-${suffix}.png`, new URL(`../verification/native-profile-${name}-${suffix}-api36.png`, import.meta.url));
        }
        const result = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', `files/native-profile-result-${suffix}.json`]); assert.equal(result.code, 0);
        results.push(JSON.parse(result.output));
      } } finally {
        await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
        if (isolatedGallery) {
          await runAdb(['shell', 'wm', 'size', originalSize || 'reset']); await runAdb(['shell', 'wm', 'density', originalDensity || 'reset']);
        }
      }
      await writeFile(new URL('../verification/native-profile-result.json', import.meta.url), JSON.stringify(results, null, 2));
      pass('native source public identity, original fonts/stars, query windows, safe projection, both review roles, empty/unverified state, listing navigation and restoration');
      if (sourceFailure) throw sourceFailure;
    }
    if (!focus || focus === 'admin' || focus === 'admin-source') {
      const pendingStudent = await createActor('admin-layout-student', 'Mira Sharma');
      const missingStudent = await createActor('admin-layout-missing', 'Aditi Rao');
      await api('service', `/rest/v1/profiles?id=eq.${pendingStudent.id}`, 'PATCH', { email: `qa-${pendingStudent.id.slice(0,8)}@bennett.edu.in`, department: 'Computer Science', year_of_study: 3 });
      await api('service', `/rest/v1/profiles?id=eq.${missingStudent.id}`, 'PATCH', { email: `qa-${missingStudent.id.slice(0,8)}@bennett.edu.in` });
      const idPath = `${pendingStudent.id}/${randomUUID()}.png`;
      let upload = await fetch(`${base}/storage/v1/object/student-ids/${idPath}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${pendingStudent.token}`, 'Content-Type': 'image/png' }, body: png, signal: AbortSignal.timeout(30_000) });
      assert(upload.ok); objects.push({ bucket: 'student-ids', path: idPath });
      await rpc(pendingStudent, 'submit_student_id', { p_path: idPath });
      const fixture = (await api(owner, '/rest/v1/items', 'POST', { owner_id: owner.id, category_id: categories[0].id, title: 'Android QA admin camera', description: 'Isolated admin layout fixture', max_loan_days: 14 }))[0];
      nativeModerationItems.push(fixture.id);
      const request = (await api(borrower, '/rest/v1/borrow_requests', 'POST', { item_id: fixture.id, borrower_id: borrower.id, start_date: today, end_date: end }))[0];
      const adminLoan = await rpc(owner, 'approve_request', { p_request_id: request.id });
      const token = await rpc(borrower, 'generate_handover_token', { p_loan_id: adminLoan.id, p_kind: 'pickup' });
      await rpc(owner, 'confirm_handover_v2', { p_loan_id: adminLoan.id, p_kind: 'pickup', p_token: token });
      const photoPath = `${borrower.id}/${randomUUID()}.png`;
      upload = await fetch(`${base}/storage/v1/object/incident-photos/${photoPath}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${borrower.token}`, 'Content-Type': 'image/png' }, body: png, signal: AbortSignal.timeout(30_000) });
      assert(upload.ok); objects.push({ bucket: 'incident-photos', path: photoPath });
      const incident = await rpc(borrower, 'open_incident', { p_loan_id: adminLoan.id, p_type: 'damage', p_description: 'The camera lens was scratched during the loan. Please review both parties and the supplied evidence.', p_photo_paths: [photoPath] });
      const fineIncident = await rpc(owner, 'open_incident', { p_loan_id: adminLoan.id, p_type: 'late', p_description: 'Isolated admin fine fixture, reviewed with both parties.' });
      const incidentIds = [incident.id];
      for (let index = 0; index < 31; index++) incidentIds.push((await rpc(borrower, 'open_incident', { p_loan_id: adminLoan.id, p_type: 'other', p_description: `Isolated history report ${index}; preserved beyond the source thirty-row window.` })).id);
      await rpc(admin, 'resolve_incident', { p_incident_id: fineIncident.id, p_decision: 'resolved', p_resolution_note: 'Synthetic agreed late return charge.', p_fine_amount: 750, p_fine_user_id: borrower.id });
      const fine = (await api(admin, `/rest/v1/fines?loan_id=eq.${adminLoan.id}&status=eq.pending`))[0]; assert(fine);
      const pinName = `Android QA admin layout ${runId}`; nativePinNames.push(pinName);
      const layoutPin = await rpc(admin, 'admin_save_pickup_location', { p_id: null, p_name: pinName, p_description: 'Camera pickup desk', p_xp: 38.8, p_yp: 44.4, p_map_label: 'left', p_is_active: true });
      let source, nativeAdminResults;
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebAdmin } = await import('./test-web-admin.mjs');
        source = await testWebAdmin({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL, email: `android-qa-admin-${runId}@bennett.edu.in`, password, phoneWidth,
          state: 'populated', pendingId: pendingStudent.id, incidentId: incident.id, fineId: fine.id, pinId: layoutPin.id });
        pass('source populated admin verification, private evidence, incident/fine controls, map summaries and pin editor measured at three widths');
      }
      if (focus !== 'admin-source') {
        const originalSize = /Override size: (\d+x\d+)/.exec((await runAdb(['shell', 'wm', 'size'])).output)?.[1];
        const originalDensity = /Override density: (\d+)/.exec((await runAdb(['shell', 'wm', 'density'])).output)?.[1];
        const results = [];
        try { for (const { suffix, viewport } of [{ suffix: 'phone', viewport: phoneWidth }, ...(isolatedGallery ? [{ suffix: 'medium', viewport: 640 }, { suffix: 'wide', viewport: 1024 }] : [])]) {
          await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
          if (suffix !== 'phone') { assert.equal((await runAdb(['shell', 'wm', 'size', `${viewport}x838`])).code, 0); assert.equal((await runAdb(['shell', 'wm', 'density', '160'])).code, 0); }
          assert((await resetQaApp()).output.includes('Success'));
          const measured = source?.find(row => row.width === viewport);
          const layout = measured ? { ...Object.fromEntries(['root','heading','verification','incident','fine'].map(key => [key, { bounds: measured[key].bounds }])), pinMap: measured.pinForm.map } : undefined;
          const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r', '-e', 'class', 'in.borrowbuddy.android.HostedAdminPresentationTest',
            '-e', 'qaEmail', `android-qa-admin-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
            '-e', 'qaPendingId', pendingStudent.id, '-e', 'qaMissingId', missingStudent.id, '-e', 'qaIncidentId', incident.id,
            '-e', 'qaFineId', fine.id, '-e', 'qaPinId', layoutPin.id, '-e', 'qaSize', suffix,
            ...(layout && compareDefaultTextGeometry ? ['-e', 'qaSourceLayout', Buffer.from(JSON.stringify(layout)).toString('base64')] : []),
            'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
          const report = redact(native.output); await writeFile(new URL(`../verification/hosted-native-admin-${suffix}.txt`, import.meta.url), report); printSummary(report);
          if (!/OK \(1 test\)/.test(report)) {
            await captureNativeFile(`native-admin-failure-${suffix}.png`, new URL(`../verification/native-admin-failure-${suffix}.png`, import.meta.url)).catch(() => {});
            const stage = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-admin-stage.txt']);
            if (stage.code === 0) await writeFile(new URL('../verification/native-admin-failure-stage.txt', import.meta.url), stage.output);
          }
          assert.equal(native.code, 0); assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native admin layout must finish one passing test');
          for (const name of ['verification','incident','fine','pins','pin-editor','empty']) await captureNativeFile(`native-admin-${name}-${suffix}.png`, new URL(`../verification/native-admin-${name}-${suffix}-api36.png`, import.meta.url));
          const result = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', `files/native-admin-result-${suffix}.json`]); assert.equal(result.code, 0); results.push(JSON.parse(result.output));
        } } finally {
          await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
          if (isolatedGallery) {
            await runAdb(['shell', 'wm', 'size', originalSize || 'reset']); await runAdb(['shell', 'wm', 'density', originalDensity || 'reset']);
          }
        }
        nativeAdminResults = results;
        await writeFile(new URL('../verification/native-admin-result.json', import.meta.url), JSON.stringify(results, null, 2));
        pass('native source admin layouts, private evidence, saved drafts, input limits, invalid resolution, source thirty-row window with retained older access and empty states');
      }
      await rpc(admin, 'admin_set_verification', { p_profile_id: pendingStudent.id, p_status: 'verified' });
      await rpc(admin, 'admin_set_verification', { p_profile_id: missingStudent.id, p_status: 'verified' });
      for (const id of incidentIds) await rpc(admin, 'resolve_incident', { p_incident_id: id, p_decision: 'rejected', p_resolution_note: 'Synthetic evidence layout check completed.' });
      await rpc(admin, 'settle_fine', { p_fine_id: fine.id, p_action: 'waive' });
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebAdmin } = await import('./test-web-admin.mjs');
        const emptySource = await testWebAdmin({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL, email: `android-qa-admin-${runId}@bennett.edu.in`, password, phoneWidth, state: 'empty', pinId: layoutPin.id });
        for (const native of nativeAdminResults || []) {
          const width = { phone: 411, medium: 640, wide: 1024 }[native.size];
          const measured = emptySource.find(row => row.width === width);
          assert(Math.abs(native.emptyIncidentHeightDp - measured.sections[1].panel.bounds.height) <= 3, `Source empty incident panel at ${width}`);
          assert(Math.abs(native.emptyFineHeightDp - measured.sections[2].panel.bounds.height) <= 3, `Source empty fine panel at ${width}`);
        }
        pass('source empty verification, incident and fine sections measured without changing existing user data');
      }
    }
    if (!focus || focus === 'owner') {
      // Separate actors keep the owner desk deterministic even after the large-history
      // and header-count scenarios. No existing profile or listing is reused here.
      const deskOwner = await createActor('desk-owner', 'Android QA desk owner');
      const deskBorrower = await createActor('desk-borrower', 'Android QA desk borrower');
      const emptyOwner = await createActor('desk-empty', 'Android QA empty owner');
      for (const actor of [deskOwner, deskBorrower, emptyOwner]) await api('service', `/rest/v1/profiles?id=eq.${actor.id}`, 'PATCH', {
        verification_status: 'verified', department: 'Computer Science', year_of_study: 2,
      });
      // Verification recomputes reputation; set only this isolated fractional-score
      // fixture afterwards so source/native rounding is actually exercised.
      await api('service', `/rest/v1/profiles?id=eq.${deskBorrower.id}`, 'PATCH', { trust_score: 70.6 });
      const deskImagePath = `${deskOwner.id}/owner-${runId}.png`;
      objects.push({ bucket: 'item-images', path: deskImagePath });
      const deskUpload = await fetch(`${base}/storage/v1/object/item-images/${deskImagePath}`, { method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${deskOwner.token}`, 'Content-Type': 'image/png' },
        body: png, signal: AbortSignal.timeout(30_000) });
      assert(deskUpload.ok, `Owner fixture image upload failed (${deskUpload.status})`); await deskUpload.text();
      const listings = [];
      for (const name of ['lens', 'charger', 'delete']) {
        const fixture = (await api(deskOwner, '/rest/v1/items', 'POST', {
          owner_id: deskOwner.id, category_id: categories[0].id, title: `Android QA owner ${name} ${runId}`,
          description: 'Isolated source/native owner desk fixture', max_loan_days: 14,
          deposit_amount: name === 'lens' ? 500 : 0, images: name === 'lens' ? [deskImagePath] : [],
        }))[0];
        listings.push(fixture); nativeOwnerItems.push(fixture.id);
      }
      for (let index = 0; index < 10; index++) {
        const request = (await api(deskBorrower, '/rest/v1/borrow_requests', 'POST', {
          item_id: listings[0].id, borrower_id: deskBorrower.id, start_date: today, end_date: end,
          message: `Previous isolated owner decision ${index}`,
        }))[0];
        await rpc(deskOwner, 'decline_request', { p_request_id: request.id, p_reason: `Previous QA decision ${index}` });
      }
      const pending = [];
      for (const fixture of listings.slice(0, 2)) pending.push((await api(deskBorrower, '/rest/v1/borrow_requests', 'POST', {
        item_id: fixture.id, borrower_id: deskBorrower.id, start_date: today, end_date: end,
        message: 'Please lend this for my campus project.',
      }))[0]);
      if (process.env.BORROWBUDDY_QA_WEB_URL) {
        const { testWebOwner } = await import('./test-web-owner.mjs');
        await testWebOwner({ baseUrl: process.env.BORROWBUDDY_QA_WEB_URL,
          email: `android-qa-desk-owner-${runId}@bennett.edu.in`, emptyEmail: `android-qa-desk-empty-${runId}@bennett.edu.in`,
          password, pendingCount: 2, itemCount: 3 });
        pass('source owner request/listing/recent-decision layouts measured at phone/tablet widths and empty first-listing navigation');
      }
      const reset = await resetQaApp();
      assert(reset.output.includes('Success'), 'Dedicated owner app reset failed');
      const native = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
        '-e', 'class', 'in.borrowbuddy.android.HostedOwnerDeskTest#ownerRequestsListingsDraftsControlsHistoryAndEmptyState',
        '-e', 'qaOwnerEmail', `android-qa-desk-owner-${runId}@bennett.edu.in`,
        '-e', 'qaEmptyEmail', `android-qa-desk-empty-${runId}@bennett.edu.in`, '-e', 'qaPassword', password,
        '-e', 'qaDeclineRequest', pending[0].id, '-e', 'qaApproveRequest', pending[1].id,
        '-e', 'qaCoverItem', listings[0].id, '-e', 'qaDeleteItem', listings[2].id, '-e', 'qaApproveItem', listings[1].id,
        '-e', 'qaItemCount', '3',
        'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
      const report = redact(native.output);
      await writeFile(new URL('../verification/hosted-native-owner.txt', import.meta.url), report); printSummary(report);
      const stage = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-owner-stage.txt']);
      if (stage.code === 0) await writeFile(new URL('../verification/native-owner-stage.txt', import.meta.url), redact(stage.output));
      if (!/OK \(1 test\)/.test(report)) await captureNativeFile('native-owner-failure.png',
        new URL('../verification/native-owner-failure.png', import.meta.url)).catch(() => {});
      assert.equal(native.code, 0, 'Owner instrumentation command failed');
      assert(/OK \(1 test\)/.test(report) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(report), 'Native owner desk must complete one passing test');
      for (const name of ['requests', 'listings', 'decisions', 'empty']) {
        await captureNativeFile(`native-owner-${name}.png`, new URL(`../verification/native-owner-${name}-api36.png`, import.meta.url));
      }
      const result = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-owner-result.json']);
      assert.equal(result.code, 0); await writeFile(new URL('../verification/native-owner-result.json', import.meta.url), result.output);
      if (process.env.ANDROID_SERIAL.startsWith('emulator-')) {
        const originalSize = /Override size: (\d+x\d+)/.exec((await runAdb(['shell', 'wm', 'size'])).output)?.[1];
        const originalDensity = /Override density: (\d+)/.exec((await runAdb(['shell', 'wm', 'density'])).output)?.[1];
        try {
          await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
          assert.equal((await runAdb(['shell', 'wm', 'size', '1024x838'])).code, 0);
          assert.equal((await runAdb(['shell', 'wm', 'density', '160'])).code, 0);
          assert((await resetQaApp()).output.includes('Success'));
          const wide = await runAdb(['shell', 'am', 'instrument', '--user', '0', '-w', '-r',
            '-e', 'class', 'in.borrowbuddy.android.HostedOwnerDeskTest#sourceOwnerWideLayoutInFreshProcess',
            '-e', 'qaOwnerWide', '1', '-e', 'qaOwnerEmail', `android-qa-desk-owner-${runId}@bennett.edu.in`,
            '-e', 'qaPassword', password, '-e', 'qaCoverItem', listings[0].id,
            'in.borrowbuddy.android.test/in.borrowbuddy.android.BorrowBuddyQaRunner']);
          const wideReport = redact(wide.output);
          await writeFile(new URL('../verification/hosted-native-owner-wide.txt', import.meta.url), wideReport); printSummary(wideReport);
          assert.equal(wide.code, 0); assert(/OK \(1 test\)/.test(wideReport) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(wideReport), 'Fresh-process owner tablet layout must pass');
          await captureNativeFile('native-owner-wide.png', new URL('../verification/native-owner-wide-api36.png', import.meta.url));
          const metrics = await runAdb(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/native-owner-wide-result.json']); assert.equal(metrics.code, 0);
          await writeFile(new URL('../verification/native-owner-wide-result.json', import.meta.url), metrics.output);
          pass('native owner tablet layout and decoded source cover/title geometry in a fresh process');
        } finally {
          await runAdb(['shell', 'am', 'force-stop', 'in.borrowbuddy.android']);
          await runAdb(['shell', 'wm', 'size', originalSize || 'reset']); await runAdb(['shell', 'wm', 'density', originalDensity || 'reset']);
        }
      }

      const decisions = await api(deskOwner, `/rest/v1/borrow_requests?id=in.(${pending.map(row => row.id).join(',')})&select=id,status,decline_reason`);
      assert.equal(decisions.find(row => row.id === pending[0].id).decline_reason, 'Cannot lend during this week.');
      assert.equal(decisions.find(row => row.id === pending[1].id).status, 'approved');
      assert.equal((await api(deskOwner, `/rest/v1/items?id=eq.${listings[2].id}`)).length, 0);
      assert.equal((await api(outsider, `/rest/v1/borrow_requests?item_id=eq.${listings[0].id}`)).length, 0);
      pass('native owner draft restoration, trimmed decline, approval/loan access, decoded covers, status/edit/delete controls, history guard, responsive layout and empty create flow');
    }
  }
} catch (failure) {
  workflowFailure = failure;
  // Cleanup must never erase the original transport/test failure from the report.
  console.error(`FAIL workflow before cleanup: ${redactDiagnostic(failure.stack ?? failure)}`);
} finally {
  // Only IDs created in this run are targeted. No broad deletion or real account changes.
  const errors = [];
  const cleanup = async (name, action) => { try { await action(); } catch (failure) { errors.push(name); console.error(`FAIL cleanup ${name}: ${redactDiagnostic(failure.message ?? failure)}`); } };
  for (const removeMedia of nativeMediaCleanups) await cleanup('native media', removeMedia);
  for (const name of nativePinNames) await cleanup('native pin', async () => {
    const pins = await api('service', `/rest/v1/pickup_locations?name=eq.${encodeURIComponent(name)}&select=id`);
    for (const pin of pins) {
      await api('service', `/rest/v1/audit_log?entity=eq.pickup_location&entity_id=eq.${pin.id}`, 'DELETE');
      await api('service', `/rest/v1/pickup_locations?id=eq.${pin.id}`, 'DELETE');
    }
  });
  for (const id of nativeChatRooms) await cleanup('native chat room', () => api('service', `/rest/v1/conversations?id=eq.${id}`, 'DELETE'));
  if (nativeStudentId) await cleanup('native student uploads', async () => {
    const files = await api('service', '/storage/v1/object/list/student-ids', 'POST', { prefix: nativeStudentId, limit: 100 });
    const prefixes = files.filter(file => file.id).map(file => `${nativeStudentId}/${file.name}`);
    if (prefixes.length) await api('service', '/storage/v1/object/student-ids', 'DELETE', { prefixes });
  });
  if (nativeEvidenceUserId) await cleanup('native incident evidence', async () => {
    const files = await api('service', '/storage/v1/object/list/incident-photos', 'POST', { prefix: nativeEvidenceUserId, limit: 100 });
    const prefixes = files.filter(file => file.id).map(file => `${nativeEvidenceUserId}/${file.name}`);
    if (prefixes.length) await api('service', '/storage/v1/object/incident-photos', 'DELETE', { prefixes });
  });
  for (const object of objects) await cleanup('storage', () => api('service', `/storage/v1/object/${object.bucket}`, 'DELETE', { prefixes: [object.path] }));
  for (const fixtureItem of [itemId, nativeItemId, nativePinItemId, ...nativeModerationItems, ...nativeShellItems, ...nativeOwnerItems].filter(Boolean)) {
    await cleanup('fixture item and loans', () => removeFixtureItem(fixtureItem));
  }
  await cleanup('logbook fixtures and loans', () => removeFixtureItems(nativeLogbookItems));
  await cleanup('public profile fixtures and loans', () => removeFixtureItems(nativeProfileItems));
  // Audit rows have ON DELETE SET NULL; delete only the fixture actors' rows first.
  if (users.length) await cleanup('audit', () => api('service', `/rest/v1/audit_log?actor_id=in.(${users.join(',')})`, 'DELETE'));
  // If a helper-denial regression ever writes as anon, remove only that fixture's audit entry.
  if (users.length) await cleanup('helper audit', () => api('service', `/rest/v1/audit_log?action=eq.qa.helper_denied&entity_id=in.(${users.join(',')})`, 'DELETE'));
  for (const actor of nativeProfileSessions) await cleanup('profile session revocation', async () => {
    const response = await fetch(`${base}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${actor.token}` }, signal: AbortSignal.timeout(30_000) });
    assert(response.ok || response.status === 401 || response.status === 403, 'Profile fixture session revocation failed');
  });
  for (const id of users.reverse()) await cleanup('auth user', () => api('service', `/auth/v1/admin/users/${id}`, 'DELETE'));
  assert.equal(errors.length, 0, `Fixture cleanup failed: ${errors.join(', ')}`);
  console.log('PASS targeted fixture cleanup');
}
if (workflowFailure) throw new Error('Workflow failed; the original redacted diagnostic is preserved above.');
console.log(`Completed ${steps.length} authenticated workflow checks.`);
