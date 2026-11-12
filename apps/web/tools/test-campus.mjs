// Opt-in hosted development tests. Every created identity/object is tracked and
// removed by exact ID; existing inventory and profiles are compared afterward.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { syntheticPng } from '../../android/tools/qa-image.mjs';

assert.equal(process.env.BORROWBUDDY_ALLOW_TEST_FIXTURES, '1');
const base = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY, server = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(base?.startsWith('https://') && anon && server);
const run = randomUUID(), password = `Qa!${randomUUID()}aA9`, actors = [], objects = [], fixtureItems = [], checks = [];
let browser, baseline, failure;
await mkdir('apps/web/verification', { recursive: true });
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
async function api(token, path, method = 'GET', body, reject = false) {
  const response = await fetch(base + path, { method, headers: { apikey: token === server ? server : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const text = await response.text(); const data = text ? JSON.parse(text) : null;
  if (reject) { assert(!response.ok || data?.ok === false, 'An unauthorized/invalid action unexpectedly succeeded'); return data; }
  assert(response.ok, `${method} ${path.split('?')[0]}: ${response.status} ${data?.message ?? ''}`);
  assert(data?.ok !== false, data?.error ?? 'Action rejected'); return data;
}
const rpc = (user, action, data, reject = false) => api(user.token, '/rest/v1/rpc/campus_api', 'POST', { p_action: action, p_data: data }, reject);
async function actor(label, status = 'verified', admin = false) {
  const email = `android-qa-campus-${label}-${run}@bennett.edu.in`;
  const u = await api(server, '/auth/v1/admin/users', 'POST', { email, password, email_confirm: true }); actors.push(u.id);
  await api(server, `/rest/v1/profiles?id=eq.${u.id}`, 'PATCH', { full_name: `Campus QA ${label}`, department: 'Computer Science', year_of_study: 2, verification_status: status, is_admin: admin });
  const session = await api(anon, '/auth/v1/token?grant_type=password', 'POST', { email, password }); return { id: u.id, email, token: session.access_token };
}
async function snapshot() { return Promise.all(['profiles?select=id', 'items?select=id,images,status', 'pickup_locations?select=id,name,is_active'].map(path => api(server, `/rest/v1/${path}&order=id`))); }
async function post(host, kind, category, location, hours = 48) {
  const id = randomUUID(), path = `${host.id}/${id}/test.png`;
  const response = await fetch(`${base}/storage/v1/object/campus-photos/${path}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${host.token}`, 'Content-Type': 'image/png' }, body: syntheticPng });
  assert(response.ok, 'Fixture photo upload failed'); objects.push(path);
  await rpc(host, 'save_post', { id, kind, title: `Campus QA ${kind} ${run}`, description: 'Detailed isolated campus integration fixture, removed after testing.', category_id: category, location: 'Library area', pickup_location_id: location, found_on: kind === 'found' ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()) : null, condition: kind === 'giveaway' ? 'good' : null, hold_hours: hours, identifying_notes: kind === 'found' ? 'Private finder mark: amber triangle inside the case.' : '', images: [path] }); return id;
}
try {
  baseline = await snapshot();
  const [host, recipient, other, admin, admin2, pending, suspended] = await Promise.all([actor('host'), actor('recipient'), actor('other'), actor('admin', 'verified', true), actor('admin-two', 'verified', true), actor('pending', 'pending'), actor('suspended', 'suspended')]);
  const category = (await api(server, '/rest/v1/categories?select=id&limit=1'))[0].id, location = (await api(server, '/rest/v1/pickup_locations?is_active=eq.true&select=id&limit=1'))[0].id;
  const found = await post(host, 'found', category, location);
  await api(anon, `/rest/v1/campus_posts?id=eq.${found}`, 'GET', undefined, true);
  for (const user of [pending, suspended]) { assert.equal((await api(user.token, `/rest/v1/campus_posts?id=eq.${found}`)).length, 0); await rpc(user, 'claim', { id: found, evidence: 'The private identifying mark is an amber triangle.' }, true); }
  assert.equal((await api(recipient.token, `/rest/v1/campus_post_notes?post_id=eq.${found}`)).length, 0);
  await rpc(host, 'claim', { id: found, evidence: 'Attempt to claim my own found item.' }, true);
  const claim = await rpc(recipient, 'claim', { id: found, evidence: 'The item has an amber triangle inside its case. Original Case Proof.' });
  assert.equal((await api(host.token, `/rest/v1/campus_claims?id=eq.${claim.id}`)).length, 0);
  assert.equal((await api(other.token, `/rest/v1/campus_claims?id=eq.${claim.id}`)).length, 0);
  assert((await api(admin.token, `/rest/v1/campus_claims?id=eq.${claim.id}`))[0].evidence.includes('Original Case Proof'));
  const ownClaim = await rpc(admin, 'claim', { id: found, evidence: 'Admin claiming this object, must not self-approve.' });
  await rpc(admin, 'review_claim', { id: ownClaim.id, decision: 'approve', reason: 'Should not approve my own claim.' }, true);
  await rpc(host, 'review_claim', { id: claim.id, decision: 'approve', reason: 'Finder is not authorized to approve.' }, true);
  const outcomes = await Promise.allSettled([rpc(admin, 'review_claim', { id: claim.id, decision: 'approve', reason: 'Private identifying details match the finder record.' }), rpc(admin2, 'review_claim', { id: ownClaim.id, decision: 'approve', reason: 'Competing approval must not create a second winner.' })]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  let transfer = (await api(server, `/rest/v1/campus_transfers?post_id=eq.${found}&status=eq.active`))[0];
  assert(transfer); const winner = transfer.recipient_id === recipient.id ? recipient : admin;
  pass('found-item evidence/notes privacy, verification gates, self-claim and self-approval denial, single concurrent approval');
  await rpc(other, 'generate_code', { id: transfer.id }, true); await rpc(host, 'generate_code', { id: transfer.id }, true);
  let secret = await rpc(winner, 'generate_code', { id: transfer.id });
  for (let i = 0; i < 5; i++) await rpc(host, 'confirm_code', { id: transfer.id, code: secret.code === '000000' ? '999999' : '000000' }, true);
  await rpc(host, 'confirm_code', { id: transfer.id, code: secret.code }, true);
  secret = await rpc(winner, 'generate_code', { id: transfer.id });
  await api(server, `/rest/v1/profiles?id=eq.${winner.id}`, 'PATCH', { verification_status: 'suspended' });
  await rpc(host, 'confirm_code', { id: transfer.id, code: secret.code }, true);
  await api(server, `/rest/v1/profiles?id=eq.${winner.id}`, 'PATCH', { verification_status: 'verified' });
  const completions = await Promise.allSettled([rpc(host, 'confirm_code', { id: transfer.id, code: secret.code }), rpc(host, 'confirm_code', { id: transfer.id, code: secret.code })]);
  assert.equal(completions.filter(row => row.status === 'fulfilled').length, 1);
  await rpc(host, 'confirm_code', { id: transfer.id, code: secret.code }, true);
  assert.equal((await api(winner.token, `/rest/v1/campus_transfers?id=eq.${transfer.id}`))[0].status, 'completed');
  pass('private six-digit collection codes, persistent five-attempt lockout, regeneration, completion and replay denial');
  const giveaways = []; for (const hours of [24, 48, 72]) giveaways.push(await post(host, 'giveaway', category, location, hours));
  const race = await Promise.allSettled([rpc(recipient, 'reserve', { id: giveaways[0] }), rpc(other, 'reserve', { id: giveaways[0] })]); assert.equal(race.filter(o => o.status === 'fulfilled').length, 1);
  const hold = (await api(server, `/rest/v1/campus_transfers?post_id=eq.${giveaways[0]}&status=eq.active`))[0]; const holder = hold.recipient_id === recipient.id ? recipient : other;
  assert.equal((await rpc(holder, 'reserve', { id: giveaways[0] })).id, hold.id);
  assert(Math.abs(new Date(hold.expires_at) - new Date(hold.created_at) - 24 * 3600000) < 1000);
  await rpc(host, 'reserve', { id: giveaways[1] }, true);
  const second = await rpc(recipient, 'reserve', { id: giveaways[1] }); const third = await rpc(other, 'reserve', { id: giveaways[2] });
  for (const [id, hours] of [[second.id, 48], [third.id, 72]]) { const row = (await api(server, `/rest/v1/campus_transfers?id=eq.${id}`))[0]; assert.equal(new Date(row.expires_at) - new Date(row.created_at), hours * 3600000); }
  pass('first-request reservation race, retry idempotence, self-reservation denial and exact 24/48/72-hour holds');
  const clientId = randomUUID(); await rpc(recipient, 'send_message', { id: second.id, client_id: clientId, body: 'Original Case message\nSecond line' }); await rpc(recipient, 'send_message', { id: second.id, client_id: clientId, body: 'Original Case message\nSecond line' });
  assert.equal((await api(host.token, `/rest/v1/campus_messages?transfer_id=eq.${second.id}`)).length, 1);
  assert.equal((await api(other.token, `/rest/v1/campus_messages?transfer_id=eq.${second.id}`)).length, 0);
  await rpc(other, 'send_message', { id: second.id, client_id: randomUUID(), body: 'Foreign write' }, true);
  await rpc(host, 'read_thread', { id: second.id });
  pass('separate private chat, original-case/newline preservation, exactly-once retries, membership isolation and read tracking');
  const day = new Date(Date.now() + 86400000); const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(day), weekday = new Date(`${date}T12:00:00+05:30`).getUTCDay();
  await rpc(host, 'save_schedule', { slot_minutes: 30, pickup_location_id: location, weekly: [{ day: weekday, start: '00:00', end: '23:30' }], exceptions: [] });
  let slots = await api(recipient.token, '/rest/v1/rpc/campus_slots', 'POST', { p_host: host.id, p_date: date }); assert(slots.length > 0);
  const slot = slots[0]; const bookingRace = await Promise.allSettled([rpc(recipient, 'book', { transfer_id: second.id, kind: 'collection', starts_at: slot.starts_at }), rpc(other, 'book', { transfer_id: third.id, kind: 'collection', starts_at: slot.starts_at })]); assert.equal(bookingRace.filter(o => o.status === 'fulfilled').length, 1);
  let appointment = (await api(server, `/rest/v1/campus_appointments?host_id=eq.${host.id}&status=eq.booked`))[0];
  assert.equal((await rpc(host, 'book', { transfer_id: appointment.transfer_id, kind: 'collection', starts_at: appointment.starts_at })).id, appointment.id);
  await rpc(host, 'save_schedule', { slot_minutes: 15, pickup_location_id: location, weekly: [{ day: weekday, start: '00:00', end: '23:30' }], exceptions: [{ date, blocked: true }] });
  assert.equal((await api(recipient.token, '/rest/v1/rpc/campus_slots', 'POST', { p_host: host.id, p_date: date })).length, 0);
  assert.equal((await api(host.token, `/rest/v1/campus_appointments?id=eq.${appointment.id}`))[0].status, 'booked');
  await rpc(host, 'cancel_appointment', { id: appointment.id });
  for (const minutes of [15, 30, 60]) { await rpc(host, 'save_schedule', { slot_minutes: minutes, pickup_location_id: location, weekly: [], exceptions: [{ date, blocked: false, start: '09:00', end: '12:00' }] }); const dates = await api(recipient.token, '/rest/v1/rpc/campus_slots', 'POST', { p_host: host.id, p_date: date }); assert.equal(dates.length, 180 / minutes); }
  await rpc(host, 'save_schedule', { slot_minutes: 30, pickup_location_id: location, weekly: [], exceptions: [{ date, blocked: false, start: '09:00', end: '12:00' }] });
  pass('weekly schedules, replacement/blocked dates, all slot lengths, concurrent booking exclusion, idempotence and preserved appointments');
  await api(server, `/rest/v1/campus_transfers?id=eq.${hold.id}`, 'PATCH', { expires_at: new Date(Date.now() - 3600000).toISOString() });
  const replacement = await rpc(hold.recipient_id === recipient.id ? other : recipient, 'reserve', { id: giveaways[0] }); assert.notEqual(replacement.id, hold.id);
  await rpc(holder, 'send_message', { id: hold.id, client_id: randomUUID(), body: 'Old conversation must be closed.' }, true);
  await rpc(recipient, 'cancel_transfer', { id: second.id, reason: 'Unable to collect this item now.' });
  assert.equal((await api(server, `/rest/v1/campus_posts?id=eq.${giveaways[1]}`))[0].status, 'open');
  await rpc(other, 'hide_post', { id: giveaways[1], reason: 'Foreign moderation is not authorized.' }, true);
  pass('authoritative expiry, new recipient/thread isolation, cancellation release and foreign moderation denial');
  // A second host proves the recipient calendar is global too, including role reversal.
  const alternatePost = await post(other, 'giveaway', category, location);
  const alternate = await rpc(recipient, 'reserve', { id: alternatePost });
  const contractFile = `apps/web/verification/campus-private-${run}.sql`;
  await writeFile(contractFile, `begin;
do $$ declare code jsonb; result jsonb; begin
 perform set_config('request.jwt.claim.sub','${recipient.id}',true);
 code:=public.campus_api('generate_code',jsonb_build_object('id','${alternate.id}'));
 assert char_length(code->>'code')=6;
 assert (code->>'expires_at')::timestamptz=now()+interval '15 minutes';
 update borrowbuddy_private.campus_codes set expires_at=now() where transfer_id='${alternate.id}';
 perform set_config('request.jwt.claim.sub','${other.id}',true);
 result:=public.campus_api('confirm_code',jsonb_build_object('id','${alternate.id}','code',code->>'code'));
 assert result->>'ok'='false' and result->>'error' like '%fresh%';
 update public.campus_transfers set expires_at=now() where id='${alternate.id}';
 perform set_config('request.jwt.claim.sub','${recipient.id}',true);
 result:=public.campus_api('generate_code',jsonb_build_object('id','${alternate.id}'));
 assert result->>'ok'='false';
 assert (select status='expired' from public.campus_transfers where id='${alternate.id}');
end $$; rollback;`);
  try {
    const diagnostic = execFileSync('powershell.exe', ['-NoProfile', '-Command', `npx --yes supabase@2.121.0 db query --linked --file '${contractFile}' --output json`], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    assert(!diagnostic.includes('ERROR'), 'Private deadline contract failed');
  } finally { await rm(contractFile, { force: true }); }
  pass('database-time exact expiry boundaries, fifteen-minute code lifetime, suspended recipient denial and competing collection confirmations');
  const overlapTarget = await rpc(recipient, 'reserve', { id: giveaways[1] });
  await rpc(other, 'save_schedule', { slot_minutes: 30, pickup_location_id: location, weekly: [], exceptions: [{ date, start: '09:00', end: '12:00' }] });
  slots = await api(recipient.token, '/rest/v1/rpc/campus_slots', 'POST', { p_host: host.id, p_date: date });
  const crossBooking = await rpc(recipient, 'book', { transfer_id: overlapTarget.id, kind: 'collection', starts_at: slots[0].starts_at });
  await rpc(recipient, 'book', { transfer_id: alternate.id, kind: 'collection', starts_at: slots[0].starts_at }, true);
  const blockedTime = slots[1].starts_at;
  await rpc(other, 'book', { transfer_id: third.id, kind: 'collection', starts_at: blockedTime });
  await rpc(recipient, 'book', { transfer_id: overlapTarget.id, kind: 'collection', starts_at: blockedTime }, true);
  assert.equal((await api(host.token, `/rest/v1/campus_appointments?id=eq.${crossBooking.id}`))[0].status, 'booked');
  const moved = await rpc(recipient, 'book', { transfer_id: overlapTarget.id, kind: 'collection', starts_at: slots[2].starts_at });
  assert.notEqual(moved.id, crossBooking.id);
  await api(server, `/rest/v1/campus_transfers?id=eq.${overlapTarget.id}`, 'PATCH', { expires_at: new Date(new Date(slots[3].ends_at).getTime() - 1).toISOString() });
  await rpc(recipient, 'book', { transfer_id: overlapTarget.id, kind: 'collection', starts_at: slots[3].starts_at }, true);
  await rpc(recipient, 'cancel_transfer', { id: overlapTarget.id, reason: 'Release the reserved slot for another student.' });
  assert.equal((await api(host.token, `/rest/v1/campus_appointments?id=eq.${moved.id}`))[0].status, 'cancelled');
  pass('cross-host recipient overlap prevention, failed reschedule rollback, successful reschedule, exact reservation deadline and cancellation releases');
  const revokePost = await post(host, 'found', category, location);
  const revokeClaim = await rpc(recipient, 'claim', { id: revokePost, evidence: 'The amber triangle is inside this particular case.' });
  const revokeTransfer = await rpc(admin, 'review_claim', { id: revokeClaim.id, decision: 'approve', reason: 'The private marks match this claim.' });
  const revokedCode = await rpc(recipient, 'generate_code', { id: revokeTransfer.id });
  await rpc(admin, 'revoke_claim', { id: revokeTransfer.id, reason: 'Further ownership verification is required.' });
  const newClaim = await rpc(other, 'claim', { id: revokePost, evidence: 'A second valid claimant has supplied the hidden identifying mark.' });
  const newTransfer = await rpc(admin, 'review_claim', { id: newClaim.id, decision: 'approve', reason: 'New private verification is complete.' });
  await rpc(recipient, 'generate_code', { id: newTransfer.id }, true);
  await rpc(host, 'confirm_code', { id: newTransfer.id, code: revokedCode.code }, true);
  await rpc(admin, 'hide_post', { id: revokePost, reason: 'Post removed after an isolated moderation test.' });
  assert.equal((await api(other.token, `/rest/v1/campus_posts?id=eq.${revokePost}`)).length, 0);
  assert.equal((await api(host.token, `/rest/v1/campus_posts?id=eq.${revokePost}`))[0].status, 'hidden');
  await rpc(other, 'send_message', { id: newTransfer.id, client_id: randomUUID(), body: 'This moderated transfer is read-only.' }, true);
  pass('audited admin revocation/hiding, recipient replacement, prior token isolation and closed-thread enforcement');
  const photo = objects[0];
  await api(recipient.token, `/storage/v1/object/sign/campus-photos/${photo}`, 'POST', { expiresIn: 60 });
  for (const user of [pending, suspended, { token: anon }]) await api(user.token, `/storage/v1/object/sign/campus-photos/${photo}`, 'POST', { expiresIn: 60 }, true);
  for (const table of ['campus_posts', 'campus_claims', 'campus_transfers', 'campus_messages', 'campus_schedules', 'campus_appointments']) await api(recipient.token, `/rest/v1/${table}`, 'POST', {}, true);
  assert.equal((await api(admin.token, `/rest/v1/campus_messages?transfer_id=eq.${alternate.id}`)).length, 0);
  const notices = await api(recipient.token, `/rest/v1/notifications?type=in.(campus_update,campus_message)`);
  assert(notices.length > 0);
  for (const notice of notices) {
    assert(!JSON.stringify(notice).includes('Original Case Proof'));
    if (notice.payload.campus_transfer_id) assert(!notice.payload.loan_id && !notice.payload.conversation_id);
  }
  assert(!(await api(recipient.token, '/rest/v1/rpc/campus_thread_heads', 'POST', {})).some(row => row.transfer_id === third.id));
  pass('private photo signing, anonymous/unverified/suspended denial, guarded writes, admin chat isolation and distinct evidence-free notification destinations');
  const item = (await api(host.token, '/rest/v1/items', 'POST', { owner_id: host.id, category_id: category, title: 'Campus isolated legacy loan test', description: 'Removed after normal credential handover regression.', condition: 'good', pickup_location_id: location, deposit_amount: 0, max_loan_days: 14 }))[0]; fixtureItems.push(item.id);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const due = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const request = (await api(recipient.token, '/rest/v1/borrow_requests', 'POST', { item_id: item.id, borrower_id: recipient.id, start_date: today, end_date: due }))[0];
  const legacyRpc = (user, name, data) => api(user.token, `/rest/v1/rpc/${name}`, 'POST', data);
  const loan = await legacyRpc(host, 'approve_request', { p_request_id: request.id });
  slots = await api(recipient.token, '/rest/v1/rpc/campus_slots', 'POST', { p_host: host.id, p_date: date });
  const pickup = await rpc(recipient, 'book', { loan_id: loan.id, kind: 'pickup', starts_at: slots.at(-1).starts_at });
  const loanCode = await legacyRpc(recipient, 'generate_handover_token', { p_loan_id: loan.id, p_kind: 'pickup' });
  assert.equal((await legacyRpc(host, 'confirm_handover_v2', { p_loan_id: loan.id, p_kind: 'pickup', p_token: loanCode })).status, 'active');
  assert.equal((await api(host.token, `/rest/v1/campus_appointments?id=eq.${pickup.id}`))[0].status, 'completed');
  await api(server, `/rest/v1/loans?id=eq.${loan.id}`, 'PATCH', { start_date: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10), due_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), status: 'overdue' });
  const fines = await api(server, `/rest/v1/fines?loan_id=eq.${loan.id}`);
  const returnBooking = await rpc(recipient, 'book', { loan_id: loan.id, kind: 'return', starts_at: slots.at(-1).starts_at });
  assert.deepEqual(await api(server, `/rest/v1/fines?loan_id=eq.${loan.id}`), fines);
  await rpc(recipient, 'cancel_appointment', { id: returnBooking.id });
  const returnCode = await legacyRpc(host, 'generate_handover_token', { p_loan_id: loan.id, p_kind: 'return' });
  assert.equal((await legacyRpc(recipient, 'confirm_handover_v2', { p_loan_id: loan.id, p_kind: 'return', p_token: returnCode })).status, 'returned');
  assert.equal(loan.handover_token_hash, null); assert.equal(loan.return_token_hash, null);
  const legacyThread = (await api(host.token, `/rest/v1/conversations?loan_id=eq.${loan.id}`))[0];
  await api(recipient.token, '/rest/v1/messages', 'POST', { conversation_id: legacyThread.id, sender_id: recipient.id, body: 'Legacy loan chat remains separate.' });
  assert.equal((await api(host.token, `/rest/v1/messages?conversation_id=eq.${legacyThread.id}`)).length, 1);
  pass('legacy loan approval/chat/codes, scheduled pickup completion, overdue return booking without fine changes, unscheduled return and older-client secret compatibility');
  if (process.env.BORROWBUDDY_QA_WEB_URL) {
    const historyStart = Date.now() - 600000;
    await api(recipient.token, '/rest/v1/messages', 'POST',
      Array.from({ length: 105 }, (_, index) => ({
        conversation_id: legacyThread.id,
        sender_id: recipient.id,
        body: `Long chat fixture ${index}`,
        created_at: new Date(historyStart + index * 1000).toISOString(),
      })));
    const require = createRequire(import.meta.url); const { chromium } = require(join(process.env.NODE_MODULES_PATH, 'playwright'));
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const { campusBrowser } = await import('./campus-browser.mjs');
    await campusBrowser({ browser, web: process.env.BORROWBUDDY_QA_WEB_URL, recipient, host, admin, password, api, server, objects, giveaway: giveaways[1], location, category, date, hiddenTransfer: revokeTransfer.id, loanThread: legacyThread.id, pass });
  }
} catch (e) { failure = String(e.stack ?? e).replaceAll(password, '[REDACTED]').replaceAll(server, '[REDACTED]').replaceAll(anon, '[REDACTED]'); }
finally {
  if (browser) await browser.close();
  for (const path of new Set(objects)) await api(server, '/storage/v1/object/campus-photos', 'DELETE', { prefixes: [path] });
  for (const id of fixtureItems) {
    for (const loan of await api(server, `/rest/v1/loans?item_id=eq.${id}&select=id`)) await api(server, `/rest/v1/notifications?payload->>loan_id=eq.${loan.id}`, 'DELETE');
    await api(server, `/rest/v1/loans?item_id=eq.${id}`, 'DELETE'); await api(server, `/rest/v1/items?id=eq.${id}`, 'DELETE');
  }
  if (actors.length) {
    const posts = await api(server, `/rest/v1/campus_posts?owner_id=in.(${actors.join(',')})&select=id`);
    for (const post of posts) {
      const claims = await api(server, `/rest/v1/campus_claims?post_id=eq.${post.id}&select=id`);
      const transfers = await api(server, `/rest/v1/campus_transfers?post_id=eq.${post.id}&select=id`);
      for (const claim of claims) await api(server, `/rest/v1/notifications?payload->>campus_claim_id=eq.${claim.id}`, 'DELETE');
      for (const transfer of transfers) await api(server, `/rest/v1/notifications?payload->>campus_transfer_id=eq.${transfer.id}`, 'DELETE');
      await api(server, `/rest/v1/notifications?payload->>campus_post_id=eq.${post.id}`, 'DELETE');
    }
    await api(server, `/rest/v1/campus_posts?owner_id=in.(${actors.join(',')})`, 'DELETE');
  }
  for (const id of actors) { await api(server, `/rest/v1/notifications?user_id=eq.${id}`, 'DELETE'); await api(server, `/rest/v1/audit_log?actor_id=eq.${id}`, 'DELETE'); await api(server, `/auth/v1/admin/users/${id}`, 'DELETE'); }
  if (baseline) assert.deepEqual(await snapshot(), baseline, 'Existing profiles, inventory and pickup locations must be unchanged');
  pass('targeted fixture cleanup and unchanged existing profiles/inventory/pickup locations');
  await writeFile('apps/web/verification/campus-result.json', JSON.stringify({ passed: !failure, checks, failure: failure ?? null }, null, 2));
}
if (failure) throw new Error(failure);
console.log(`Completed ${checks.length} campus checks.`);
