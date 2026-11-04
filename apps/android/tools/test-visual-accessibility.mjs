// Dedicated-emulator presentation checks. No database access, accounts or secrets.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const adb = process.env.BORROWBUDDY_QA_ADB, serial = process.env.ANDROID_SERIAL;
assert(adb && serial?.startsWith('emulator-'), 'Select an explicit dedicated QA emulator');
const suite = process.env.BORROWBUDDY_QA_VISUAL_SUITE ?? 'campus';
assert(['campus', 'header'].includes(suite), 'Unknown visual suite');
const prefix = suite === 'header' ? 'header-a11y' : 'parity-a11y';
const testClass = suite === 'header' ? 'HeaderAccessibilityTest' : 'VisualAccessibilityTest';
const run = randomUUID(), dir = 'apps/android/verification';
await mkdir(dir, { recursive: true });
async function execute(args, timeout = 180000, binary = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(adb, ['-s', serial, ...args], { windowsHide: true, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_ANON_KEY: '' } });
    const stdout = [], stderr = [];
    child.stdout.on('data', data => stdout.push(data)); child.stderr.on('data', data => stderr.push(data));
    const timer = setTimeout(() => { child.kill(); reject(new Error(`ADB timeout: ${args.slice(0, 3).join(' ')}`)); }, timeout);
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); resolve({ code, stdout: binary ? Buffer.concat(stdout) : Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }); });
  });
}
async function shell(...args) { const result = await execute(['shell', ...args]); assert.equal(result.code, 0, result.stderr); return result.stdout.trim(); }
assert.equal(await shell('getprop', 'ro.kernel.qemu'), '1', 'Display/font changes must only target the owned emulator');
const original = { size: /Override size: (\d+x\d+)/.exec(await shell('wm', 'size'))?.[1], density: /Override density: (\d+)/.exec(await shell('wm', 'density'))?.[1], font: await shell('settings', 'get', 'system', 'font_scale') };
const cases = [
  ...(suite === 'header' ? [{ name: 'narrow-100', size: '320x720', font: '1' }, { name: 'narrow-200', size: '320x720', font: '2' }] : []),
  { name: 'phone-100', size: '411x914', font: '1' },
  { name: 'phone-200', size: '411x914', font: '2' },
  { name: 'middle-200', size: '640x960', font: '2' },
  { name: 'tablet-100', size: '1024x838', font: '1' },
  { name: 'tablet-200', size: '1024x838', font: '2' },
  { name: 'short-200', size: '640x480', font: '2' },
].filter(item => !process.env.BORROWBUDDY_QA_A11Y_CASES || process.env.BORROWBUDDY_QA_A11Y_CASES.split(',').includes(item.name));
assert(cases.length, 'Unknown accessibility case');
const methods = (suite === 'header' ? ['studentHeaderReflowsWithoutOverlappingTargets', 'adminHeaderReflowsWithoutClippedCounts', 'keyboardReachesEveryHeaderRouteAndControl']
  : ['campusPrimaryContrastHeadingAndKeyboardFocus', 'offlineLargeTextPauseStatusAndKeyboardRecovery', 'scheduleLargeTextValidationDraftAndSave', 'confirmationKeepsBothActionsReachableAtLargeText'])
  .filter(name => !process.env.BORROWBUDDY_QA_A11Y_METHOD || process.env.BORROWBUDDY_QA_A11Y_METHOD === name);
assert(methods.length, 'Unknown accessibility method');
const results = [];
let failure, restored = false;
try {
  for (const item of cases) {
    await shell('am', 'force-stop', 'in.borrowbuddy.android');
    await shell('wm', 'size', item.size); await shell('wm', 'density', '160');
    await shell('settings', 'put', 'system', 'font_scale', item.font);
    assert((await shell('pm', 'clear', '--user', '0', 'in.borrowbuddy.android')).includes('Success'));
    const report = await execute(['shell', 'am', 'instrument', '--user', '0', '-w', '-r', '-e', 'class', methods.map(name => `in.borrowbuddy.android.${testClass}#${name}`).join(','), 'in.borrowbuddy.android.test/androidx.test.runner.AndroidJUnitRunner'], 360000);
    const output = report.stdout + report.stderr;
    const stem = `${prefix}-${item.name}-${run}`;
    await writeFile(`${dir}/${stem}.txt`, output);
    let passed = report.code === 0 && output.includes(`OK (${methods.length} test${methods.length === 1 ? '' : 's'})`) && !/INSTRUMENTATION_STATUS_CODE: -[1234]/.test(output);
    const captures = [];
    for (const method of methods) {
      const image = await execute(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', `files/${prefix}-${method}.png`], 15000, true);
      if (image.code === 0 && image.stdout.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
        const name = `${stem}-${method}.png`; await writeFile(`${dir}/${name}`, image.stdout); captures.push(name);
      } else passed = false;
      const data = await execute(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', `files/${prefix}-${method}.json`]);
      if (data.code === 0) {
        try {
          const evidence = JSON.parse(data.stdout);
          // Prove real Android font settings reached the activity; a test-local scale is insufficient.
          assert.equal(evidence.systemFontScale, Number(item.font));
          assert.equal(evidence.widthPixels, Number(item.size.split('x')[0]));
          await writeFile(`${dir}/${stem}-${method}.json`, JSON.stringify(evidence, null, 2));
        } catch (error) {
          passed = false;
          await writeFile(`${dir}/${stem}-${method}-evidence-rejected.txt`, `${error.message}\n${data.stdout}`);
        }
      } else passed = false;
    }
    if (methods.includes('confirmationKeepsBothActionsReachableAtLargeText')) {
      const image = await execute(['exec-out', 'run-as', 'in.borrowbuddy.android', 'cat', 'files/parity-a11y-confirmation-open.png'], 15000, true);
      if (image.code === 0 && image.stdout.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
        const name = `${stem}-confirmation-open.png`; await writeFile(`${dir}/${name}`, image.stdout); captures.push(name);
      } else passed = false;
    }
    results.push({ ...item, passed, report: `${stem}.txt`, captures });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${item.name}: ${methods.length} native visual/accessibility scenarios`);
  }
} catch (error) { failure = error; console.error(error.stack); }
finally {
  try {
    await shell('am', 'force-stop', 'in.borrowbuddy.android');
    await shell('wm', 'size', original.size ?? 'reset'); await shell('wm', 'density', original.density ?? 'reset');
    if (original.font === 'null') await shell('settings', 'delete', 'system', 'font_scale');
    else await shell('settings', 'put', 'system', 'font_scale', original.font);
    restored = true;
  } catch (error) { failure ??= error; }
  const passed = !failure && restored && results.length === cases.length && results.every(result => result.passed);
  await writeFile(`${dir}/${prefix}-result-${run}.json`, JSON.stringify({ run, suite, passed, focused: cases.length !== (suite === 'header' ? 8 : 6) || methods.length !== (suite === 'header' ? 3 : 4), results, restored, failure: failure?.message, productionReady: false }, null, 2));
  console.log(`Evidence: ${prefix}-result-${run}.json`);
  if (!passed) process.exitCode = 1;
}
